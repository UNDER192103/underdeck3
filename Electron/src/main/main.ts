import electron from 'electron';
const { app, BrowserWindow, protocol, session } = electron;
import dotenv from "dotenv";
import path from "path";
import { getAssetPath } from '../communs/commun.js';
import { Settings } from './services/settings.js';
import { MainAppService } from './services/main-app.js';
import { Shortcutkey } from './services/shortcutkeys.js';
import { ExpressServer } from './services/express.js';
import { createMainWindow } from './windows/MainWindow.js';
import { createLoadingWindow } from "./windows/LoadingWindow.js";
import { createOverlayWindow } from "./windows/OverlayWindow.js";
import { IpcmainService } from './services/ipcmain.js';
import { fileDialogService } from "./services/file-dialog.js";
import { ThemeService } from "./services/theme.js";
import { SoundPadService } from "./services/soundpad.js";
import { ObsService } from "./services/obs.js";
import { WebDeckService } from "./services/webdeck.js";
import { AlternativeShortcut } from "../types/shortcuts.js";
import { TranslationService } from "./services/translations.js";
import { LoadingState, UpdaterService } from "./services/updater.js";
import { CookiePersistenceService } from "./services/cookie-persistence.js";
import { WindowManagerService } from "./services/window-manager.js";
import { TrayService } from "./services/tray.js";
import { SystemStartupService } from "./services/system-startup.js";

const soundPadService = new SoundPadService();
const obsService = new ObsService();
const webDeckService = new WebDeckService();
const AppService = new MainAppService(soundPadService, obsService);
const expressService = new ExpressServer(
    Settings.get('express').port,
    AppService,
    webDeckService,
    soundPadService,
    obsService
);
const hortcutService = new Shortcutkey();
const themeService = new ThemeService(AppService);
const translationService = new TranslationService();
const updaterService = new UpdaterService(translationService);
const cookiePersistenceService = new CookiePersistenceService();
const systemStartupService = new SystemStartupService();

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let loadingWindow: InstanceType<typeof BrowserWindow> | null = null;
let overlayWindow: InstanceType<typeof BrowserWindow> | null = null;
let overlayTransitioning = false;
let updateRuntimeStopped = false;
let lastUpdateNotificationVersion = "";
const windowManager = new WindowManagerService();
let isShuttingDown = false;

const requestAppShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    windowManager.prepareForQuit();
    await stopRuntimeServicesForUpdate();
    trayService.destroy();
    windowManager.closeAllAndQuit();
    setTimeout(() => {
        app.exit(0);
        process.exit(0);
    }, 1500);
};

const trayService = new TrayService(windowManager, translationService, () => {
    void requestAppShutdown();
});

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
            responseHeaders[headerKey as string] = rawSetCookies.map((cookie) => {
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

const emitLoadingState = (state: LoadingState) => {
    if (!loadingWindow || loadingWindow.isDestroyed()) return;
    loadingWindow.webContents.send("UpdatesSV-LoadingStateChanged", state);
};

const publishObserverToAllWindows = (channel: string, id: string, data?: unknown) => {
    const payload = {
        id,
        channel,
        data,
        sourceId: "APP_ELECTRON",
        timestamp: Date.now(),
    };
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
        if (win.isDestroyed()) return;
        try {
            win.webContents.send("ObserverSV-Event", payload);
        } catch {
            // ignore
        }
    });
};

const stopRuntimeServicesForUpdate = async () => {
    if (updateRuntimeStopped) return;
    updateRuntimeStopped = true;
    try {
        hortcutService.stop();
    } catch {
        // ignore
    }
    try {
        await obsService.disconnect();
    } catch {
        // ignore
    }
    try {
        soundPadService.stop();
    } catch {
        // ignore
    }
    try {
        expressService.stop();
    } catch {
        // ignore
    }
};

