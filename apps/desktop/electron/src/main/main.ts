import electron from "electron";
import dotenv from "dotenv";
import path from "path";
import { VelopackApp } from "velopack";

const { app, BrowserWindow, ipcMain, protocol, session } = electron;
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";
if (isDev) {
  const envPath = path.join(process.cwd(), ".env");
  dotenv.config({ path: envPath });
}

VelopackApp
  .build()
  .setAutoApplyOnStartup(false)
  .setLogger((level, message) => {
    if (level === "error") {
      console.error(`[velopack] ${message}`);
      return;
    }
    if (String(process.env.UPDATER_DEBUG_BROADCAST || "").trim() === "1") {
      console.log(`[velopack:${level}] ${message}`);
    }
  })
  .run();

import { getAssetPath } from "../communs/commun.js";
import { Settings } from "./services/settings.js";
import { MainAppService } from "./services/main-app.js";
import { Shortcutkey } from "./services/shortcutkeys.js";
import { ExpressServer } from "./services/express.js";
import { createMainWindow } from "./windows/MainWindow.js";
import { createLoadingWindow } from "./windows/LoadingWindow.js";
import { createOverlayWindow } from "./windows/OverlayWindow.js";
import { observerService } from "./services/observer.js";
import { IpcmainService } from "./services/ipcmain.js";
import { fileDialogService } from "./services/file-dialog.js";
import { ThemeService } from "./services/theme.js";
import { SoundPadService } from "./services/soundpad.js";
import { ObsService } from "./services/obs.js";
import { WebDeckService } from "./services/webdeck.js";
import { AlternativeShortcut } from "../types/shortcuts.js";
import { TranslationService } from "./services/translations.js";
import { LoadingState, UpdateDebugLog, UpdaterService } from "./services/updater.js";
import { CookiePersistenceService } from "./services/cookie-persistence.js";
import { WindowManagerService } from "./services/window-manager.js";
import { TrayService } from "./services/tray.js";
import { SystemStartupService } from "./services/system-startup.js";
import { logsService } from "./services/logs.js";

const soundPadService = new SoundPadService();
const obsService = new ObsService();
const webDeckService = new WebDeckService();
const AppService = new MainAppService(soundPadService, obsService);
const expressService = new ExpressServer(
  Settings.get("express").port,
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

updaterService.on("debug-log", (payload: UpdateDebugLog) => {
  const level = payload?.level === "error" ? "error" : "info";
  logsService.log("updates", payload?.message ?? "update.log", payload?.data, level);
});

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let loadingWindow: InstanceType<typeof BrowserWindow> | null = null;
let overlayWindow: InstanceType<typeof BrowserWindow> | null = null;
let overlayTransitioning = false;
let updateRuntimeStopped = false;
let lastUpdateNotificationVersion = "";
const windowManager = new WindowManagerService();
let isShuttingDown = false;
let mainRendererReady = false;
let notifyMainRendererReady: (() => void) | null = null;
let updateRestartScheduled = false;
let loadingRendererReady = false;
let notifyLoadingRendererReady: (() => void) | null = null;

const requestAppShutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logsService.log("app", "shutdown.requested");
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

app.commandLine.appendSwitch("disable-features", "SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure");
app.commandLine.appendSwitch("disable-site-isolation-trials");
app.commandLine.appendSwitch("enable-features", "SameSiteDefaultChecksMethodRigorously");

const patchSetCookieHeaders = () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};
    const headerKey = Object.keys(responseHeaders).find((key) => key.toLowerCase() === "set-cookie");
    const rawSetCookies = headerKey ? responseHeaders[headerKey] : null;
    if (Array.isArray(rawSetCookies)) {
      responseHeaders[headerKey as string] = rawSetCookies.map((cookie) => {
        let normalized = String(cookie).replace(/;\s*SameSite=\w+/gi, "");
        if (!/;\s*SameSite=/i.test(normalized)) normalized += "; SameSite=None";
        if (!/;\s*Secure/i.test(normalized)) normalized += "; Secure";
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

const emitUpdateState = () => {
  const payload = updaterService.getState();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send("UpdatesSV-StateChanged", payload);
    } catch {
      // ignore
    }
  });
};

