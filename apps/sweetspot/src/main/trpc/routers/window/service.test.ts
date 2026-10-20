import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@main/core/baseProvider", () => ({
	BaseProvider: class {
		windowContext: any;
		logger = { debug: vi.fn() };
	},
}));
vi.mock("@main/infra/devUtils", () => ({ isDevelopment: false, defaultUri: new URL("https://music.youtube.com") }));
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false }, platform: { isMacOS: false } }));
vi.mock("@shared/utils/console", () => ({ createLogger: () => ({ debug: vi.fn() }) }));
vi.mock("electron", () => ({ ipcMain: new EventEmitter(), BrowserWindow: {}, session: {} }));

import WindowUtilsProvider from "./service";

const windows: EventEmitter[] = [];
afterEach(() => {
	for (const win of windows.splice(0)) win.emit("close");
});

async function setup() {
	const main = Object.assign(new EventEmitter(), {
		id: 1,
		isDestroyed: () => false,
		getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
		isMaximized: () => false,
		isMinimized: () => false,
		isAlwaysOnTop: () => false,
	});
	windows.push(main);
	let index = 0;
	const contents = Object.assign(new EventEmitter(), {
		id: 2,
		isDestroyed: () => false,
		navigationHistory: {
			canGoBack: () => index > 0,
			getActiveIndex: () => index,
		},
	});
	const sendToAllViews = vi.fn();
	const provider = new WindowUtilsProvider();
	Object.assign(provider, { windowContext: { main, views: { youtubeView: { webContents: contents } }, sendToAllViews } });
	await provider.AfterInit();
	return { main, contents, sendToAllViews, navigate: (next: number) => { index = next; } };
}

function expectNavigation(send: ReturnType<typeof vi.fn>, index: number) {
	expect(send).toHaveBeenLastCalledWith("mainWindowState", expect.objectContaining({
		navigation: { canGoBack: index > 0, index },
	}));
}

describe("toolbar navigation state", () => {
	it("publishes the initial history when the window provider starts", async () => {
		const { sendToAllViews } = await setup();
		expectNavigation(sendToAllViews, 0);
	});

	it.each(["did-navigate", "did-navigate-in-page"])("updates back availability after %s and returning home", async (event) => {
		const { contents, navigate, sendToAllViews } = await setup();
		navigate(1);
		contents.emit(event);
		expectNavigation(sendToAllViews, 1);
		navigate(0);
		contents.emit(event);
		expectNavigation(sendToAllViews, 0);
	});

	it("refreshes history when shown after navigating while hidden", async () => {
		const { main, contents, navigate, sendToAllViews } = await setup();
		main.emit("hide");
		sendToAllViews.mockClear();
		navigate(1);
		contents.emit("did-navigate-in-page");
		expect(sendToAllViews).not.toHaveBeenCalled();
		main.emit("show");
		expectNavigation(sendToAllViews, 1);
	});

	it("removes history listeners when the window closes", async () => {
		const { main, contents, sendToAllViews } = await setup();
		main.emit("close");
		sendToAllViews.mockClear();
		contents.emit("did-navigate");
		contents.emit("did-navigate-in-page");
		expect(sendToAllViews).not.toHaveBeenCalled();
		expect(contents.listenerCount("did-navigate")).toBe(0);
		expect(contents.listenerCount("did-navigate-in-page")).toBe(0);
	});
});
