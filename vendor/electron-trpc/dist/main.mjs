// vendor/electron-trpc/src/constants.ts
var ELECTRON_TRPC_CHANNEL = "electron-trpc";

// vendor/electron-trpc/src/main/createIPCHandler.ts
import { ipcMain } from "electron";

// vendor/electron-trpc/src/main/handleIPCMessage.ts
import { callProcedure, TRPCError as TRPCError2 } from "@trpc/server";
import { isObservable } from "@trpc/server/observable";
import { transformTRPCResponse } from "@trpc/server/shared";

// vendor/electron-trpc/src/main/utils.ts
import { TRPCError } from "@trpc/server";
function getTRPCErrorFromUnknown(cause) {
  if (cause instanceof TRPCError) {
    return cause;
  }
  const error = getErrorFromUnknown(cause);
  const trpcError = new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    cause: error,
    message: error.message
  });
  trpcError.stack = error.stack;
  return trpcError;
}
function getErrorFromUnknown(cause) {
  if (cause instanceof Error) {
    return cause;
  }
  if (typeof cause === "string") {
    return new Error(cause);
  }
  return new Error("Unknown error");
}

// vendor/electron-trpc/src/main/handleIPCMessage.ts
import debugFactory from "debug";
var debug = debugFactory("electron-trpc:main:handleIPCMessage");
async function handleIPCMessage({
  router,
  createContext,
  internalId,
  message,
  event,
  subscriptions
}) {
  if (message.method === "subscription.stop") {
    const subscription = subscriptions.get(internalId);
    if (!subscription) {
      return;
    }
    subscription.unsubscribe();
    subscriptions.delete(internalId);
    return;
  }
  const { type, input: serializedInput, path, id } = message.operation;
  const input = serializedInput ? router._def._config.transformer.input.deserialize(serializedInput) : void 0;
  const ctx = await createContext?.({ event }) ?? {};
  const respond = (response) => {
    if (event.sender.isDestroyed()) return;
    event.reply(ELECTRON_TRPC_CHANNEL, transformTRPCResponse(router._def._config, response));
  };
  try {
    const result = await callProcedure({
      ctx,
      path,
      procedures: router._def.procedures,
      rawInput: input,
      type
    });
    if (type !== "subscription") {
      respond({
        id,
        result: {
          type: "data",
          data: result
        }
      });
      return;
    } else {
      if (!isObservable(result)) {
        throw new TRPCError2({
          message: `Subscription ${path} did not return an observable`,
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    }
    const subscription = result.subscribe({
      next(data) {
        respond({
          id,
          result: {
            type: "data",
            data
          }
        });
      },
      error(err) {
        const error = getTRPCErrorFromUnknown(err);
        respond({
          id,
          error: router.getErrorShape({
            error,
            type,
            path,
            input,
            ctx
          })
        });
      },
      complete() {
        respond({
          id,
          result: {
            type: "stopped"
          }
        });
      }
    });
    debug("Creating subscription", internalId);
    subscriptions.set(internalId, subscription);
  } catch (cause) {
    const error = getTRPCErrorFromUnknown(cause);
    return respond({
      id,
      error: router.getErrorShape({
        error,
        type,
        path,
        input,
        ctx
      })
    });
  }
}

// vendor/electron-trpc/src/main/createIPCHandler.ts
import debugFactory2 from "debug";
var debug2 = debugFactory2("electron-trpc:main:IPCHandler");
var getInternalId = (event, request) => {
  const messageId = request.method === "request" ? request.operation.id : request.id;
  return `${event.sender.id}-${event.senderFrame.routingId}:${messageId}`;
};
var IPCHandler = class {
  #windows = [];
  #subscriptions = /* @__PURE__ */ new Map();
  constructor({
    createContext,
    router,
    windows = [],
    validateSender
  }) {
    windows.forEach((win) => this.attachWindow(win));
    ipcMain.on(ELECTRON_TRPC_CHANNEL, (event, request) => {
      if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return;
      if (validateSender ? !validateSender(event) : !this.#windows.some((win) => win.webContents === event.sender)) return;
      if (!request || typeof request !== "object" || request.method !== "request" && request.method !== "subscription.stop") return;
      if (request.method === "request" && (!request.operation || typeof request.operation !== "object")) return;
      handleIPCMessage({
        router,
        createContext,
        internalId: getInternalId(event, request),
        event,
        message: request,
        subscriptions: this.#subscriptions
      }).catch((error) => debug2("Rejected IPC request: %s", error instanceof Error ? error.message : "invalid request"));
    });
  }
  attachWindow(win) {
    if (this.#windows.includes(win)) {
      return;
    }
    debug2("Attaching window", win.id);
    this.#windows.push(win);
    this.#attachSubscriptionCleanupHandlers(win);
  }
  detachWindow(win, webContentsId) {
    debug2("Detaching window", win.id);
    if (win.isDestroyed() && webContentsId === void 0) {
      throw new Error("webContentsId is required when calling detachWindow on a destroyed window");
    }
    this.#windows = this.#windows.filter((w) => w !== win);
    this.#cleanUpSubscriptions({ webContentsId: webContentsId ?? win.webContents.id });
  }
  #cleanUpSubscriptions({
    webContentsId,
    frameRoutingId
  }) {
    for (const [key, sub] of this.#subscriptions.entries()) {
      if (key.startsWith(`${webContentsId}-${frameRoutingId ?? ""}`)) {
        debug2("Closing subscription", key);
        sub.unsubscribe();
        this.#subscriptions.delete(key);
      }
    }
  }
  #attachSubscriptionCleanupHandlers(win) {
    const webContentsId = win.webContents.id;
    win.webContents.on("did-start-navigation", ({ isSameDocument, frame }) => {
      if (!isSameDocument && frame) {
        debug2(
          "Handling hard navigation event",
          `webContentsId: ${webContentsId}`,
          `frameRoutingId: ${frame.routingId}`
        );
        this.#cleanUpSubscriptions({
          webContentsId,
          frameRoutingId: frame.routingId
        });
      }
    });
    win.webContents.on("destroyed", () => {
      debug2("Handling webContents `destroyed` event");
      this.detachWindow(win, webContentsId);
    });
  }
};
var createIPCHandler = ({
  createContext,
  router,
  windows = [],
  validateSender
}) => {
  return new IPCHandler({ createContext, router, windows, validateSender });
};

// vendor/electron-trpc/src/main/exposeElectronTRPC.ts
import { ipcRenderer, contextBridge } from "electron";
var exposeElectronTRPC = () => {
  const electronTRPC = {
    sendMessage: (operation) => ipcRenderer.send(ELECTRON_TRPC_CHANNEL, operation),
    onMessage: (callback) => ipcRenderer.on(ELECTRON_TRPC_CHANNEL, (_event, args) => callback(args))
  };
  contextBridge.exposeInMainWorld("electronTRPC", electronTRPC);
};
export {
  ELECTRON_TRPC_CHANNEL,
  createIPCHandler,
  exposeElectronTRPC
};