const publishObserverToAllWindows = (channel: string, id: string, data?: unknown) => {
  const payload = { id, channel, data, sourceId: "APP_ELECTRON", timestamp: Date.now() };
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send("ObserverSV-Event", payload);
    } catch {
      // ignore
    }
  });
};

const publishGlobalObserverToAllWindows = (channel: string, id: string, data?: unknown) => {
  const payload = { id, channel, data, sourceId: "APP_ELECTRON", timestamp: Date.now() };
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send("GlobalObserverSV-Event", payload);
    } catch {
      // ignore
    }
  });
};

const stopRuntimeServicesForUpdate = async () => {
  if (updateRuntimeStopped) return;
  updateRuntimeStopped = true;
  logsService.log("app", "runtime.stop.begin");
  try { hortcutService.stop(); } catch { /* ignore */ }
  try { await obsService.disconnect(); } catch { /* ignore */ }
  try { soundPadService.stop(); } catch { /* ignore */ }
  try { expressService.stop(); } catch { /* ignore */ }
  logsService.log("app", "runtime.stop.done");
};

const ensureLoadingWindow = () => {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    if (!loadingWindow.isVisible()) loadingWindow.show();
    return loadingWindow;
  }
  loadingRendererReady = false;
  loadingWindow = createLoadingWindow();
  windowManager.setWindow("loading", loadingWindow);
  loadingWindow.webContents.once("did-finish-load", () => {
    emitLoadingState(updaterService.getLoadingState());
  });
  loadingWindow.on("closed", () => {
    loadingWindow = null;
    loadingRendererReady = false;
    notifyLoadingRendererReady = null;
    windowManager.setWindow("loading", null);
  });
  return loadingWindow;
};

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
    if (!overlayWindow.isVisible()) overlayWindow.show();
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
  overlayWindow.webContents.on("did-fail-load", () => hideOverlayWindow());
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
    setTimeout(() => { overlayTransitioning = false; }, 120);
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
  async () => { await syncOverlayShortcut(); },
  () => { trayService.refreshMenu(); },
  async (windowsSettings) => { await systemStartupService.syncWithSettings(Boolean(windowsSettings.autoStart)); },
  async () => {
    ensureLoadingWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    await updaterService.downloadAndInstall();
  }
);

const waitForRendererCssReady = async (win: electron.BrowserWindow, timeoutMs = 6000) => {
  if (win.isDestroyed()) return false;
  try {
    const result = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(false), ${timeoutMs});
        const complete = (value) => { clearTimeout(timeoutId); resolve(value); };
        const waitFonts = () => {
          const fonts = document.fonts;
          if (!fonts || !fonts.ready) { checkDomReady(); return; }
          fonts.ready.then(() => checkDomReady()).catch(() => checkDomReady());
        };
        const checkDomReady = () => {
          const root = document.getElementById("root");
          if (!root || root.childElementCount === 0) { setTimeout(checkDomReady, 50); return; }
          requestAnimationFrame(() => requestAnimationFrame(() => complete(true)));
        };
        const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        if (links.length === 0) { waitFonts(); return; }
        let remaining = links.length;
        const done = () => { remaining -= 1; if (remaining <= 0) waitFonts(); };
        links.forEach((node) => {
          const link = node;
          if (link.sheet) { done(); return; }
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

const createMainApplicationWindow = () => {
  trayService.setMode("loading");
  const win = createMainWindow({ showOnReady: false });
  mainWindow = win;
  mainRendererReady = false;
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
  let mainReadyReceived = false;
  const tryShowMainWindow = () => {
    if (mainReadyReceived) return;
    if (!readyToShow || !cssReady || !mainRendererReady) return;
    mainReadyReceived = true;
    showMainWindow();
  };
  notifyMainRendererReady = tryShowMainWindow;

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

  win.on("closed", () => {
    hideLoadingWindow();
    mainWindow = null;
    mainRendererReady = false;
    notifyMainRendererReady = null;
    windowManager.setWindow("main", null);
  });
};

const registerUpdateLifecycle = () => {
  updaterService.on("loading-state-changed", (state: LoadingState) => emitLoadingState(state));
  updaterService.on("state-changed", (state: { downloading?: boolean; installing?: boolean }) => {
    emitUpdateState();
    const isUpdating = Boolean(state?.downloading || state?.installing);
    if (isUpdating) {
      ensureLoadingWindow();
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.hide();
      trayService.setMode("loading");
    }
  });
  updaterService.on("debug-log", (payload: UpdateDebugLog) => {
    if (String(process.env.UPDATER_DEBUG_BROADCAST || "").trim() !== "1") return;
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed()) return;
      try { win.webContents.send("UpdatesSV-DebugLog", payload); } catch { /* ignore */ }
    });
  });
  updaterService.on("update-available-passive", (payload: { version?: string | null; releaseDate?: string | null }) => {
    const version = String(payload?.version || "").trim();
    if (!version) return;
    if (lastUpdateNotificationVersion === version) return;
    lastUpdateNotificationVersion = version;
    publishGlobalObserverToAllWindows("updates", "updates.available", {
      version,
      releaseDate: payload?.releaseDate ?? null,
    });
  });
  updaterService.on("restart-required", () => {
    if (updateRestartScheduled) return;
    updateRestartScheduled = true;
    void requestAppShutdown();
  });
};

