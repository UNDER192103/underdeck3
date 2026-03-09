import electron from 'electron';
const { BrowserWindow, app } = electron;
import path from 'path';
import { fileURLToPath } from 'url';

import { getAssetPath } from '../../communs/commun.js';
import { Settings } from '../services/settings.js';
import { loadMainRenderer } from "./rendererTarget.js";

// Se estiver usando ESM ("type": "module"), recrie o __dirname:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MainWindowOptions = {
    showOnReady?: boolean;
};

export function createMainWindow(options: MainWindowOptions = {}) {
    const isDev = !app.isPackaged;

    const preloadPath = isDev
        ? path.join(process.cwd(), 'src', 'preload', 'index.js')
        : path.join(__dirname, '..', '..', 'preload', 'index.js');

    const win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        maximizable: true,
        fullscreenable: true,
        fullscreen: false,
        autoHideMenuBar: true,
        frame: true,
        icon: getAssetPath(...Settings.get('assets').windowIcon),
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: true
        }
    });

    if (isDev ? true : Settings.get('electron').devTools) {
        if (Settings.get('electron').startOpenDevTools) win.webContents.openDevTools();
    }

    win.once("ready-to-show", () => {
        if (options.showOnReady !== false) {
            win.show();
        }
    });

    loadMainRenderer(win, isDev);

    return win;
}
