import { emptySpectrum, spectrumBands, type SpectrumFrame } from "@shared/skins/spectrum";
import {
  DEFAULT_PLAYBACK_TRANSITIONS,
  readPlaybackTransitions,
  type PlaybackTransitions,
} from "@shared/playback-transitions";
import { PlaybackFades } from "./playback-fades";
import {
  defaultEqSettings,
  EQ_FREQUENCIES,
  EQ_Q,
  eqHeadroomDb,
  eqPlaybackSchema,
  type EqPlayback,
  type EqStatus,
} from "@shared/equalizer";

import {
  createStableVolumeGraph,
  measureStableVolumeMakeup,
  type StableVolumeGraph,
} from "./stable-volume";

type Source = {
  analyser?: AnalyserNode;
  spectrumBins?: Uint8Array<ArrayBuffer>;
  fades: PlaybackFades;
  stable: StableVolumeGraph;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  filters: BiquadFilterNode[];
};

export function createEqualizerGraph(
  context: BaseAudioContext,
  config: EqPlayback = defaultEqSettings(),
  destination: AudioNode = context.destination,
) {
  const gain = context.createGain();
  gain.gain.value =
    config.enabled && config.autoHeadroom
      ? 10 ** (eqHeadroomDb(config.gains, context.sampleRate) / 20)
      : 1;
  const filters = EQ_FREQUENCIES.map((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = Math.min(frequency, (context.sampleRate / 2) * 0.999);
    filter.Q.value = EQ_Q;
    filter.gain.value =
      config.enabled && frequency < context.sampleRate / 2 ? config.gains[index] : 0;
    return filter;
  });
  gain.connect(filters[0]);
  filters.forEach((filter, i) => filter.connect(filters[i + 1] ?? destination));
  return { gain, filters };
}

export function canProcessMedia(media: HTMLMediaElement, origin: string): boolean {
  if (!media.currentSrc) return false;
  try {
    const url = new URL(media.currentSrc);
    return (
      url.protocol === "data:" ||
      url.origin === origin ||
      media.crossOrigin === "anonymous" ||
      media.crossOrigin === "use-credentials"
    );
  } catch {
    return false;
  }
}

/** A document owns this controller for its lifetime. Never recapture or close on bypass. */
export class EqualizerAudio {
  private context?: AudioContext;
  private sources = new WeakMap<HTMLMediaElement, Source>();
  private active?: Source;
  private media?: HTMLMediaElement;
  private config: EqPlayback = defaultEqSettings();
  private stableVolumeEnabled = true;
  private fadeConfig: PlaybackTransitions = { ...DEFAULT_PLAYBACK_TRANSITIONS };
  private makeup?: number;
  private preparing = false;
  private cast = false;
  private visualization = false;
  private failure = "";
  private transitionTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private resumePending = false;

  setConfig(raw: unknown): void {
    this.config = eqPlaybackSchema.parse(raw);
    this.apply();
  }

  setFadeConfig(raw: unknown): void {
    this.fadeConfig = readPlaybackTransitions(raw);
    this.active?.fades.configure(this.fadeConfig, this.cast);
  }

  get hasFadeProcessing(): boolean {
    return !this.cast && !!this.active?.fades.enabled && this.context?.state === "running";
  }

  get localPlaying(): boolean | undefined {
    return !this.cast && this.media?.isConnected
      ? !this.media.paused && !this.media.ended
      : undefined;
  }

  get pendingPause(): boolean {
    return this.active?.fades.pendingPause ?? false;
  }

  transport(kind: "play" | "pause" | "skip", action: () => unknown): Promise<unknown> {
    if (this.cast || !this.active) return Promise.resolve().then(action);
    return this.active.fades.run(kind, action);
  }

  setStableVolume(enabled: boolean): void {
    this.stableVolumeEnabled = enabled;
    this.updateStableVolume();
  }

  private updateStableVolume = (): void => {
    if (!this.active || !this.media) return;
    const volume = window.HTMLMediaElement_volume?.get.call(this.media) ?? this.media.volume;
    this.active.stable.update(this.stableVolumeEnabled && !this.cast, volume);
  };

  setCast(connected: boolean): void {
    this.cast = connected;
    this.active?.fades.configure(this.fadeConfig, connected);
    this.apply();
  }

