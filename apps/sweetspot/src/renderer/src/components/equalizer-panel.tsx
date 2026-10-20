import { HoverTooltip } from "@/components/ui/tooltip";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BUILTIN_EQ_PRESETS,
  defaultEqSettings,
  EQ_LABELS,
  EQ_FREQUENCIES,
  eqFrequencyGrid,
  eqHeadroomDb,
  eqResponseDb,
  matchingEqPreset,
  readEqSettings,
  type EqPlayback,
  type EqPreset,
  type EqSettings,
} from "@shared/equalizer";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const signedDb = (gain: number) => `${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB`;

function ResponseCurve({
  gains,
  sampleRate,
  attenuation,
}: {
  gains: number[];
  sampleRate: number;
  attenuation: number;
}) {
  const frequencies = useMemo(() => eqFrequencyGrid(sampleRate, 256), [sampleRate]);
  const response = useMemo(
    () => eqResponseDb(gains, sampleRate, frequencies),
    [gains, sampleRate, frequencies],
  );
  const extent = Math.max(
    12,
    Math.ceil(Math.max(...response.map((db) => Math.abs(db + attenuation))) / 6) * 6,
  );
  const path = response
    .map(
      (db, i) =>
        `${i ? "L" : "M"}${40 + (i / (response.length - 1)) * 620},${80 - ((db + attenuation) * 60) / extent}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 680 170"
      fill="currentColor"
      role="img"
      aria-label="Equalizer frequency response including automatic level reduction"
      className="w-full rounded-lg border bg-muted/20 text-muted-foreground"
    >
      {[-extent, 0, extent].map((db) => (
        <g key={db}>
          <line
            x1="40"
            x2="660"
            y1={80 - (db * 60) / extent}
            y2={80 - (db * 60) / extent}
            stroke="currentColor"
            opacity={db === 0 ? 0.4 : 0.15}
          />
          <text x="5" y={84 - (db * 60) / extent} fontSize="10">
            {db > 0 ? "+" : ""}
            {db} dB
          </text>
        </g>
      ))}
      {[31, 125, 500, 2000, 8000, 16000]
        .filter((f) => f < sampleRate / 2)
        .map((f) => (
          <text
            key={f}
            x={40 + (Math.log(f / 20) / Math.log(frequencies[frequencies.length - 1] / 20)) * 620}
            y="153"
            fontSize="10"
            textAnchor="middle"
          >
            {f >= 1000 ? `${f / 1000}k` : f} Hz
          </text>
        ))}
      <path d={path} fill="none" stroke="var(--primary, #60a5fa)" strokeWidth="2.5" />
    </svg>
  );
}

function GainInput({
  gain,
  label,
  disabled,
  onGain,
}: {
  gain: number;
  label: string;
  disabled: boolean;
  onGain: (gain: number) => void;
}) {
  const [draft, setDraft] = useState(String(gain));
  useEffect(() => setDraft(String(gain)), [gain]);
  return (
    <input
      type="number"
      min="-12"
      max="12"
      step="0.1"
      aria-label={`${label} Hz gain in decibels`}
      value={draft}
      disabled={disabled}
      className="h-8 w-16 rounded border bg-background px-1 text-center text-xs min-[540px]:w-full"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={() => {
        const value = draft.trim() ? Number(draft) : NaN;
        if (Number.isFinite(value) && value >= -12 && value <= 12) {
          onGain(value);
          setDraft(String(value));
        } else setDraft(String(gain));
      }}
    />
  );
}

export function EqualizerPanel({ compact = false }: { compact?: boolean } = {}) {
  const id = useId();
  const utils = trpc.useUtils();
  const queryInput = { key: "equalizer" };
  const query = trpc.settings.get.useQuery(queryInput);
  const status = trpc.equalizer.status.useQuery(undefined, { refetchInterval: 2000 });
  const commit = trpc.equalizer.commit.useMutation();
  const preview = trpc.equalizer.preview.useMutation();
  const save = trpc.equalizer.savePreset.useMutation();
  const rename = trpc.equalizer.renamePreset.useMutation();
  const remove = trpc.equalizer.deletePreset.useMutation();
  const [config, setConfig] = useState<EqSettings>(defaultEqSettings);
  const configRef = useRef(config);
  const dirty = useRef(false);
  const pendingWrites = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [targetId, setTargetId] = useState<string | null | undefined>();
  const [renameMode, setRenameMode] = useState(false);
  const [deleted, setDeleted] = useState<EqPreset>();
  const [busy, setBusy] = useState(false);
  const mutationRef = useRef({ commit: commit.mutateAsync, preview: preview.mutateAsync });
  mutationRef.current = { commit: commit.mutateAsync, preview: preview.mutateAsync };

  function adopt(raw: unknown) {
    const saved = readEqSettings(raw);
    const next =
      dirty.current || pendingWrites.current > 0
        ? { ...configRef.current, presets: saved.presets }
        : saved;
    configRef.current = next;
    setConfig(next);
  }
  useEffect(() => {
    if (query.isSuccess) adopt(query.data);
  }, [query.data, query.isSuccess]);
  trpc.settings.onChange.useSubscription(undefined, {
    onData: (event) => {
      if (event.key === "equalizer") {
        utils.settings.get.setData(queryInput, event.value);
        adopt(event.value);
      }
    },
  });

  function flushCommit(): Promise<unknown> {
    clearTimeout(commitTimer.current);
    if (!dirty.current) return writeQueue.current;
    const snapshot = configRef.current;
    dirty.current = false;
    pendingWrites.current++;
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(() => mutationRef.current.commit(snapshot))
      .catch((err: Error) => {
        dirty.current = true;
        setError(`Could not save equalizer: ${err.message}`);
        throw err;
      })
      .finally(() => {
        pendingWrites.current--;
      });
    return writeQueue.current;
  }
  useEffect(
    () => () => {
      clearTimeout(previewTimer.current);
      clearTimeout(commitTimer.current);
      void flushCommit().catch(() => undefined);
    },
    [],
  );

  function change(patch: Partial<EqPlayback>) {
    const next = { ...configRef.current, ...patch };
    configRef.current = next;
    dirty.current = true;
    setConfig(next);
    setError("");
    setNotice("");
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      void mutationRef.current
        .preview(next)
        .then((result) => utils.equalizer.status.setData(undefined, result))
        .catch(() => {
          // Durable settings still reach the plugin once the player finishes loading.
          void utils.equalizer.status.invalidate();
        });
    }, 60);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      void flushCommit().catch(() => undefined);
    }, 350);
  }

  const allPresets = [...BUILTIN_EQ_PRESETS, ...config.presets];
  const selectedCustom =
    targetId === undefined
      ? matchingEqPreset(config.gains, config.presets)
      : config.presets.find((preset) => preset.id === targetId);
  const matched = matchingEqPreset(
    config.gains,
    selectedCustom ? [selectedCustom, ...allPresets] : allPresets,
  );
  const sampleRate = status.data?.sampleRate ?? 48000;
  const attenuation = config.autoHeadroom ? eqHeadroomDb(config.gains, sampleRate) : 0;

  async function operation(action: () => Promise<EqSettings>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await flushCommit();
      const saved = await action();
      utils.settings.get.setData(queryInput, saved);
      adopt(saved);
      setNotice(message);
      setName("");
      setRenameMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save preset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="equalizer-panel" data-compact={compact}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Equalizer</h2>
          <p className="text-xs text-muted-foreground">
            Shape your sound. Presets are starting points for your ears and speakers.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm" htmlFor={`${id}-enabled`}>
          <Switch
            id={`${id}-enabled`}
            checked={config.enabled}
            disabled={!query.isSuccess || busy}
            onCheckedChange={(enabled) => change({ enabled })}
          />
          {config.enabled ? "On" : "Off"}
        </label>
      </div>
      {(!compact ||
        ["waiting", "unavailable", "cast", "suspended"].includes(
          status.data?.state ?? "waiting",
        )) && (
        <p role="status" className="text-xs text-muted-foreground">
          {status.data?.message ?? "Checking local playback…"}
        </p>
      )}
      <fieldset disabled={!query.isSuccess || busy} className="contents">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-44 flex-1 flex-col gap-1 text-xs" htmlFor={`${id}-preset`}>
            {compact ? <span className="sr-only">Preset</span> : "Preset"}
            <select
              id={`${id}-preset`}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={matched?.id ?? "custom"}
              onChange={(event) => {
                const preset = allPresets.find((item) => item.id === event.target.value);
                if (preset) {
                  setTargetId(config.presets.some((p) => p.id === preset.id) ? preset.id : null);
                  setRenameMode(false);
                  setName("");
                  change({ gains: [...preset.gains] });
                }
              }}
            >
              <option value="custom" disabled>
                Custom curve
              </option>
              <optgroup label="Built-in">
                {BUILTIN_EQ_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
              {config.presets.length > 0 && (
                <optgroup label="Your presets">
                  {config.presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <HoverTooltip content="Reset all bands to 0 dB">
            <Button
              variant="outline"
              aria-label="Reset equalizer to flat"
              onClick={() => {
                setTargetId(null);
                change({ gains: Array(10).fill(0) });
              }}
            >
              {compact ? "Flat" : "Reset to flat"}
            </Button>
          </HoverTooltip>
        </div>
        {!compact && (
          <ResponseCurve gains={config.gains} sampleRate={sampleRate} attenuation={attenuation} />
        )}
        <p className="text-xs text-muted-foreground">Band gain in dB · −12 to +12</p>
        <div className="grid grid-cols-1 gap-3 min-[540px]:grid-cols-10 min-[540px]:gap-1">
          {config.gains.map((gain, index) => (
            <div key={index} className="flex items-center gap-2 min-[540px]:flex-col">
              <label htmlFor={`${id}-band-${index}`} className="w-12 shrink-0 text-center text-xs">
                {EQ_LABELS[index]}
                <span className="sr-only"> Hz</span>
              </label>
              <div className={compact ? "eq-fader" : "contents"}>
                {compact && (
                  <svg viewBox="0 0 28 108" className="eq-fader-art" aria-hidden="true">
                    <rect x="11" y="7" width="6" height="94" rx="2" fill="var(--skin-border)" />
                    <path d="M14 9V99" stroke="var(--skin-muted)" strokeWidth="1" opacity=".6" />
                    {Array.from({ length: 13 }, (_, tick) => (
                      <path key={tick} d={`M3 ${8 + tick * 92 / 12}H8 M20 ${8 + tick * 92 / 12}H25`}
                        stroke="var(--skin-muted)" strokeWidth={tick === 6 ? 1.5 : 1} opacity={tick === 6 ? 1 : .4} />
                    ))}
                    <rect
                      x="2"
                      y={8 + ((12 - gain) / 24) * 92 - 5}
                      width="24"
                      height="10"
                      rx="2"
                      className="eq-fader-thumb"
                      fill="var(--skin-accent)"
                      stroke="var(--skin-border)"
                    />
                    <path d={`M4 ${8 + ((12 - gain) / 24) * 92 - 3} H24`} stroke="var(--skin-metal-top, var(--skin-text))" strokeWidth="1" />
                    <path
                      d={`M7 ${8 + ((12 - gain) / 24) * 92} H21`}
                      stroke="var(--skin-text)"
                      strokeWidth="1"
                    />
                  </svg>
                )}
                <input
                  id={`${id}-band-${index}`}
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={gain}
                  aria-valuetext={signedDb(gain)}
                  disabled={EQ_FREQUENCIES[index] >= sampleRate / 2}
                  className={`h-6 min-w-0 flex-1 accent-primary min-[540px]:h-36 min-[540px]:w-7 min-[540px]:flex-none min-[540px]:[writing-mode:vertical-lr] min-[540px]:[direction:rtl] ${compact ? "eq-native-fader" : ""}`}
                  onChange={(event) =>
                    change({
                      gains: config.gains.map((value, i) =>
                        i === index ? Number(event.target.value) : value,
                      ),
                    })
                  }
                  onPointerUp={() => {
                    void flushCommit().catch(() => undefined);
                  }}
                  onKeyUp={() => {
                    void flushCommit().catch(() => undefined);
                  }}
                />
              </div>
              <GainInput
                gain={gain}
                label={EQ_LABELS[index]}
                disabled={EQ_FREQUENCIES[index] >= sampleRate / 2}
                onGain={(value) =>
                  change({
                    gains: config.gains.map((current, i) => (i === index ? value : current)),
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="hidden justify-between text-[10px] text-muted-foreground min-[540px]:flex">
          <span>Bass</span>
          <span>Midrange</span>
          <span>Treble</span>
        </div>
        <details open={!compact} className="eq-advanced">
          <summary className={compact ? "" : "hidden"}>Headroom and saved presets</summary>
          <div className="rounded-lg border p-3">
            <label
              className="flex items-center justify-between gap-3 text-xs"
              htmlFor={`${id}-headroom`}
            >
              <span>Reduce clipping automatically</span>
              <Switch
                id={`${id}-headroom`}
                checked={config.autoHeadroom}
                onCheckedChange={(autoHeadroom) => change({ autoHeadroom })}
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              {config.autoHeadroom
                ? `Curve level: ${signedDb(attenuation)}. Boosting bands may lower the overall volume to reduce distortion.`
                : "Boosting bands may cause distortion. Lower the band gains if you hear clipping."}
            </p>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void operation(
                async () => {
                  if (renameMode && selectedCustom)
                    return rename.mutateAsync({ id: selectedCustom.id, name });
                  const saved = await save.mutateAsync({ name, gains: configRef.current.gains });
                  setTargetId(saved.presets[saved.presets.length - 1]?.id);
                  return saved;
                },
                renameMode ? "Preset renamed." : "Preset saved.",
              );
            }}
          >
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs" htmlFor={`${id}-name`}>
              {renameMode ? "Rename preset" : "Save your curve"}
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={60}
                placeholder="Preset name"
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={!name.trim()}>
              {renameMode ? "Rename" : "Save new preset"}
            </Button>
            {renameMode && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRenameMode(false);
                  setName("");
                }}
              >
                Cancel
              </Button>
            )}
          </form>
          {selectedCustom && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  void operation(
                    () =>
                      save.mutateAsync({
                        name: selectedCustom.name,
                        gains: configRef.current.gains,
                        replaceId: selectedCustom.id,
                      }),
                    "Preset updated.",
                  )
                }
              >
                Update “{selectedCustom.name}”
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRenameMode(true);
                  setName(selectedCustom.name);
                }}
              >
                Rename
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void operation(async () => {
                    const next = await remove.mutateAsync({ id: selectedCustom.id });
                    setDeleted(selectedCustom);
                    setTargetId(undefined);
                    return next;
                  }, "Preset deleted. Your current curve is unchanged.")
                }
              >
                Delete
              </Button>
            </div>
          )}
          {deleted && (
            <Button
              variant="outline"
              onClick={() =>
                void operation(async () => {
                  const next = await save.mutateAsync({ name: deleted.name, gains: deleted.gains });
                  setDeleted(undefined);
                  return next;
                }, "Preset restored.")
              }
            >
              Undo deletion of “{deleted.name}”
            </Button>
          )}
        </details>
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
