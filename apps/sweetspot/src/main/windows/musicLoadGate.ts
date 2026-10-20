/** Keep the loading cover until preparation for the current document finishes. */
export class MusicLoadGate {
	private generation = 0;
	private pending: Promise<void> | null = null;

	start(): void {
		this.generation++;
		this.pending = null;
	}

	complete(prepare: () => Promise<void>, reveal: () => void): Promise<void> {
		if (this.pending) return this.pending;
		const generation = this.generation;
		const task = Promise.resolve()
			.then(prepare)
			.then(() => {
				if (generation === this.generation) reveal();
			});
		this.pending = task;
		return task;
	}
}
