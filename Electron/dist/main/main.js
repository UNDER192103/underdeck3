import electron from 'electron';
const { app, BrowserWindow, Tray, protocol } = electron;
import dotenv from "dotenv";
import path from "path";
import { getAssetPath } from '../communs/commun.js';
import { Settings } from './services/settings.js';
import { MainAppService } from './services/main-app.js';
import { Shortcutkey } from './services/shortcutkeys.js';
import { ExpressServer } from './services/express.js';
import { createMainWindow, setupTryIcon } from './windows/MainWindow.js';
import { createLoadingWindow } from "./windows/LoadingWindow.js";
import { createOverlayWindow } from "./windows/OverlayWindow.js";
import { IpcmainService } from './services/ipcmain.js';
import { fileDialogService } from "./services/file-dialog.js";
import { ThemeService } from "./services/theme.js";
import { SoundPadService } from "./services/soundpad.js";
import { ObsService } from "./services/obs.js";
import { WebDeckService } from "./services/webdeck.js";
import { TranslationService } from "./services/translations.js";
import { UpdaterService } from "./services/updater.js";
const soundPadService = new SoundPadService();
const obsService = new ObsService();
const webDeckService = new WebDeckService();
const AppService = new MainAppService(soundPadService, obsService);
const expressService = new ExpressServer(Settings.get('express').port, AppService, webDeckService, soundPadService, obsService);
const hortcutService = new Shortcutkey();
const themeService = new ThemeService(AppService);
const translationService = new TranslationService();
const updaterService = new UpdaterService(translationService);
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
let mainWindow = null;
let loadingWindow = null;
let overlayWindow = null;
let trayIcon = null;
let overlayTransitioning = false;
let updateRuntimeStopped = false;
const OVERLAY_SHORTCUT_ID = "overlay-toggle";
const emitLoadingState = (state) => {
    if (!loadingWindow || loadingWindow.isDestroyed())
        return;
    loadingWindow.webContents.send("UpdatesSV-LoadingStateChanged", state);
};
const stopRuntimeServicesForUpdate = async () => {
    if (updateRuntimeStopped)
        return;
    updateRuntimeStopped = true;
    try {
        hortcutService.stop();
    }
    catch {
        // ignore
    }
    try {
        await obsService.disconnect();
    }
    catch {
        // ignore
    }
    try {
        soundPadService.stop();
    }
    catch {
        // ignore
    }
    try {
        expressService.stop();
    }
    catch {
        // ignore
    }
};
const hideOverlayWindow = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
        overlayWindow = null;
        return;
    }
    overlayWindow.hide();
};
const openOverlayWindow = () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        if (!overlayWindow.isVisible()) {
            overlayWindow.show();
        }
        overlayWindow.focus();
        return;
    }
    overlayWindow = createOverlayWindow();
    overlayWindow.on("closed", () => {
        overlayWindow = null;
        overlayTransitioning = false;
    });
    overlayWindow.webContents.on("did-fail-load", () => {
        hideOverlayWindow();
    });
    overlayWindow.on("blur", () => {
        if (!overlayWindow || overlayWindow.isDestroyed())
            return;
        if (!overlayWindow.isVisible())
            return;
        const overlaySettings = Settings.get("overlay");
        if (typeof overlaySettings?.closeOnBlur === "boolean" && !overlaySettings.closeOnBlur)
            return;
        hideOverlayWindow();
    });
};
const toggleOverlayWindow = () => {
    if (overlayTransitioning)
        return;
    overlayTransitioning = true;
    try {
        if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
            hideOverlayWindow();
            return;
        }
        openOverlayWindow();
    }
    finally {
        setTimeout(() => {
            overlayTransitioning = false;
        }, 120);
    }
};
const syncOverlayShortcut = async () => {
    const overlay = Settings.get("overlay");
    const overlayEnabled = Boolean(overlay?.enabled);
    const keys = Array.isArray(overlay?.keys)
        ? overlay.keys.map((key) => String(key || "").trim()).filter(Boolean)
        : [];
    const payload = overlayEnabled && keys.length > 0
        ? [{ id: OVERLAY_SHORTCUT_ID, keys }]
        : [];
    await hortcutService.updateAlternativeMacros(payload);
};
const ipcmainService = new IpcmainService(AppService, expressService, hortcutService, fileDialogService, themeService, soundPadService, obsService, webDeckService, updaterService, async () => {
    await syncOverlayShortcut();
}, () => {
    if (!trayIcon || !mainWindow || mainWindow.isDestroyed())
        return;
    setupTryIcon(trayIcon, mainWindow, translationService);
});
const hideLoadingWindow = () => {
    if (!loadingWindow || loadingWindow.isDestroyed()) {
        loadingWindow = null;
        return;
    }
    loadingWindow.hide();
    loadingWindow.close();
    loadingWindow = null;
};
const createMainWithLoading = (AppIcon) => {
    if (!loadingWindow || loadingWindow.isDestroyed()) {
        loadingWindow = createLoadingWindow();
        loadingWindow.webContents.once("did-finish-load", () => {
            emitLoadingState(updaterService.getLoadingState());
        });
    }
    const win = createMainWindow(AppIcon, { showOnReady: false });
    mainWindow = win;
    const showMainWindow = () => {
        if (win.isDestroyed())
            return;
        hideLoadingWindow();
        if (win.isMinimized())
            win.restore();
        win.show();
        win.focus();
    };
    win.webContents.once("did-finish-load", showMainWindow);
    win.webContents.once("did-fail-load", () => {
        showMainWindow();
    });
    win.on("closed", () => {
        hideLoadingWindow();
        mainWindow = null;
    });
};
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}
else {
    app.on("second-instance", () => {
        if (!mainWindow)
            return;
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        if (!mainWindow.isVisible()) {
            mainWindow.show();
        }
        mainWindow.focus();
    });
}
protocol.registerSchemesAsPrivileged([
    {
        scheme: "underdeck-media",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        },
    },
]);
if (gotSingleInstanceLock)
    app.whenReady().then(async () => {
        const envPath = isDev ? path.join(process.cwd(), '.env') : path.join(process.resourcesPath, '.env');
        dotenv.config({ path: envPath });
        loadingWindow = createLoadingWindow();
        loadingWindow.webContents.once("did-finish-load", () => {
            emitLoadingState(updaterService.getLoadingState());
        });
        updaterService.on("loading-state-changed", (state) => {
            emitLoadingState(state);
        });
        updaterService.on("state-changed", async (state) => {
            const downloadingForReal = Boolean(state?.downloading && Number(state?.downloadPercent || 0) > 0);
            const isUpdating = Boolean(downloadingForReal || state?.installing);
            if (!isUpdating)
                return;
            await stopRuntimeServicesForUpdate();
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
                mainWindow.hide();
            }
            if (!loadingWindow || loadingWindow.isDestroyed()) {
                loadingWindow = createLoadingWindow();
                loadingWindow.webContents.once("did-finish-load", () => {
                    emitLoadingState(updaterService.getLoadingState());
                });
            }
            else if (!loadingWindow.isVisible()) {
                loadingWindow.show();
            }
        });
        const startupUpdateResult = await updaterService.checkForStartupUpdates();
        if (!startupUpdateResult.shouldContinueAppStartup) {
            return;
        }
        if (Settings.get('express').enabled)
            expressService.start(Settings.get('express').port);
        await obsService.connectOnStartupIfNeeded();
        if (Settings.get('shortcuts').enalbed) {
            const shortcuts = await AppService.listShortcuts();
            await hortcutService.updateDataMacros(shortcuts);
            await syncOverlayShortcut();
            hortcutService.start();
        }
        else {
            await syncOverlayShortcut();
        }
        hortcutService.on('shortcut', (payload) => {
            const appId = payload?.data?.meta_data?.appId;
            if (!appId)
                return;
            AppService.executeApp(appId);
        });
        hortcutService.on("alternative-shortcut", (payload) => {
            if (payload?.data?.id !== OVERLAY_SHORTCUT_ID)
                return;
            toggleOverlayWindow();
        });
        AppService.registerMediaProtocol();
        ipcmainService.start();
        const AppIcon = new Tray(getAssetPath(...Settings.get('assets').tryIcon));
        trayIcon = AppIcon;
        createMainWithLoading(AppIcon);
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createMainWithLoading(AppIcon);
                return;
            }
            if (mainWindow) {
                if (mainWindow.isMinimized())
                    mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        });
    });
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
