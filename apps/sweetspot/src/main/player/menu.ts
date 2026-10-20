import { app, Menu, MenuItem } from "electron";
/** Native fallback remains available even when the skin's controls are hidden. */
export function installPlayerModeMenu(actions: {
  player: () => Promise<void>;
  full: () => Promise<void>;
}) {
  const submenu = Menu.buildFromTemplate([
    {
      id: "sweetspot-player-mode",
      label: "Player mode",
      type: "radio",
      accelerator: "CmdOrCtrl+Shift+P",
      click: () => {
        void actions.player().catch((error) => console.error("Could not enter player mode", error));
      },
    },
    {
      id: "sweetspot-full-mode",
      label: "Full mode",
      type: "radio",
      checked: true,
      accelerator: "CmdOrCtrl+Shift+F",
      click: () => {
        void actions.full().catch((error) => console.error("Could not enter full mode", error));
      },
    },
  ]);
  const menu =
    Menu.getApplicationMenu() ??
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [{ role: "appMenu" as const }]
        : [{ label: app.name, submenu: [{ role: "quit" as const }] }]),
      { role: "editMenu" },
      { role: "windowMenu" },
    ]);
  const existing = menu.getMenuItemById("sweetspot-player-modes");
  if (existing) existing.submenu = submenu;
  else menu.append(new MenuItem({ id: "sweetspot-player-modes", label: "Player", submenu }));
  Menu.setApplicationMenu(menu);
  return (active: boolean) => {
    submenu.getMenuItemById(active ? "sweetspot-player-mode" : "sweetspot-full-mode")!.checked = true;
  };
}
