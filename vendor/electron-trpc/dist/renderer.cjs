"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// vendor/electron-trpc/src/renderer/index.ts
var index_exports = {};
__export(index_exports, {
  ELECTRON_TRPC_CHANNEL: () => ELECTRON_TRPC_CHANNEL,
  ipcLink: () => ipcLink
});
module.exports = __toCommonJS(index_exports);

// vendor/electron-trpc/src/constants.ts
var ELECTRON_TRPC_CHANNEL = "electron-trpc";

// vendor/electron-trpc/src/renderer/ipcLink.ts
var import_client = require("@trpc/client");
var import_observable = require("@trpc/server/observable");

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
var import_debug = __toESM(require("debug"));
var debug = (0, import_debug.default)("electron-trpc:renderer:ipcLink");
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
      return (0, import_observable.observable)((observer) => {
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
              observer.error(import_client.TRPCClientError.from(transformed.error));
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
