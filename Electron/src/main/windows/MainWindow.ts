import logger from "../../communs/logger.js";
import electron from 'electron';
const { BrowserWindow, Menu, app, ipcMain } = electron;
import path from 'path';
import { fileURLToPath } from 'url';

import { getAssetPath } from '../../communs/commun.js';
import { Settings } from '../services/settings.js';
import { TranslationService } from "../services/translations.js";

// Se estiver usando ESM ("type": "module"), recrie o __dirname:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isQuitting = false;

app.on("before-quit", () => {
    isQuitting = true;
});

const CloseAllWindows = () => {
    isQuitting = true;
    ipcMain.removeAllListeners();
    app.quit();
}

export function setupTryIcon(
    icon: electron.Tray,
    win: electron.BrowserWindow,
    translationService: TranslationService = new TranslationService()
) {
    const menu = Menu.buildFromTemplate([
        {
            label: app.getName(), type: 'normal', click: () => {
                win.show();
                win.maximize();
            }
        },
        { type: 'separator' },
        {
            label: translationService.t("tray.apps", "Aplicativos"), type: 'normal', click: () => {
                win.show();
                win.maximize();
            }
        },
        { type: 'separator' },
        {
            label: translationService.t("tray.reopen", "Reabrir"), type: 'normal', click: () => {
                app.relaunch();
                app.exit();
            }
        },
        {
            label: translationService.t("tray.reload", "Recarregar"), type: 'normal', click: () => {
                win.show();
                win.maximize();
                win.reload();
            }
        },
        {
            label: translationService.t("tray.exit", "Sair"), type: 'normal', click: async () => {
                CloseAllWindows();
            }
        }
    ]);
    icon.setToolTip(app.getName());
    icon.setContextMenu(menu);
}

type MainWindowOptions = {
    showOnReady?: boolean;
};

export function createMainWindow(AppIcon: electron.Tray, options: MainWindowOptions = {}) {
    const isDev = !app.isPackaged;

    const preloadPath = isDev
        ? path.join(process.cwd(), 'src', 'preload', 'index.js')
        : path.join(__dirname, '..', 'preload', 'index.js');

    const win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        autoHideMenuBar: true,
        icon: getAssetPath(...Settings.get('assets').windowIcon),
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev ? true : Settings.get('electron').devTools
        }
    });

    if (isDev ? true : Settings.get('electron').devTools) {
        if (Settings.get('electron').startOpenDevTools) win.webContents.openDevTools();
    }

    win.once("ready-to-show", () => {
        if (options.showOnReady !== false) {
            win.show();
            if (Settings.get('electron').startMinimized) win.maximize();
        }
    });

    win.on("close", async (event) => {
        if (isQuitting) return;
        if (!Settings.get('electron').minimizeToTray) return;
        event.preventDefault();
        win.hide();
    });

    if (Settings.get('electron').startMinimized) win.maximize();

    setupTryIcon(AppIcon, win);

    win.loadURL("http://localhost:3484/");

    return win;
}
