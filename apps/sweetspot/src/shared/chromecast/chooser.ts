export type ChooserLock = {
	open(): boolean;
	settle(): boolean;
	isOpen(): boolean;
};

/** One picker at a time. `open()` fails if already open. `settle()` is idempotent. */
export function createChooserLock(): ChooserLock {
	let open = false;
	return {
		isOpen() {
			return open;
		},
		open() {
			if (open) return false;
			open = true;
			return true;
		},
		settle() {
			if (!open) return false;
			open = false;
			return true;
		},
	};
}
