import electron from "electron";
const { BrowserWindow, app } = electron;
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createLoadingWindow() {
    const isDev = !app.isPackaged;
    const preloadPath = isDev
        ? path.join(process.cwd(), "src", "preload", "index.js")
        : path.join(__dirname, "..", "preload", "index.js");

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
        backgroundColor: "#111827",
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: !app.isPackaged,
        },
    });

    const rendererCandidates = [
        path.join(process.cwd(), "src", "renderer"),
        path.join(process.resourcesPath || "", "webdeck-client"),
        path.join(process.cwd(), "webdeck-client"),
    ].filter(Boolean);

    const rendererDir = rendererCandidates.find((candidate) =>
        fs.existsSync(path.join(candidate, "loading", "index.html"))
    );

    if (rendererDir) {
        const indexPath = path.join(rendererDir, "loading", "index.html");
        const assetsDirUrl = pathToFileURL(path.join(rendererDir, "assets")).toString();
        const raw = fs.readFileSync(indexPath, "utf-8");
        const html = raw
            .replaceAll('"/assets/', `"${assetsDirUrl}/`)
            .replaceAll("'/assets/", `'${assetsDirUrl}/`);
        win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    } else {
        win.loadURL("data:text/html;charset=UTF-8,Carregando...");
    }
    return win;
}
