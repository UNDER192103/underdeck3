import electron from 'electron';
const { app, BrowserWindow, Tray, protocol, session } = electron;
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
import { CookiePersistenceService } from "./services/cookie-persistence.js";
const soundPadService = new SoundPadService();
const obsService = new ObsService();
const webDeckService = new WebDeckService();
const AppService = new MainAppService(soundPadService, obsService);
const expressService = new ExpressServer(Settings.get('express').port, AppService, webDeckService, soundPadService, obsService);
const hortcutService = new Shortcutkey();
const themeService = new ThemeService(AppService);
const translationService = new TranslationService();
const updaterService = new UpdaterService(translationService);
const cookiePersistenceService = new CookiePersistenceService();
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
let mainWindow = null;
let loadingWindow = null;
let overlayWindow = null;
let trayIcon = null;
let overlayTransitioning = false;
let updateRuntimeStopped = false;
let lastUpdateNotificationVersion = "";
const OVERLAY_SHORTCUT_ID = "overlay-toggle";
app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('enable-features', 'SameSiteDefaultChecksMethodRigorously');
const patchSetCookieHeaders = () => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = details.responseHeaders ?? {};
        const headerKey = Object.keys(responseHeaders).find((key) => key.toLowerCase() === "set-cookie");
        const rawSetCookies = headerKey ? responseHeaders[headerKey] : null;
        if (Array.isArray(rawSetCookies)) {
            responseHeaders[headerKey] = rawSetCookies.map((cookie) => {
                let normalized = String(cookie).replace(/;\s*SameSite=\w+/gi, "");
                if (!/;\s*SameSite=/i.test(normalized)) {
                    normalized += "; SameSite=None";
                }
                if (!/;\s*Secure/i.test(normalized)) {
                    normalized += "; Secure";
                }
                return normalized;
            });
        }
        callback({ responseHeaders });
    });
};
const emitLoadingState = (state) => {
    if (!loadingWindow || loadingWindow.isDestroyed())
        return;
    loadingWindow.webContents.send("UpdatesSV-LoadingStateChanged", state);
};
const publishObserverToAllWindows = (channel, id, data) => {
    const payload = {
        id,
        channel,
        data,
        sourceId: "APP_ELECTRON",
        timestamp: Date.now(),
    };
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
        if (win.isDestroyed())
            return;
        try {
            win.webContents.send("ObserverSV-Event", payload);
        }
        catch {
            // ignore
        }
    });
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
const waitForRendererCssReady = async (win, timeoutMs = 6000) => {
    if (win.isDestroyed())
        return false;
    try {
        const result = await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                const timeoutId = setTimeout(() => resolve(false), ${timeoutMs});

                const complete = (value) => {
                    clearTimeout(timeoutId);
                    resolve(value);
                };

                const waitFonts = () => {
                    const fonts = document.fonts;
                    if (!fonts || !fonts.ready) {
                        checkDomReady();
                        return;
                    }
                    fonts.ready.then(() => checkDomReady()).catch(() => checkDomReady());
                };

                const checkDomReady = () => {
                    const root = document.getElementById("root");
                    if (!root || root.childElementCount === 0) {
                        setTimeout(checkDomReady, 50);
                        return;
                    }
                    // Aguarda dois frames para garantir primeira pintura util.
                    requestAnimationFrame(() => requestAnimationFrame(() => complete(true)));
                };

                const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
                if (links.length === 0) {
                    waitFonts();
                    return;
                }

                let remaining = links.length;
                const done = () => {
                    remaining -= 1;
                    if (remaining <= 0) {
                        waitFonts();
                    }
                };

                links.forEach((node) => {
                    const link = node;
                    if (link.sheet) {
                        done();
                        return;
                    }
                    link.addEventListener("load", done, { once: true });
                    link.addEventListener("error", done, { once: true });
                });
            });
        `, true);
        return Boolean(result);
    }
    catch {
        return false;
    }
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
    let readyToShow = false;
    let cssReady = false;
    let didShow = false;
    const tryShowMainWindow = () => {
        if (didShow)
            return;
        if (!readyToShow || !cssReady)
            return;
        didShow = true;
        showMainWindow();
    };
    win.once("ready-to-show", () => {
        readyToShow = true;
        tryShowMainWindow();
    });
    win.webContents.once("did-finish-load", () => {
        void waitForRendererCssReady(win).then(() => {
            cssReady = true;
            tryShowMainWindow();
        });
    });
    setTimeout(() => {
        if (didShow || win.isDestroyed())
            return;
        cssReady = true;
        tryShowMainWindow();
    }, 7000);
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
        patchSetCookieHeaders();
        await cookiePersistenceService.init();
        const envPath = isDev ? path.join(process.cwd(), '.env') : path.join(process.resourcesPath, '.env');
        dotenv.config({ path: envPath });
        if (!process.env.GH_TOKEN && process.env.GB_TOKEN) {
            process.env.GH_TOKEN = process.env.GB_TOKEN;
        }
        ipcmainService.start();
        loadingWindow = createLoadingWindow();
        loadingWindow.webContents.once("did-finish-load", () => {
            emitLoadingState(updaterService.getLoadingState());
        });
        updaterService.on("loading-state-changed", (state) => {
            emitLoadingState(state);
        });
        updaterService.on("update-available-passive", (payload) => {
            const version = String(payload?.version || "").trim();
            if (!version)
                return;
            if (lastUpdateNotificationVersion === version)
                return;
            lastUpdateNotificationVersion = version;
            publishObserverToAllWindows("updates", "updates.available", {
                version,
                releaseDate: payload?.releaseDate ?? null,
            });
        });
        updaterService.on("download-starting", async () => {
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
app.on("before-quit", () => {
    void cookiePersistenceService.dispose();
});
