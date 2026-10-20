import { HoverTooltip } from "@/components/ui/tooltip";
import { SettingSpecimen } from "./setting-specimen";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { settingDefaults, type SkinPackage, type SkinValues } from "@shared/skins/schema";
import { trpc } from "@/lib/trpc";
export function SkinSettings({
  skin,
  values,
  onPreview,
  onClose,
  onSaved,
}: {
  skin: SkinPackage;
  values: SkinValues;
  onPreview: (values: SkinValues) => void;
  onClose: () => void;
  onSaved: (values: SkinValues) => void;
}) {
  const controlId = useId();
  const [draft, setDraft] = useState(values),
    [error, setError] = useState("");
  const defaults = settingDefaults(skin);
  const dirty = skin.settings.some((s) => draft[s.key] !== values[s.key]);
  const save = trpc.player.preferences.useMutation();
  const change = (key: string, value: string | number | boolean) => {
    setError("");
    const next = { ...draft, [key]: value };
    setDraft(next);
    onPreview(next);
  };
  return (
    <section className="skin-settings" aria-label={`${skin.name} settings`}>
      <header>
        <h2>{skin.name} settings</h2>
        <HoverTooltip content="Close settings">
          <button
            type="button"
            aria-label="Close skin settings"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </HoverTooltip>
      </header>
      <p className="settings-help">
        Start with the recommended look, or compare variations below. Apply saves your choices for{" "}
        {skin.name}.
      </p>
      {["style", "features"]
        .filter((group) => skin.settings.some((s) => s.group === group))
        .map((group) => (
          <fieldset key={group} disabled={save.isLoading}>
            <legend>{group === "style" ? "Appearance" : "Panels & player features"}</legend>
            {skin.settings
              .filter((s) => s.group === group)
              .map((s) => (
                <div key={s.key} className="skin-setting" data-type={s.type}>
                  <label htmlFor={`${controlId}-${s.key}`}>{s.label}</label>
                  {s.type === "boolean" ? (
                    <input
                      id={`${controlId}-${s.key}`}
                      role="switch"
                      aria-describedby={`${controlId}-${s.key}-help`}
                      type="checkbox"
                      checked={draft[s.key] === true}
                      onChange={(e) => change(s.key, e.target.checked)}
                    />
                  ) : s.type === "color" ? (
                    <span className="setting-color">
                      <span className="setting-swatches" aria-label="Suggested accents">
                        {[
                          ...new Set([
                            String(s.default),
                            ...(skin.theme.finish === "paper"
                              ? ["#9b563b", "#526c55", "#586d8a"]
                              : ["#b8c9e0", "#b9d5be", "#ead5ef", "#e5bc95"]),
                          ]),
                        ].map((color) => (
                          <button
                            key={color}
                            type="button"
                            className="setting-swatch"
                            style={{ background: color }}
                            aria-label={`Accent ${color}${color === s.default ? ", recommended" : ""}`}
                            aria-pressed={draft[s.key] === color}
                            onClick={() => change(s.key, color)}
                          />
                        ))}
                      </span>
                      <input
                        id={`${controlId}-${s.key}`}
                        aria-describedby={`${controlId}-${s.key}-help`}
                        type="color"
                        value={String(draft[s.key])}
                        onChange={(e) => change(s.key, e.target.value)}
                      />
                      <output>{String(draft[s.key]).toUpperCase()}</output>
                    </span>
                  ) : s.type === "range" ? (
                    <span className="setting-range">
                      <input
                        id={`${controlId}-${s.key}`}
                        aria-describedby={`${controlId}-${s.key}-help`}
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={Number(draft[s.key])}
                        onChange={(e) => change(s.key, Number(e.target.value))}
                      />
                      <output>
                        {draft[s.key]}
                        {s.target === "radius" ? " px" : "%"}
                      </output>
                      <button
                        type="button"
                        className="setting-recommendation"
                        onClick={() => change(s.key, s.default)}
                      >
                        Recommended · {s.default}
                        {s.target === "radius" ? " px" : "%"}
                      </button>
                    </span>
                  ) : (
                    <fieldset
                      className="setting-options"
                      aria-label={s.label}
                      aria-describedby={`${controlId}-${s.key}-help`}
                    >
                      {s.options.map((o, index) => (
                        <label
                          key={o.value}
                          data-selected={draft[s.key] === o.value}
                          data-recommended={o.value === s.default ? "Recommended" : undefined}
                        >
                          <input
                            id={index === 0 ? `${controlId}-${s.key}` : undefined}
                            type="radio"
                            name={`${controlId}-${s.key}`}
                            aria-label={`${o.label}${o.value === s.default ? ", recommended" : ""}`}
                            value={o.value}
                            checked={draft[s.key] === o.value}
                            onChange={() => change(s.key, o.value)}
                          />
                          <SettingSpecimen
                            skin={skin}
                            values={draft}
                            target={s.target}
                            value={o.value}
                          />
                          <span>{o.label}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <small id={`${controlId}-${s.key}-help`}>{s.description}</small>
                </div>
              ))}
          </fieldset>
        ))}
      <p className="settings-state" role="status">
        {dirty ? "Unsaved changes · previewing your edits" : "Saved look"}
      </p>
      <div className="settings-actions">
        <button
          type="button"
          disabled={save.isLoading || !dirty}
          onClick={() =>
            void save
              .mutateAsync({ id: skin.id, values: draft })
              .then(() => onSaved(draft))
              .catch((e) => setError(e.message))
          }
        >
          {save.isLoading ? "Applying…" : "Apply"}
        </button>
        <button type="button" disabled={save.isLoading} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={save.isLoading}
          onClick={() => {
            setDraft(defaults);
            onPreview(defaults);
          }}
        >
          Reset to defaults
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