const hideOverlayWindow = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
        overlayWindow = null;
        windowManager.setWindow("overlay", null);
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
    windowManager.setWindow("overlay", overlayWindow);
    overlayWindow.on("closed", () => {
        overlayWindow = null;
        windowManager.setWindow("overlay", null);
        overlayTransitioning = false;
    });
    overlayWindow.webContents.on("did-fail-load", () => {
        hideOverlayWindow();
    });
    overlayWindow.on("blur", () => {
        if (!overlayWindow || overlayWindow.isDestroyed()) return;
        if (!overlayWindow.isVisible()) return;
        const overlaySettings = Settings.get("overlay");
        if (typeof overlaySettings?.closeOnBlur === "boolean" && !overlaySettings.closeOnBlur) return;
        hideOverlayWindow();
    });
};

const toggleOverlayWindow = () => {
    if (overlayTransitioning) return;
    overlayTransitioning = true;
    try {
        if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
            hideOverlayWindow();
            return;
        }
        openOverlayWindow();
    } finally {
        setTimeout(() => {
            overlayTransitioning = false;
        }, 120);
    }
};

const syncOverlayShortcut = async () => {
    const overlay = Settings.get("overlay");
    const overlayEnabled = Boolean(overlay?.enabled);
    const keys = Array.isArray(overlay?.keys)
        ? overlay.keys.map((key: unknown) => String(key || "").trim()).filter(Boolean)
        : [];
    const payload: AlternativeShortcut[] = overlayEnabled && keys.length > 0
        ? [{ id: OVERLAY_SHORTCUT_ID, keys }]
        : [];
    await hortcutService.updateAlternativeMacros(payload);
};

const ipcmainService = new IpcmainService(
    AppService,
    expressService,
    hortcutService,
    fileDialogService,
    themeService,
    soundPadService,
    obsService,
    webDeckService,
    updaterService,
    async () => {
        await syncOverlayShortcut();
    },
    () => {
        trayService.refreshMenu();
    },
    async (windowsSettings) => {
        await systemStartupService.syncWithSettings(Boolean(windowsSettings.autoStart));
    }
);

const hideLoadingWindow = () => {
    if (!loadingWindow || loadingWindow.isDestroyed()) {
        loadingWindow = null;
        windowManager.setWindow("loading", null);
        return;
    }
    loadingWindow.hide();
    loadingWindow.close();
    loadingWindow = null;
    windowManager.setWindow("loading", null);
};

const waitForRendererCssReady = async (win: electron.BrowserWindow, timeoutMs = 6000) => {
    if (win.isDestroyed()) return false;

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
    } catch {
        return false;
    }
};

