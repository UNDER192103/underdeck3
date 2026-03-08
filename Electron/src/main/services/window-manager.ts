import electron from "electron";
import { Settings } from "./settings.js";

const { app } = electron;

type ManagedWindowName = "main" | "loading" | "overlay";

export class WindowManagerService {
  private windows: Record<ManagedWindowName, electron.BrowserWindow | null> = {
    main: null,
    loading: null,
    overlay: null,
  };

  private mainCloseHandler: ((event: Electron.Event) => void) | null = null;
  private forceClosingAll = false;

  setWindow(name: ManagedWindowName, win: electron.BrowserWindow | null) {
    this.windows[name] = win;
    if (name === "main" && win) {
      this.attachMainCloseBehavior(win);
    }
  }

  getWindow(name: ManagedWindowName) {
    return this.windows[name];
  }

  hideWindow(name: ManagedWindowName) {
    const win = this.windows[name];
    if (!win || win.isDestroyed()) return;
    win.hide();
  }

  showWindow(name: ManagedWindowName) {
    const win = this.windows[name];
    if (!win || win.isDestroyed()) return;
    if (name === "main") {
      if (win.isMinimized()) win.restore();
      win.maximize();
    } else if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  }

  closeWindow(name: ManagedWindowName) {
    const win = this.windows[name];
    if (!win || win.isDestroyed()) return;
    win.close();
  }

  closeAllAndQuit() {
    this.prepareForQuit();
    const allWindows = electron.BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
      if (win.isDestroyed()) return;
      win.close();
    });
    app.quit();
    setTimeout(() => {
      app.exit(0);
      process.exit(0);
    }, 1200);
  }

  prepareForQuit() {
    this.forceClosingAll = true;
  }

  private attachMainCloseBehavior(win: electron.BrowserWindow) {
    if (this.mainCloseHandler) {
      win.removeListener("close", this.mainCloseHandler);
    }
    this.mainCloseHandler = (event: Electron.Event) => {
      if (this.forceClosingAll) return;
      if (Settings.get("electron").closeToTray) {
        event.preventDefault();
        win.hide();
        return;
      }
      event.preventDefault();
      this.closeAllAndQuit();
    };
    win.on("close", this.mainCloseHandler);
  }
}
