import { Check, ExternalLink } from "lucide-react";
import { SkinPreview } from "@/components/player/skin-preview";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SkinSettings } from "@/components/player/skin-settings";
import { resolveSkin } from "@shared/skins/builtins";
import { validateSkinValues, type SkinValues } from "@shared/skins/schema";
import "@/components/player/player.css";
export const Route = createFileRoute("/_settings/appearance/skins")({
  component: PlayerSkinSettingsPage,
});
export function PlayerSkinSettingsPage() {
  const utils = trpc.useUtils(),
    catalog = trpc.player.catalog.useQuery();
  const select = trpc.player.select.useMutation(),
    remove = trpc.player.removeSkin.useMutation(),
    preview = trpc.player.previewPreferences.useMutation(),
    enter = trpc.player.enter.useMutation();
  const [editing, setEditing] = useState(true),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<SkinValues | null>(null);
  const skin = resolveSkin(catalog.data?.selected ?? "", catalog.data?.custom ?? []);
  const savedValues = validateSkinValues(skin, catalog.data?.preferences[skin.id]);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(savedValues);
  trpc.player.onCatalog.useSubscription(undefined, {
    onData: (next) => utils.player.catalog.setData(undefined, next),
  });
  const clearPreview = () => {
    setDraft(null);
    void preview.mutateAsync(null).catch(() => {});
  };
  useEffect(() => {
    setEditing(true);
    return clearPreview;
  }, [skin.id]);
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      clearPreview();
      await action();
      await utils.player.catalog.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the skin.");
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Player skins</CardTitle>
        <CardDescription>
          Change the compact player’s appearance. Your full music library keeps its normal
          interface.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Choose a look for player mode. Your preferences are saved separately for each skin.
          </p>
        </div>
        {catalog.isLoading && <p role="status">Loading skins…</p>}
        {catalog.isError && (
          <p role="alert">
            Could not load skins.{" "}
            <Button variant="outline" onClick={() => void catalog.refetch()}>
              Try again
            </Button>
          </p>
        )}
        <fieldset className="skin-gallery" disabled={!catalog.data || select.isLoading || dirty}>
          <legend className="sr-only">Player skin</legend>
          {[...(catalog.data?.builtins ?? []), ...(catalog.data?.custom ?? [])].map((s) => (
            <label className="skin-choice" data-selected={s.id === skin.id} key={s.id}>
              <input
                type="radio"
                name="player-skin"
                value={s.id}
                checked={s.id === skin.id}
                aria-label={s.name}
                onChange={() => void run(() => select.mutateAsync(s.id))}
              />
              <div className="skin-choice-preview">
                <SkinPreview
                  skin={s}
                  values={validateSkinValues(s, catalog.data?.preferences[s.id])}
                />
              </div>
              <div className="skin-choice-caption">
                <span className="flex items-center justify-between gap-2">
                  <strong>{s.name}</strong>
                  {s.id === skin.id ? (
                    <span className="skin-in-use">
                      <Check size={12} /> In use
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {s.id.startsWith("builtin-") ? "Built-in" : "Imported"}
                    </span>
                  )}
                </span>
                <span className="skin-choice-description">{s.description}</span>
              </div>
            </label>
          ))}
        </fieldset>
        {dirty && (
          <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
            You have unsaved changes to {skin.name}. Apply or Cancel below before choosing another
            skin.
          </p>
        )}
        <div className="skin-customize-layout">
          <section className="skin-large-preview" aria-label="Selected skin preview">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{skin.name} preview</h2>
              <span className="text-xs text-muted-foreground">Sample content</span>
            </div>
            <div className="skin-large-preview-stage">
              <SkinPreview skin={skin} values={draft ?? savedValues} />
            </div>
            <p className="text-xs text-muted-foreground">
              Style and panel changes appear here as you adjust them. An open skin player previews
              them too.
            </p>
            <Button
              className="mt-3 w-full"
              variant="outline"
              disabled={enter.isLoading || !catalog.data}
              onClick={() => void enter.mutateAsync().catch((e) => setError(e.message))}
            >
              <ExternalLink size={14} /> Open player
            </Button>
          </section>
          <div className="appearance-skin-editor">
            {editing ? (
              <SkinSettings
                key={skin.id}
                skin={skin}
                values={savedValues}
                onPreview={(values: SkinValues) => {
                  setDraft(values);
                  void preview
                    .mutateAsync({ id: skin.id, values })
                    .catch((e) => setError(e.message));
                }}
                onClose={() => {
                  clearPreview();
                  setEditing(false);
                }}
                onSaved={() => {
                  clearPreview();
                  setEditing(false);
                  void utils.player.catalog.invalidate();
                }}
              />
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Customize {skin.name}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="mr-auto text-xs text-muted-foreground">
            {skin.id.startsWith("builtin-") ? "Built-in skin" : `By ${skin.author}`} · SVG graphics
          </span>

          {!skin.id.startsWith("builtin-") && (
            <Button
              variant="outline"
              disabled={dirty || remove.isLoading}
              onClick={() => void run(() => remove.mutateAsync(skin.id))}
            >
              Remove skin
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
