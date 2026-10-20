import {
  DEFAULT_PLAYBACK_TRANSITIONS,
  type PlaybackTransitions,
} from "@shared/playback-transitions";

type Envelope = { value: number; target: number; start: number; end: number };
const envelopes = new WeakMap<AudioParam, Envelope>();

export function setFadeGain(param: AudioParam, now: number, value: number): void {
  param.cancelAndHoldAtTime(now);
  param.setValueAtTime(value, now);
  envelopes.set(param, { value, target: value, start: now, end: now });
}

export function fadeGain(
  param: AudioParam,
  now: number,
  target: number,
  seconds: number,
  delay = 0,
): void {
  const old = envelopes.get(param);
  // Read our envelope at the audio clock, not the previous render quantum's AudioParam.value.
  const value = old
    ? now >= old.end
      ? old.target
      : now <= old.start
        ? old.value
        : old.value + ((old.target - old.value) * (now - old.start)) / (old.end - old.start)
    : param.value;
  const start = now + delay;
  const end = start + seconds;
  if (seconds === 0 && delay === 0) {
    setFadeGain(param, now, target);
    return;
  }
  setFadeGain(param, now, value);
  if (delay > 0) param.setValueAtTime(value, start);
  param.linearRampToValueAtTime(target, end);
  envelopes.set(param, { value, target, start, end });
}

type Pending = {
  kind: "pause" | "skip";
  timer: ReturnType<typeof setTimeout>;
  execute: () => void;
  cancel: () => void;
};
type Handoff = { source: string; timer: ReturnType<typeof setTimeout> };

/** A separate final gain: transport fades never change the volume slider or compressor detector. */
export class PlaybackFades {
  readonly gain: GainNode;
  private config: PlaybackTransitions = { ...DEFAULT_PLAYBACK_TRANSITIONS };
  private media?: HTMLMediaElement;
  private pending?: Pending;
  private handoff?: Handoff;
  private armed = false;
  private newSong = false;
  private endTime?: number;
  private riseEnd = 0;
  private bypassed = false;

  constructor(private context: AudioContext) {
    this.gain = context.createGain();
  }

  get enabled(): boolean {
    return !this.bypassed && (this.config.smoothPlayPause || this.config.songFades);
  }
  get pendingPause(): boolean {
    return this.pending?.kind === "pause";
  }

  bind(media: HTMLMediaElement): void {
    if (this.media === media) return;
    this.detach();
    this.media = media;
    for (const event of [
      "play",
      "playing",
      "pause",
      "ended",
      "loadstart",
      "emptied",
      "waiting",
      "seeking",
      "seeked",
      "durationchange",
      "ratechange",
      "timeupdate",
    ])
      media.addEventListener(event, this.onEvent);
    // Never dip already audible playback when the graph first attaches.
    this.armed = media.paused && this.enabled;
    this.newSong = media.paused && media.currentTime < 0.1;
    setFadeGain(this.gain.gain, this.context.currentTime, this.armed ? 0 : 1);
    this.scheduleEnd();
  }

  configure(config: PlaybackTransitions, bypassed = false): void {
    this.config = config;
    this.bypassed = bypassed;
    this.endTime = undefined;
    // Turning processing off must still complete an explicitly requested pause/skip.
    if (!this.enabled && this.pending) this.finishPending();
    if (!this.enabled) this.clearHandoff();
    if (this.handoff) return;
    if (this.pending) return;
    this.riseEnd = 0;
    const target = this.enabled && this.media?.paused ? 0 : 1;
    fadeGain(this.gain.gain, this.context.currentTime, target, 0.03);
    this.armed = this.enabled && !!this.media?.paused;
    if (!this.pending) this.scheduleEnd();
  }

