import { expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
const state = vi.hoisted(() => ({ create: vi.fn(() => { throw new Error("unexpected keychain access"); }) }));
vi.mock("@main/lib/store/createYmlStore", () => ({ createEncryptedStore: state.create }));
vi.mock("electron", () => ({ app: { getPath: () => join(tmpdir(), "sweetspot-unused-pairing-store-fixture") } }));
import { readAuthClients } from "./store";
it("does not create a store or unlock the keychain when pairing has never been used", () => {
	expect(readAuthClients()).toEqual([]);
	expect(state.create).not.toHaveBeenCalled();
});
