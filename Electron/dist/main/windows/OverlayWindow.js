import electron from "electron";
const { BrowserWindow, app } = electron;
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function createOverlayWindow() {
    const isDev = !app.isPackaged;
    const preloadPath = isDev
        ? path.join(process.cwd(), "src", "preload", "index.js")
        : path.join(__dirname, "..", "preload", "index.js");
    const win = new BrowserWindow({
        show: false,
        frame: false,
        transparent: true,
        fullscreen: true,
        movable: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
        },
    });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setFullScreenable(true);
    win.once("ready-to-show", () => {
        win.show();
        win.focus();
    });
    win.loadURL("http://localhost:3484/overlay");
    return win;
}