  run(kind: "play" | "pause" | "skip", action: () => unknown): Promise<unknown> {
    this.cancelPending();
    this.endTime = undefined;
    const media = this.media;
    if (!this.enabled || !media || !media.isConnected || this.context.state !== "running") {
      this.clearHandoff();
      fadeGain(this.gain.gain, this.context.currentTime, 1, 0.01);
      return Promise.resolve().then(action);
    }
    if (kind === "play") {
      // A resume request cannot make the outgoing source audible during a skip.
      if (this.handoff) return Promise.resolve().then(action);
      if (media.paused) {
        this.armed = this.config.smoothPlayPause || (this.newSong && this.config.songFades);
        setFadeGain(this.gain.gain, this.context.currentTime, this.armed ? 0 : 1);
      } else {
        this.armed = false;
        fadeGain(
          this.gain.gain,
          this.context.currentTime,
          1,
          this.config.smoothPlayPause ? 0.1 : 0,
        );
      }
      return Promise.resolve().then(action);
    }
    if (kind === "pause") this.clearHandoff();
    if (kind === "pause" && !this.config.smoothPlayPause) return Promise.resolve().then(action);
    if (media.paused || media.ended || media.readyState < 2)
      return kind === "skip" ? this.executeSkip(action) : Promise.resolve().then(action);
    const duration = kind === "pause" ? 0.07 : 0.12;
    const end = this.context.currentTime + duration;
    const deadline = performance.now() + 250;
    fadeGain(this.gain.gain, this.context.currentTime, 0, duration);
    return new Promise((resolve, reject) => {
      const execute = () => {
        if (kind === "skip") {
          this.executeSkip(action).then(resolve, reject);
          return;
        }
        try {
          Promise.resolve(action()).then(resolve, (error) => {
            fadeGain(this.gain.gain, this.context.currentTime, 1, 0.03);
            reject(error);
          });
        } catch (error) {
          fadeGain(this.gain.gain, this.context.currentTime, 1, 0.03);
          reject(error);
        }
      };
      const tick = () => {
        if (!this.pending) return;
        if (
          this.context.state === "running" &&
          this.context.currentTime < end &&
          performance.now() < deadline
        ) {
          this.pending!.timer = setTimeout(tick, 10);
          return;
        }
        this.finishPending();
      };
      this.pending = {
        kind,
        timer: setTimeout(tick, duration * 1000 + 10),
        execute,
        cancel: () => resolve({ cancelled: true }),
      };
    });
  }

  private executeSkip(action: () => unknown): Promise<unknown> {
    this.clearHandoff();
    this.newSong = true;
    this.armed = true;
    this.riseEnd = 0;
    setFadeGain(this.gain.gain, this.context.currentTime, 0);
    const handoff: Handoff = {
      source: this.media!.currentSrc,
      // A no-op (for example, Next at the end of a queue) must not leave sound muted.
      timer: setTimeout(() => this.recoverHandoff(handoff), 2000),
    };
    this.handoff = handoff;
    return Promise.resolve()
      .then(action)
      .catch((error) => {
        this.recoverHandoff(handoff);
        throw error;
      });
  }

  private clearHandoff(): void {
    if (this.handoff) clearTimeout(this.handoff.timer);
    this.handoff = undefined;
  }

  private recoverHandoff(handoff: Handoff): void {
    if (this.handoff !== handoff) return;
    this.clearHandoff();
    this.newSong = false;
    if (this.media && !this.media.paused && !this.media.ended) this.start();
  }

  private finishPending(): void {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.execute();
  }

  private cancelPending(): void {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.cancel();
  }

  private start(): void {
    if (!this.armed || !this.enabled || this.handoff || this.pending?.kind === "skip") return;
    this.armed = false;
    const seconds =
      this.newSong && this.config.songFades
        ? this.songDuration()
        : this.config.smoothPlayPause
          ? 0.1
          : 0;
    this.newSong = false;
    this.riseEnd = this.context.currentTime + seconds;
    fadeGain(this.gain.gain, this.context.currentTime, 1, seconds);
  }

