export type AppTrpcContext = {
	event: { sender: unknown };
	authorizeProcedure?: (path: string) => void;
	getBrowserWindow: () => {
		isMinimizable?: () => boolean;
		isMaximizable?: () => boolean;
		isMaximized?: () => boolean;
		minimize?: () => void;
		maximize?: () => void;
		unmaximize?: () => void;
		isDestroyed?: () => boolean;
		isAlwaysOnTop?: () => boolean;
		setAlwaysOnTop?: (value: boolean) => void;
	} | null;
	getProvider: (name: string) => unknown;
};
