import { type SpectrumFrame, SPECTRUM_SAMPLE_MS } from "@shared/skins/spectrum";

/** Sample in the audio renderer, never through per-frame command/response bridges.
 * A single bounded stream serves every skin; unchanged/silent frames aren't sent. */
export class SpectrumStream {
  private timer?: ReturnType<typeof setInterval>;
  private previous?: SpectrumFrame;
  constructor(
    private sample: () => SpectrumFrame,
    private publish: (frame: SpectrumFrame) => void,
  ) {}
  setEnabled(enabled: boolean): void {
    if (!enabled) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.previous = undefined;
      return;
    }
    if (this.timer !== undefined) return;
    const tick = () => {
      const frame = this.sample();
      if (
        this.previous?.available === frame.available &&
        frame.bands.every((value, i) => value === this.previous?.bands[i])
      )
        return;
      this.previous = frame;
      this.publish(frame);
    };
    tick();
    this.timer = setInterval(tick, SPECTRUM_SAMPLE_MS);
  }
}