const waitForLoadingRendererReady = async (timeoutMs = 10000) => {
  if (loadingRendererReady) return true;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      notifyLoadingRendererReady = null;
      clearTimeout(timeoutId);
      resolve();
    };

    notifyLoadingRendererReady = finish;
    const timeoutId = setTimeout(() => {
      finish();
    }, timeoutMs);
  });

  return loadingRendererReady;
};

let gotSingleInstanceLock = true;
gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit();
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
  logsService.log("app", "ready");
  ipcMain.on("ObserverSV-Publish", (_event, payload: { id?: string; channel?: string }) => {
    if (String(payload?.id || "") !== "main.ready") return;
    mainRendererReady = true;
    notifyMainRendererReady?.();
  });

  ipcMain.on("GlobalObserverSV-Publish", (_event, payload: { id?: string; channel?: string }) => {
    if (String(payload?.id || "") === "loading.ready") {
      loadingRendererReady = true;
      notifyLoadingRendererReady?.();
      return;
    }
    if (String(payload?.id || "") !== "main.ready") return;
    mainRendererReady = true;
    notifyMainRendererReady?.();
  });

  patchSetCookieHeaders();
  await cookiePersistenceService.init();

  ipcmainService.start();
  await systemStartupService.syncWithSettings(Boolean(Settings.get("windows")?.autoStart));

  const trayIconPath = getAssetPath(...Settings.get("assets").tryIcon);
  trayService.init(trayIconPath);
  trayService.setMode("loading");
  ensureLoadingWindow();
  await waitForLoadingRendererReady();

  registerUpdateLifecycle();

  const startupUpdateResult = await updaterService.checkForStartupUpdates();
  if (!startupUpdateResult.shouldContinueAppStartup) {
    return;
  }

  if (Settings.get("express").enabled) expressService.start(Settings.get("express").port);
  await obsService.connectOnStartupIfNeeded();
  if (Settings.get("shortcuts").enalbed) {
    const shortcuts = await AppService.listShortcuts();
    await hortcutService.updateDataMacros(shortcuts);
    await syncOverlayShortcut();
    hortcutService.start();
  } else {
    await syncOverlayShortcut();
  }

  hortcutService.on("shortcut", (payload: any) => {
    const appId = payload?.data?.meta_data?.appId;
    if (!appId) return;
    AppService.executeApp(appId);
  });
  hortcutService.on("alternative-shortcut", (payload: any) => {
    if (payload?.data?.id !== OVERLAY_SHORTCUT_ID) return;
    toggleOverlayWindow();
  });

  AppService.registerMediaProtocol();
  createMainApplicationWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainApplicationWindow();
      return;
    }
    if (mainWindow) windowManager.showWindow("main");
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") void requestAppShutdown();
});

app.on("before-quit", () => {
  windowManager.prepareForQuit();
  trayService.destroy();
  void stopRuntimeServicesForUpdate();
  void cookiePersistenceService.dispose();
  logsService.log("app", "before-quit");
});
