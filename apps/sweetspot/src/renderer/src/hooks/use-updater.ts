import type { ProgressInfo, UpdateInfo, UpdateStatus } from "@shared/utils/updater";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * App updater via tRPC: update info, progress, check / install / cancel.
 */
export function useUpdater() {
	const utils = trpc.useUtils();
	const isMacOS = window.api.platform.isMacOS;
	const { data: downloadTarget } = trpc.update.downloadTarget.useQuery();
	const dmgMutation = trpc.update.downloadDmg.useMutation();
	const { data: updateInfo = null } = trpc.update.get.useQuery();
	const { data: downloaded = false } = trpc.update.downloaded.useQuery();
	const { data: progress = null } = trpc.update.progress.useQuery();
	const { data: checking = false } = trpc.update.checking.useQuery();

	useEffect(() => { dmgMutation.reset(); }, [updateInfo?.version]);

	const checkMutation = trpc.update.check.useMutation({
		onSuccess: (info) => {
			if (!info) toast.success("You're up to date", { description: "You're using the latest version available for your update channel." });
		},
		onError: () => toast.error("Could not check for updates. Please try again."),
	});
	const installMutation = trpc.update.install.useMutation();
	const cancelMutation = trpc.update.cancel.useMutation();
	const dismissMutation = trpc.update.dismiss.useMutation();

	trpc.update.onUpdate.useSubscription(undefined, {
		onData: (info) => utils.update.get.setData(undefined, (info as UpdateInfo | null) ?? null),
	});
	trpc.update.onChecking.useSubscription(undefined, {
		onData: (isChecking) => utils.update.checking.setData(undefined, !!isChecking),
	});
	trpc.update.onProgress.useSubscription(undefined, {
		onData: (next) => utils.update.progress.setData(undefined, (next as ProgressInfo | null) ?? null),
	});
	trpc.update.onDownloaded.useSubscription(undefined, {
		onData: (info) => {
			utils.update.downloaded.setData(undefined, !isMacOS && !!info);
			utils.update.progress.setData(undefined, null);
			if (info) utils.update.get.setData(undefined, info as UpdateInfo);
		},
	});

	const check = useCallback(
		(showDialog = true) => {
			if (checking || checkMutation.isLoading) return Promise.resolve(null);
			return checkMutation.mutateAsync({ showDialog }).catch(() => null);
		},
		[checking, checkMutation],
	);

	const install = useCallback((quitAndInstall = true) => isMacOS
		? dmgMutation.mutateAsync().then(() => true)
		: installMutation.mutateAsync(quitAndInstall), [isMacOS, dmgMutation, installMutation]);

	const cancel = useCallback(() => cancelMutation.mutateAsync(), [cancelMutation]);

	/** Dismiss update dialog until next app launch (Later). */
	const dismiss = useCallback(() => dismissMutation.mutateAsync(), [dismissMutation]);

	/** Check for updates, or install if already downloaded. */
	const runUpdate = useCallback(() => {
		if (downloaded) return install(true);
		return check(true);
	}, [downloaded, install, check]);

	const installing = !isMacOS && installMutation.isLoading;
	const isPending = checking || checkMutation.isLoading || installing || dmgMutation.isLoading;

	const status = useMemo<UpdateStatus>(() => {
		if (installing) return "installing";
		if (checking || checkMutation.isLoading) return "checking";
		if (progress && !downloaded) return "downloading";
		if (downloaded && updateInfo) return "ready";
		if (updateInfo) return "available";
		return "idle";
	}, [installing, checking, checkMutation.isLoading, progress, downloaded, updateInfo]);

	return {
		downloadTarget,
		openingDownload: dmgMutation.isLoading,
		downloadOpened: dmgMutation.data?.kind,
		downloadError: dmgMutation.error?.message,
		downloadDmg: () => dmgMutation.mutate(),
		updateInfo: updateInfo as UpdateInfo | null,
		downloaded,
		progress: progress as ProgressInfo | null,
		checking: checking || checkMutation.isLoading,
		installing,
		isPending,
		status,
		check,
		install,
		cancel,
		dismiss,
		runUpdate,
	};
}
