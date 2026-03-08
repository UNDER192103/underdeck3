import electron from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { loadLoadingRenderer } from "./rendererTarget.js";

const { BrowserWindow, app } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createLoadingWindow() {
    const isDev = !app.isPackaged;
    const preloadPath = isDev
        ? path.join(process.cwd(), "src", "preload", "index.js")
        : path.join(__dirname, "..", "..", "preload", "index.js");

    const win = new BrowserWindow({
        width: 400,
        height: 450,
        minWidth: 400,
        maxWidth: 400,
        minHeight: 450,
        maxHeight: 450,
        show: true,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        movable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: !app.isPackaged,
        },
    });

    loadLoadingRenderer(win, isDev);
    return win;
}