  attach(media: HTMLMediaElement | null): void {
    if (
      !media ||
      media.readyState < 2 ||
      this.cast ||
      (!this.visualization &&
        !this.config.enabled &&
        !this.stableVolumeEnabled &&
        !this.fadeConfig.smoothPlayPause &&
        !this.fadeConfig.songFades)
    )
      return;
    if (this.media === media && this.active) {
      this.resume();
      this.attachAnalyser(this.active);
      this.active.fades.bind(media);
      this.updateStableVolume();
      return;
    }
    if (!canProcessMedia(media, location.origin)) {
      this.failure = "This audio source cannot be safely processed. Playback stays unchanged.";
      return;
    }
    try {
      // Resume before rerouting: do not capture a live element into a suspended context.
      this.context ??= new AudioContext();
      if (this.context.state !== "running") {
        this.resume(() => this.attach(media));
        return;
      }
      if (this.makeup === undefined) {
        if (!this.preparing) {
          this.preparing = true;
          void measureStableVolumeMakeup(this.context.sampleRate)
            .then((makeup) => {
              this.makeup = makeup;
              if (media.isConnected) this.attach(media);
            })
            .catch(() => {
              this.failure = "Audio processing could not initialize. Playback stays unchanged.";
            })
            .finally(() => {
              this.preparing = false;
            });
        }
        return;
      }
      let graph = this.sources.get(media);
      if (!graph) {
        const fades = new PlaybackFades(this.context);
        fades.configure(this.fadeConfig, this.cast);
        fades.gain.connect(this.context.destination);
        const { gain, filters } = createEqualizerGraph(
          this.context,
          defaultEqSettings(),
          fades.gain,
        );
        const source = this.context.createMediaElementSource(media);
        const stable = createStableVolumeGraph(this.context, this.makeup);
        source.connect(stable.input);
        stable.output.connect(gain);
        graph = { source, stable, gain, filters, fades };
        this.sources.set(media, graph);
      }
      // Previous captured elements keep a unity path (ads/player element replacement).
      if (this.active && this.active !== graph) {
        if (this.active.analyser) this.active.fades.gain.disconnect(this.active.analyser);
        this.active.analyser = undefined;
        this.active.spectrumBins = undefined;
        this.flatten(this.active);
      }
      this.media?.removeEventListener("volumechange", this.updateStableVolume);
      this.active = graph;
      this.attachAnalyser(graph);
      this.media = media;
      graph.fades.configure(this.fadeConfig, this.cast);
      graph.fades.bind(media);
      media.addEventListener("volumechange", this.updateStableVolume);
      this.failure = "";
      this.apply();
    } catch {
      this.failure = "Equalizer could not attach to the player. Reload playback to retry.";
    }
  }

  setVisualizationEnabled(enabled: boolean): void {
    this.visualization = enabled;
    if (!enabled && this.active?.analyser) {
      // Disconnect only the read-only analysis branch, never the audible destination.
      this.active.fades.gain.disconnect(this.active.analyser);
      this.active.analyser = undefined;
      this.active.spectrumBins = undefined;
    }
  }
  private attachAnalyser(graph: Source): void {
    if (!this.visualization || graph.analyser || !this.context) return;
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -15;
    analyser.smoothingTimeConstant = 0.65;
    // AnalyserNode works without an output connection. This branch cannot double audio.
    // https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
    graph.fades.gain.connect(analyser);
    graph.analyser = analyser;
    graph.spectrumBins = new Uint8Array(analyser.frequencyBinCount);
  }
  spectrum(): SpectrumFrame {
    if (
      !this.visualization ||
      this.cast ||
      this.context?.state !== "running" ||
      !this.media?.isConnected ||
      !this.active?.analyser ||
      !this.active.spectrumBins
    )
      return emptySpectrum();
    if (this.media.paused || this.media.ended)
      return { available: true, bands: emptySpectrum().bands };
    this.active.analyser.getByteFrequencyData(this.active.spectrumBins);
    return {
      available: true,
      bands: spectrumBands(this.active.spectrumBins, this.context.sampleRate),
    };
  }

