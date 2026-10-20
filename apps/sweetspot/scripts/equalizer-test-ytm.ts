import { createSendHandler } from "../src/main/ipc/ipc";
export const YtmClient = {
  cmdTimed<T>(target: string, cmd: string, timeout: number, ...args: unknown[]): Promise<T> {
    return createSendHandler<T>(
      (globalThis as any).equalizerTestPlayer,
      `plugins:${target}:cmd:${cmd}`,
      { timeout },
    )(...args);
  },
};