const createMainWithLoading = () => {
    trayService.setMode("loading");
    if (!loadingWindow || loadingWindow.isDestroyed()) {
        loadingWindow = createLoadingWindow();
        windowManager.setWindow("loading", loadingWindow);
        loadingWindow.webContents.once("did-finish-load", () => {
            emitLoadingState(updaterService.getLoadingState());
        });
    }

    const win = createMainWindow({ showOnReady: false });
    mainWindow = win;
    windowManager.setWindow("main", win);

    const showMainWindow = () => {
        if (win.isDestroyed()) return;
        hideLoadingWindow();
        if (Settings.get("electron").startMinimized) {
            trayService.setMode("ready");
            return;
        }
        if (win.isMinimized()) win.restore();
        win.maximize();
        win.show();
        win.focus();
        trayService.setMode("ready");
    };

    let readyToShow = false;
    let cssReady = false;
    let didShow = false;

    const tryShowMainWindow = () => {
        if (didShow) return;
        if (!readyToShow || !cssReady) return;
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
        if (didShow || win.isDestroyed()) return;
        cssReady = true;
        tryShowMainWindow();
    }, 7000);

    win.on("closed", () => {
        hideLoadingWindow();
        mainWindow = null;
        windowManager.setWindow("main", null);
    });
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    void requestAppShutdown();
} else {
    app.on("second-instance", () => {
        if (!mainWindow) return;
        windowManager.showWindow("main");
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

if (gotSingleInstanceLock) app.whenReady().then(async () => {
    patchSetCookieHeaders();
    await cookiePersistenceService.init();

    const envPath = isDev ? path.join(process.cwd(), '.env') : path.join(process.resourcesPath, '.env');
    dotenv.config({ path: envPath });
    if (!process.env.GH_TOKEN && process.env.GB_TOKEN) {
        process.env.GH_TOKEN = process.env.GB_TOKEN;
    }
    ipcmainService.start();
    await systemStartupService.syncWithSettings(Boolean(Settings.get("windows")?.autoStart));

    const trayIconPath = getAssetPath(...Settings.get('assets').tryIcon);
    trayService.init(trayIconPath);
    trayService.setMode("loading");

    loadingWindow = createLoadingWindow();
    windowManager.setWindow("loading", loadingWindow);
    loadingWindow.webContents.once("did-finish-load", () => {
        emitLoadingState(updaterService.getLoadingState());
    });

    updaterService.on("loading-state-changed", (state: LoadingState) => {
        emitLoadingState(state);
    });
    updaterService.on("update-available-passive", (payload: { version?: string | null; releaseDate?: string | null }) => {
        const version = String(payload?.version || "").trim();
        if (!version) return;
        if (lastUpdateNotificationVersion === version) return;
        lastUpdateNotificationVersion = version;
        publishObserverToAllWindows("updates", "updates.available", {
            version,
            releaseDate: payload?.releaseDate ?? null,
        });
    });
    updaterService.on("download-starting", async () => {
        trayService.setMode("loading");
        await stopRuntimeServicesForUpdate();
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide();
        }
        if (!loadingWindow || loadingWindow.isDestroyed()) {
            loadingWindow = createLoadingWindow();
            windowManager.setWindow("loading", loadingWindow);
            loadingWindow.webContents.once("did-finish-load", () => {
                emitLoadingState(updaterService.getLoadingState());
            });
        } else if (!loadingWindow.isVisible()) {
            loadingWindow.show();
        }
    });
    updaterService.on("state-changed", async (state: { downloading?: boolean; installing?: boolean; downloadPercent?: number }) => {
        const downloadingForReal = Boolean(state?.downloading && Number(state?.downloadPercent || 0) > 0);
        const isUpdating = Boolean(downloadingForReal || state?.installing);
        if (!isUpdating) return;
        trayService.setMode("loading");
        await stopRuntimeServicesForUpdate();
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide();
        }
        if (!loadingWindow || loadingWindow.isDestroyed()) {
            loadingWindow = createLoadingWindow();
            windowManager.setWindow("loading", loadingWindow);
            loadingWindow.webContents.once("did-finish-load", () => {
                emitLoadingState(updaterService.getLoadingState());
            });
        } else if (!loadingWindow.isVisible()) {
            loadingWindow.show();
        }
    });

    const startupUpdateResult = await updaterService.checkForStartupUpdates();
    if (!startupUpdateResult.shouldContinueAppStartup) {
        return;
    }

    if (Settings.get('express').enabled) expressService.start(Settings.get('express').port);
    await obsService.connectOnStartupIfNeeded();
    if (Settings.get('shortcuts').enalbed) {
        const shortcuts = await AppService.listShortcuts();
        await hortcutService.updateDataMacros(shortcuts);
        await syncOverlayShortcut();
        hortcutService.start();
    } else {
        await syncOverlayShortcut();
    }
    hortcutService.on('shortcut', (payload: any) => {
        const appId = payload?.data?.meta_data?.appId;
        if (!appId) return;
        AppService.executeApp(appId);
    });
    hortcutService.on("alternative-shortcut", (payload: any) => {
        if (payload?.data?.id !== OVERLAY_SHORTCUT_ID) return;
        toggleOverlayWindow();
    });
    AppService.registerMediaProtocol();
    createMainWithLoading();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWithLoading();
            return;
        }
        if (mainWindow) {
            windowManager.showWindow("main");
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        void requestAppShutdown();
    }
});

app.on("before-quit", () => {
    windowManager.prepareForQuit();
    trayService.destroy();
    void stopRuntimeServicesForUpdate();
    void cookiePersistenceService.dispose();
});
