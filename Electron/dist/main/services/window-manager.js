import electron from "electron";
import { Settings } from "./settings.js";
const { app } = electron;
export class WindowManagerService {
    windows = {
        main: null,
        loading: null,
        overlay: null,
    };
    mainCloseHandler = null;
    forceClosingAll = false;
    setWindow(name, win) {
        this.windows[name] = win;
        if (name === "main" && win) {
            this.attachMainCloseBehavior(win);
        }
    }
    getWindow(name) {
        return this.windows[name];
    }
    hideWindow(name) {
        const win = this.windows[name];
        if (!win || win.isDestroyed())
            return;
        win.hide();
    }
    showWindow(name) {
        const win = this.windows[name];
        if (!win || win.isDestroyed())
            return;
        if (name === "main") {
            if (win.isMinimized())
                win.restore();
            win.maximize();
        }
        else if (win.isMinimized()) {
            win.restore();
        }
        win.show();
        win.focus();
    }
    closeWindow(name) {
        const win = this.windows[name];
        if (!win || win.isDestroyed())
            return;
        win.close();
    }
    closeAllAndQuit() {
        this.prepareForQuit();
        const allWindows = electron.BrowserWindow.getAllWindows();
        allWindows.forEach((win) => {
            if (win.isDestroyed())
                return;
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
    attachMainCloseBehavior(win) {
        if (this.mainCloseHandler) {
            win.removeListener("close", this.mainCloseHandler);
        }
        this.mainCloseHandler = (event) => {
            if (this.forceClosingAll)
                return;
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
