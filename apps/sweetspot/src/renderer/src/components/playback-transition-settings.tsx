import { useId } from "react";
import {
  DEFAULT_PLAYBACK_TRANSITIONS,
  PLAYBACK_TRANSITIONS_SETTING,
  readPlaybackTransitions,
  type PlaybackTransitions,
} from "@shared/playback-transitions";
import { useSettingsState } from "@/hooks/use-settings";
import { Field, FieldContent, FieldDescription, FieldLabel } from "./ui/field";
import { Switch } from "./ui/switch";

export function PlaybackTransitionSettings() {
  const id = useId();
  const [raw, setValue, { isPending }] = useSettingsState<PlaybackTransitions>(
    PLAYBACK_TRANSITIONS_SETTING,
    DEFAULT_PLAYBACK_TRANSITIONS,
  );
  const value = readPlaybackTransitions(raw);
  const update = (patch: Partial<PlaybackTransitions>) =>
    setValue((old) => ({ ...readPlaybackTransitions(old), ...patch }));
  return (
    <>
      <Field orientation="horizontal" className="-mx-2 items-start rounded-lg px-2 py-2">
        <FieldContent>
          <FieldLabel id={`${id}-smooth-label`} htmlFor={`${id}-smooth`}>
            Smooth play and pause
          </FieldLabel>
          <FieldDescription id={`${id}-smooth-desc`}>
            Briefly fade sound in and out to soften sudden starts and stops. Applies to playback on
            this computer.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${id}-smooth`}
          aria-labelledby={`${id}-smooth-label`}
          aria-describedby={`${id}-smooth-desc`}
          checked={value.smoothPlayPause}
          disabled={isPending}
          onCheckedChange={(smoothPlayPause) => update({ smoothPlayPause })}
        />
      </Field>
      <Field orientation="horizontal" className="-mx-2 items-start rounded-lg px-2 py-2">
        <FieldContent>
          <FieldLabel id={`${id}-songs-label`} htmlFor={`${id}-songs`}>
            Song fades
          </FieldLabel>
          <FieldDescription id={`${id}-songs-desc`}>
            Fade out at the end of a song and fade in the next. Songs play sequentially; loading
            gaps may remain. Applies on this computer.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${id}-songs`}
          aria-labelledby={`${id}-songs-label`}
          aria-describedby={`${id}-songs-desc`}
          checked={value.songFades}
          disabled={isPending}
          onCheckedChange={(songFades) => update({ songFades })}
        />
      </Field>
      {value.songFades && (
        <Field>
          <FieldLabel htmlFor={`${id}-duration`}>
            Song fade duration{" "}
            <span className="ml-auto text-muted-foreground">
              {value.songFadeSeconds} {value.songFadeSeconds === 1 ? "second" : "seconds"}
            </span>
          </FieldLabel>
          <input
            id={`${id}-duration`}
            aria-label="Song fade duration"
            aria-valuetext={`${value.songFadeSeconds} seconds`}
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={value.songFadeSeconds}
            disabled={isPending}
            className="w-full accent-primary"
            onChange={(event) => update({ songFadeSeconds: Number(event.target.value) })}
          />
          <FieldDescription>
            Short fades preserve more of the beginning and ending. Skips use a quick fade to stay
            responsive.
          </FieldDescription>
        </Field>
      )}
    </>
  );
}
