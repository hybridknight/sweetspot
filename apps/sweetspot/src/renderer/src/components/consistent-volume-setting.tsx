import { STABLE_VOLUME_SETTING } from "@shared/stable-volume";
import { SettingsCheckbox } from "./settings-checkbox";

export function ConsistentVolumeSetting() {
  return (
    <SettingsCheckbox
      configKey={STABLE_VOLUME_SETTING}
      defaultValue={true}
      description="Gently reduces loud passages for more consistent listening. Applies immediately to playback on this computer, including with the equalizer off."
    >
      Consistent volume
    </SettingsCheckbox>
  );
}