  private songDuration(): number {
    const media = this.media;
    const length =
      media && Number.isFinite(media.duration) && media.duration > 0 && media.playbackRate > 0
        ? media.duration / media.playbackRate
        : Infinity;
    // Very short songs must retain an audible middle, rather than overlapping their own envelopes.
    return Math.min(this.config.songFadeSeconds, length / 3);
  }

  private onEvent = (event: Event): void => {
    const media = this.media!;
    const now = this.context.currentTime;
    if (this.handoff) {
      // Old-source progress/playing/buffering events can arrive after nextVideo returns.
      // Only a source load or a seek onto the replacement timeline releases the fade.
      if (
        event.type === "loadstart" ||
        event.type === "emptied" ||
        (event.type === "seeking" &&
          (media.currentSrc !== this.handoff.source || media.currentTime < 0.1))
      )
        this.clearHandoff();
      else return;
    }
    switch (event.type) {
      case "play":
        // The paused path was armed in advance; fade on actual playing, not while buffering.
        if (this.enabled && this.gain.gain.value === 0) this.armed = true;
        break;
      case "playing":
        this.start();
        this.scheduleEnd();
        break;
      case "pause":
      case "ended":
      case "loadstart":
      case "emptied":
        this.cancelPending();
        this.endTime = undefined;
        this.armed = this.enabled;
        if (event.type !== "pause") this.newSong = true;
        setFadeGain(this.gain.gain, now, this.enabled ? 0 : 1);
        break;
      case "waiting":
        this.endTime = undefined;
        this.armed = this.enabled;
        setFadeGain(this.gain.gain, now, this.enabled ? 0 : 1);
        break;
      case "seeking":
        this.cancelPending();
        this.endTime = undefined;
        this.newSong = media.currentTime < 0.1 && (this.newSong || media.loop);
        this.armed = this.enabled;
        fadeGain(this.gain.gain, now, this.enabled ? 0 : 1, 0.02);
        break;
      case "seeked":
        if (!media.paused) this.start();
        this.scheduleEnd();
        break;
      default:
        if (
          event.type === "timeupdate" &&
          this.armed &&
          !media.paused &&
          !media.seeking &&
          media.readyState >= 3
        )
          this.start();
        this.scheduleEnd();
    }
  };

  private scheduleEnd(): void {
    const media = this.media;
    if (
      !this.enabled ||
      !this.config.songFades ||
      !media ||
      media.paused ||
      media.seeking ||
      media.readyState < 3 ||
      this.pending ||
      this.handoff
    )
      return;
    if (!Number.isFinite(media.duration) || media.duration <= 0 || media.playbackRate <= 0) return;
    if (this.context.currentTime < this.riseEnd) return;
    // Browser looping should preserve continuous album/audio loops rather than adding a dip.
    if (media.loop) return;
    const remaining = (media.duration - media.currentTime) / media.playbackRate;
    if (remaining <= 0) return;
    const duration = this.songDuration();
    if (remaining > duration + 0.4) {
      if (this.endTime !== undefined) {
        this.endTime = undefined;
        fadeGain(this.gain.gain, this.context.currentTime, 1, 0.1);
      }
      return;
    }
    const now = this.context.currentTime;
    const end = now + remaining;
    if (this.endTime !== undefined && Math.abs(end - this.endTime) < 0.08) return;
    this.endTime = end;
    fadeGain(
      this.gain.gain,
      now,
      0,
      Math.min(remaining, duration),
      Math.max(0, remaining - duration),
    );
  }

  detach(): void {
    this.cancelPending();
    this.clearHandoff();
    if (this.media)
      for (const event of [
        "play",
        "playing",
        "pause",
        "ended",
        "loadstart",
        "emptied",
        "waiting",
        "seeking",
        "seeked",
        "durationchange",
        "ratechange",
        "timeupdate",
      ])
        this.media.removeEventListener(event, this.onEvent);
    this.media = undefined;
    this.endTime = undefined;
    this.riseEnd = 0;
    fadeGain(this.gain.gain, this.context.currentTime, 1, 0.03);
  }
}
