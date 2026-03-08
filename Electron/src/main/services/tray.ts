import electron from "electron";
import { TranslationService } from "./translations.js";
import { WindowManagerService } from "./window-manager.js";

const { Menu, app, Tray } = electron;

type TrayMode = "loading" | "ready";

export class TrayService {
  private tray: electron.Tray | null = null;
  private mode: TrayMode = "loading";
  private translationService: TranslationService;
  private windowManager: WindowManagerService;
  private onExit: (() => void | Promise<void>) | null = null;

  constructor(
    windowManager: WindowManagerService,
    translationService?: TranslationService,
    onExit?: () => void | Promise<void>,
  ) {
    this.windowManager = windowManager;
    this.translationService = translationService ?? new TranslationService();
    this.onExit = onExit ?? null;
  }

  init(iconPath: string) {
    if (this.tray && !this.tray.isDestroyed()) return this.tray;
    this.tray = new Tray(iconPath);
    this.tray.setToolTip(app.getName());
    this.refreshMenu();
    return this.tray;
  }

  setMode(mode: TrayMode) {
    this.mode = mode;
    this.refreshMenu();
  }

  refreshMenu() {
    if (!this.tray || this.tray.isDestroyed()) return;
    const isReady = this.mode === "ready";
    const mainWindow = this.windowManager.getWindow("main");
    const canUseMain = isReady && Boolean(mainWindow && !mainWindow.isDestroyed());

    const menu = Menu.buildFromTemplate([
      {
        label: app.getName(),
        enabled: canUseMain,
        type: "normal",
        click: () => {
          this.windowManager.showWindow("main");
        },
      },
      { type: "separator" },
      {
        label: this.translationService.t("tray.apps", "Aplicativos"),
        enabled: canUseMain,
        type: "normal",
        click: () => {
          this.windowManager.showWindow("main");
        },
      },
      { type: "separator" },
      {
        label: this.translationService.t("tray.reopen", "Reabrir"),
        enabled: canUseMain,
        type: "normal",
        click: () => {
          app.relaunch();
          app.exit();
        },
      },
      {
        label: this.translationService.t("tray.reload", "Recarregar"),
        enabled: canUseMain,
        type: "normal",
        click: () => {
          this.windowManager.showWindow("main");
          const win = this.windowManager.getWindow("main");
          if (win && !win.isDestroyed()) {
            win.reload();
          }
        },
      },
      {
        label: this.translationService.t("tray.exit", "Sair"),
        type: "normal",
        click: () => {
          if (this.onExit) {
            void this.onExit();
            return;
          }
          this.windowManager.closeAllAndQuit();
        },
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  getTray() {
    return this.tray;
  }

  destroy() {
    if (!this.tray || this.tray.isDestroyed()) return;
    this.tray.destroy();
    this.tray = null;
  }
}
