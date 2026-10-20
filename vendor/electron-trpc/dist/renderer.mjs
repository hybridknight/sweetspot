// vendor/electron-trpc/src/constants.ts
var ELECTRON_TRPC_CHANNEL = "electron-trpc";

// vendor/electron-trpc/src/renderer/ipcLink.ts
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";

// vendor/electron-trpc/src/renderer/utils.ts
function transformResult(response, runtime) {
  if ("error" in response) {
    const error = runtime.transformer.deserialize(response.error);
    return {
      ok: false,
      error: {
        ...response,
        error
      }
    };
  }
  const result = {
    ...response.result,
    ...(!response.result.type || response.result.type === "data") && {
      type: "data",
      data: runtime.transformer.deserialize(response.result.data)
    }
  };
  return { ok: true, result };
}

// vendor/electron-trpc/src/renderer/ipcLink.ts
import debugFactory from "debug";
var debug = debugFactory("electron-trpc:renderer:ipcLink");
var getElectronTRPC = () => {
  const electronTRPC = globalThis.electronTRPC;
  if (!electronTRPC) {
    throw new Error(
      "Could not find `electronTRPC` global. Check that `exposeElectronTRPC` has been called in your preload file."
    );
  }
  return electronTRPC;
};
var IPCClient = class {
  #pendingRequests = /* @__PURE__ */ new Map();
  #electronTRPC = getElectronTRPC();
  constructor() {
    this.#electronTRPC.onMessage((response) => {
      this.#handleResponse(response);
    });
  }
  #handleResponse(response) {
    debug("handling response", response);
    const request = response.id && this.#pendingRequests.get(response.id);
    if (!request) {
      return;
    }
    request.callbacks.next(response);
    if ("result" in response && response.result.type === "stopped") {
      request.callbacks.complete();
    }
  }
  request(op, callbacks) {
    const { type, id } = op;
    this.#pendingRequests.set(id, {
      type,
      callbacks,
      op
    });
    this.#electronTRPC.sendMessage({ method: "request", operation: op });
    return () => {
      const callbacks2 = this.#pendingRequests.get(id)?.callbacks;
      this.#pendingRequests.delete(id);
      callbacks2?.complete();
      if (type === "subscription") {
        this.#electronTRPC.sendMessage({
          id,
          method: "subscription.stop"
        });
      }
    };
  }
};
function ipcLink() {
  return (runtime) => {
    const client = new IPCClient();
    return ({ op }) => {
      return observable((observer) => {
        op.input = runtime.transformer.serialize(op.input);
        const unsubscribe = client.request(op, {
          error(err) {
            observer.error(err);
            unsubscribe();
          },
          complete() {
            observer.complete();
          },
          next(response) {
            const transformed = transformResult(response, runtime);
            if (!transformed.ok) {
              observer.error(TRPCClientError.from(transformed.error));
              return;
            }
            observer.next({ result: transformed.result });
            if (op.type !== "subscription") {
              unsubscribe();
              observer.complete();
            }
          }
        });
        return () => {
          unsubscribe();
        };
      });
    };
  };
}
export {
  ELECTRON_TRPC_CHANNEL,
  ipcLink
};