  resume(after?: () => void): void {
    if (!this.context || this.resumePending || this.context.state === "closed") return;
    if (this.context.state === "running") {
      after?.();
      return;
    }
    this.resumePending = true;
    void this.context
      .resume()
      .then(() => after?.())
      .catch(() => {
        this.failure = "Start playback to activate the equalizer.";
      })
      .finally(() => {
        this.resumePending = false;
      });
  }

  private ramp(param: AudioParam, value: number, duration = 0.03): void {
    const now = this.context!.currentTime;
    param.cancelAndHoldAtTime(now);
    param.linearRampToValueAtTime(value, now + duration);
  }

  private flatten(graph: Source): void {
    graph.fades.detach();
    graph.stable.update(false, 1);
    graph.filters.forEach((filter) => this.ramp(filter.gain, 0));
    const now = this.context!.currentTime;
    graph.gain.gain.cancelAndHoldAtTime(now);
    graph.gain.gain.setValueAtTime(graph.gain.gain.value, now + 0.04);
    graph.gain.gain.linearRampToValueAtTime(1, now + 0.1);
  }

  private apply(): void {
    clearTimeout(this.transitionTimer);
    const generation = ++this.generation;
    if (!this.active || !this.context) return;
    const graph = this.active;
    this.updateStableVolume();
    const enabled = this.config.enabled && !this.cast;
    const gains = enabled ? this.config.gains : Array(10).fill(0);
    const targetDb =
      enabled && this.config.autoHeadroom ? eqHeadroomDb(gains, this.context.sampleRate) : 0;
    const target = 10 ** (targetDb / 20);
    // During automation, bound all positive band contributions, including the current curve.
    const positiveSum = gains.reduce(
      (sum: number, gain: number, i: number) =>
        sum + Math.max(0, gain, graph.filters[i].gain.value),
      0,
    );
    const protective =
      enabled && this.config.autoHeadroom
        ? Math.min(graph.gain.gain.value, target, 10 ** (-(positiveSum + 1) / 20))
        : Math.min(graph.gain.gain.value, target);
    this.ramp(graph.gain.gain, protective, 0.01);
    graph.filters.forEach((filter, i) => {
      const now = this.context!.currentTime;
      filter.gain.cancelAndHoldAtTime(now);
      filter.gain.setValueAtTime(filter.gain.value, now + 0.01);
      filter.gain.linearRampToValueAtTime(
        EQ_FREQUENCIES[i] < this.context!.sampleRate / 2 ? gains[i] : 0,
        now + 0.04,
      );
    });
    this.transitionTimer = setTimeout(() => {
      if (generation === this.generation) this.ramp(graph.gain.gain, target, 0.06);
    }, 50);
  }

  status(): EqStatus {
    const sampleRate = this.context?.sampleRate ?? 48000;
    const headroomDb =
      this.config.enabled && this.config.autoHeadroom && !this.cast
        ? eqHeadroomDb(this.config.gains, sampleRate)
        : 0;
    if (this.cast)
      return {
        state: "cast",
        message:
          "Equalizer applies to playback on this computer. Your curve is saved for local playback.",
        sampleRate,
        headroomDb: 0,
      };
    if (!this.config.enabled)
      return {
        state: "disabled",
        message: "Equalizer off. Your curve is kept for next time.",
        sampleRate,
        headroomDb: 0,
      };
    if (this.failure)
      return { state: "unavailable", message: this.failure, sampleRate, headroomDb };
    if (this.context && this.context.state !== "running")
      return {
        state: "suspended",
        message: "Click play in YouTube Music to activate audio processing.",
        sampleRate,
        headroomDb,
      };
    if (!this.active || !this.media?.isConnected)
      return { state: "waiting", message: "Waiting for local playback.", sampleRate, headroomDb };
    return {
      state: "enabled",
      message: "Equalizer active on this computer.",
      sampleRate,
      headroomDb,
    };
  }

  /** Cleanup listeners separately; an already captured media element must retain an audible path. */
  bypass(): void {
    this.setVisualizationEnabled(false);
    this.active?.fades.detach();
    this.setFadeConfig({ ...this.fadeConfig, smoothPlayPause: false, songFades: false });
    this.setStableVolume(false);
    this.media?.removeEventListener("volumechange", this.updateStableVolume);
    this.setConfig({ ...this.config, enabled: false });
  }
}
