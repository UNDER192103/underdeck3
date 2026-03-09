const { contextBridge, ipcRenderer } = require("electron");
type App = import("../types/apps.js").App;
type Shortcut = import("../types/shortcuts.js").Shortcut;
type SelectFileOptions = import("../types/file-dialog.js").SelectFileOptions;
type SaveFileOptions = import("../types/file-dialog.js").SaveFileOptions;
type SavedThemeWallpaper = import("../types/theme.js").SavedThemeWallpaper;
type ThemeDownloadProgress = import("../types/theme.js").ThemeDownloadProgress;
type ThemeDownloadRequest = import("../types/theme.js").ThemeDownloadRequest;
type ThemePreferences = import("../types/theme.js").ThemePreferences;
type StoredThemeBackground = import("../types/theme.js").StoredThemeBackground;
type StoredThemeName = import("../types/theme.js").StoredThemeName;
type SoundPadAudio = import("../main/services/soundpad.js").SoundPadAudio;
type SoundPadExecResult = import("../main/services/soundpad.js").SoundPadExecResult;
type SoundPadVerifyResult = import("../main/services/soundpad.js").SoundPadVerifyResult;
type ObsAudioInput = import("../main/services/obs.js").ObsAudioInput;
type ObsCommandResult = import("../main/services/obs.js").ObsCommandResult;
type ObsScene = import("../main/services/obs.js").ObsScene;
type ObsSettings = import("../main/services/obs.js").ObsSettings;
type ObsState = import("../main/services/obs.js").ObsState;
type WebDeckItem = import("../main/services/webdeck.js").WebDeckItem;
type WebDeckPage = import("../main/services/webdeck.js").WebDeckPage;
type WebDeckAutoIcons = import("../main/services/webdeck.js").WebDeckAutoIcons;
type OverlaySettings = import("../types/overlay.js").OverlaySettings;
type WebDeckChangedPayload = { sourceId: string; timestamp: number };
type ExpressStatusChangedPayload = { sourceId: string; enabled: boolean; port: number; timestamp: number };
type ThemePreferencesChangedPayload = { sourceId: string; timestamp: number };
type UpdateState = {
  currentVersion: string;
  checking: boolean;
  updateAvailable: boolean;
  downloading: boolean;
  installing: boolean;
  downloaded: boolean;
  autoDownloadEnabled: boolean;
  availableVersion: string | null;
  downloadPercent: number;
  lastError: string | null;
  lastCheckedAt: number | null;
  lastAvailableReleaseDate: string | null;
  lastUpdatedAt: number | null;
};
type UpdateLoadingState = {
  phase: "checking" | "downloading" | "installing" | "loading-app";
  message: string;
  progressPercent?: number;
  version?: string | null;
};
type DevToolsChangedPayload = {
  enabled: boolean;
  timestamp: number;
};
type WindowsSettings = {
  autoStart: boolean;
  enableNotifications: boolean;
};
type ElectronSettings = {
  startMinimized: boolean;
  closeToTray: boolean;
  devTools: boolean;
};
type ObserverEventPayload = {
  id: string;
  channel: string;
  data?: unknown;
  sourceId: string;
  timestamp: number;
};

interface UnderDeckApi {
  i18n: {
    getCurrentLocale: () => Promise<string>;
    setCurrentLocale: (locale: string) => Promise<string>;
    listExternalLocales: () => Promise<Array<{ locale: string; name: string }>>;
    getExternalMessages: (locale: string) => Promise<Record<string, string>>;
    importLocaleFile: (sourcePath: string) => Promise<{ locale: string; name: string }>;
    deleteExternalLocale: (locale: string) => Promise<boolean>;
  };
  apps: {
    list: () => Promise<App[]>;
    add: (app: App) => Promise<App>;
    update: (app: App) => Promise<App | null>;
    find: (id: string) => Promise<App | null>;
    delete: (id: string) => Promise<unknown>;
    execute: (id: string) => Promise<unknown>;
    reposition: (id: string, toPosition: number) => Promise<App[]>;
  };
  shortcuts: {
    getComboKeys: () => Promise<string[]>;
    list: () => Promise<Shortcut[]>;
    add: (shortcut: Shortcut) => Promise<Shortcut>;
    update: (shortcut: Shortcut) => Promise<Shortcut | null>;
    find: (id: string) => Promise<Shortcut | null>;
    delete: (id: string) => Promise<unknown>;
    updateAll: (shortcuts: Shortcut[]) => Promise<boolean>;
    isStarted: () => Promise<boolean>;
    setEnabled: (enabled: boolean) => Promise<boolean>;
  };
  observer: {
    publish: (payload: Partial<ObserverEventPayload>) => void;
    subscribe: (listener: (payload: ObserverEventPayload) => void) => () => void;
  };
  overlay: {
    getSettings: () => Promise<OverlaySettings>;
    updateSettings: (patch: Partial<OverlaySettings>) => Promise<OverlaySettings>;
    closeWindow: () => Promise<boolean>;
  };
  express: {
    status: () => Promise<boolean>;
    start: (port?: number | null, sourceId?: string) => Promise<boolean>;
    stop: (sourceId?: string) => Promise<void>;
    notifyWebDeckChanged: () => Promise<boolean>;
    openExternal: (url: string) => Promise<boolean>;
    getWebDeckAccessInfo: () => Promise<{
      localhostUrl: string;
      localIp: string;
      localIpUrl: string;
      inviteUrl: string;
      qrCodeDataUrl: string;
    }>;
    onStatusChanged: (listener: (payload: ExpressStatusChangedPayload) => void) => () => void;
  };
  updates: {
    getState: () => Promise<UpdateState>;
    getLoadingState: () => Promise<UpdateLoadingState>;
    setAutoDownload: (enabled: boolean) => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    downloadInstall: () => Promise<boolean>;
    onStateChanged: (listener: (payload: UpdateState) => void) => () => void;
    onLoadingStateChanged: (listener: (payload: UpdateLoadingState) => void) => () => void;
  };
  appSettings: {
    getWindows: () => Promise<WindowsSettings>;
    setWindows: (patch: Partial<WindowsSettings>) => Promise<WindowsSettings>;
    getElectron: () => Promise<ElectronSettings>;
    setElectron: (patch: Partial<ElectronSettings>) => Promise<ElectronSettings>;
    onDevToolsChanged: (listener: (payload: DevToolsChangedPayload) => void) => () => void;
  };
  dialog: {
    selectFile: (options?: SelectFileOptions) => Promise<string | string[] | null>;
    selectSaveFile: (options?: SaveFileOptions) => Promise<string | null>;
    readFileAsDataUrl: (filePath: string) => Promise<string | null>;
  };
  media: {
    importFileToMediaUrl: (sourcePath: string, folderName: string, targetFileName?: string) => Promise<string | null>;
  };
  theme: {
    saveLocalBackground: (sourcePath: string, mediaType?: string | null) => Promise<SavedThemeWallpaper | null>;
    getLocalWallpaper: () => Promise<SavedThemeWallpaper | null>;
    listSavedStoreWallpapers: () => Promise<SavedThemeWallpaper[]>;
    downloadStoreWallpaper: (request: ThemeDownloadRequest) => Promise<{ jobId: string }>;
    waitDownload: (jobId: string) => Promise<{ ok: boolean; mediaUrl?: string; error?: string } | null>;
    uninstallStoreWallpaper: (key: string) => Promise<boolean>;
    uninstallLocalWallpaper: () => Promise<boolean>;
    getPreferences: (defaultTheme: StoredThemeName, defaultBackground: StoredThemeBackground) => Promise<ThemePreferences>;
    setTheme: (theme: StoredThemeName) => Promise<boolean>;
    setBackground: (background: StoredThemeBackground) => Promise<boolean>;
    onDownloadProgress: (listener: (payload: ThemeDownloadProgress) => void) => () => void;
    onPreferencesChanged: (listener: (payload: ThemePreferencesChangedPayload) => void) => () => void;
  };
  soundpad: {
    getPath: () => Promise<string>;
    setPath: (filePath: string) => Promise<boolean>;
    verify: () => Promise<SoundPadVerifyResult>;
    listAudios: () => Promise<SoundPadAudio[]>;
    executeCommand: (command: string) => Promise<SoundPadExecResult>;
    playSound: (index: number) => Promise<SoundPadExecResult>;
    repeatCurrent: () => Promise<SoundPadExecResult>;
    stopSound: () => Promise<SoundPadExecResult>;
    togglePause: () => Promise<SoundPadExecResult>;
    onAudiosChanged: (listener: (audios: SoundPadAudio[]) => void) => () => void;
  };
  obs: {
    getSettings: () => Promise<ObsSettings>;
    getState: () => Promise<ObsState>;
    refreshState: () => Promise<ObsState>;
    updateSettings: (
      patch: Partial<ObsSettings>,
      options?: { reconnectIfConnected?: boolean; requireValidManual?: boolean }
    ) => Promise<ObsCommandResult>;
    connect: (config?: { host?: string; port?: number; password?: string }) => Promise<ObsCommandResult>;
    disconnect: () => Promise<ObsCommandResult>;
    listScenes: () => Promise<ObsScene[]>;
    listAudioInputs: () => Promise<ObsAudioInput[]>;
    setCurrentScene: (sceneName: string) => Promise<ObsCommandResult>;
    setInputMute: (inputNameOrUuid: string, muted: boolean) => Promise<ObsCommandResult>;
    toggleInputMute: (inputNameOrUuid: string) => Promise<ObsCommandResult>;
    startStream: () => Promise<ObsCommandResult>;
    stopStream: () => Promise<ObsCommandResult>;
    toggleStream: () => Promise<ObsCommandResult>;
    startRecord: () => Promise<ObsCommandResult>;
    stopRecord: () => Promise<ObsCommandResult>;
    toggleRecordPause: () => Promise<ObsCommandResult>;
    pauseRecord: () => Promise<ObsCommandResult>;
    resumeRecord: () => Promise<ObsCommandResult>;
    onStateChanged: (listener: (state: ObsState) => void) => () => void;
  };
  webdeck: {
    listPages: () => Promise<WebDeckPage[]>;
    findPage: (id: string) => Promise<WebDeckPage | null>;
    createPage: (payload: { name: string; iconSource?: string | null; gridCols?: number; gridRows?: number }, sourceId?: string) => Promise<WebDeckPage | null>;
    updatePage: (payload: { id: string; name?: string; iconSource?: string | null }, sourceId?: string) => Promise<WebDeckPage | null>;
    deletePage: (id: string, sourceId?: string) => Promise<boolean>;
    setGrid: (pageId: string, gridCols: number, gridRows: number, sourceId?: string) => Promise<WebDeckPage | null>;
    upsertItem: (
      pageId: string,
      index: number,
      item: { id?: string; type: WebDeckItem["type"]; refId: string; label?: string; icon?: string | null },
      sourceId?: string
    ) => Promise<WebDeckPage | null>;
    removeItem: (pageId: string, index: number, sourceId?: string) => Promise<WebDeckPage | null>;
    moveItem: (pageId: string, fromIndex: number, toIndex: number, sourceId?: string) => Promise<WebDeckPage | null>;
    listAutoIcons: () => Promise<WebDeckAutoIcons>;
    setAutoPageIcon: (rootId: string, iconSource?: string | null, sourceId?: string) => Promise<WebDeckAutoIcons>;
    setAutoItemIcon: (itemKey: string, iconSource?: string | null, sourceId?: string) => Promise<WebDeckAutoIcons>;
    onChanged: (listener: (payload: WebDeckChangedPayload) => void) => () => void;
  };
}

const soundPadListeners = new Set<(audios: SoundPadAudio[]) => void>();
let soundPadSubscribed = false;
const soundPadEventHandler = (_event: unknown, audios: SoundPadAudio[]) => {
  soundPadListeners.forEach((listener) => {
    listener(audios);
  });
};

const obsStateListeners = new Set<(state: ObsState) => void>();
let obsStateSubscribed = false;
const obsStateEventHandler = (_event: unknown, state: ObsState) => {
  obsStateListeners.forEach((listener) => {
    listener(state);
  });
};

const observerListeners = new Set<(payload: ObserverEventPayload) => void>();
let observerSubscribed = false;
const observerEventHandler = (_event: unknown, payload: ObserverEventPayload) => {
  observerListeners.forEach((listener) => {
    listener(payload);
  });
};

const webDeckChangedListeners = new Set<(payload: WebDeckChangedPayload) => void>();
let webDeckChangedSubscribed = false;
const webDeckChangedHandler = (_event: unknown, payload: WebDeckChangedPayload) => {
  webDeckChangedListeners.forEach((listener) => {
    listener(payload);
  });
};

const themePreferencesListeners = new Set<(payload: ThemePreferencesChangedPayload) => void>();
let themePreferencesSubscribed = false;
const themePreferencesHandler = (_event: unknown, payload: ThemePreferencesChangedPayload) => {
  themePreferencesListeners.forEach((listener) => {
    listener(payload);
  });
};

const expressStatusListeners = new Set<(payload: ExpressStatusChangedPayload) => void>();
let expressStatusSubscribed = false;
const expressStatusHandler = (_event: unknown, payload: ExpressStatusChangedPayload) => {
  expressStatusListeners.forEach((listener) => {
    listener(payload);
  });
};

const updateLoadingStateListeners = new Set<(payload: UpdateLoadingState) => void>();
let updateLoadingStateSubscribed = false;
const updateLoadingStateHandler = (_event: unknown, payload: UpdateLoadingState) => {
  updateLoadingStateListeners.forEach((listener) => {
    listener(payload);
  });
};

const updateStateListeners = new Set<(payload: UpdateState) => void>();
let updateStateSubscribed = false;
const updateStateHandler = (_event: unknown, payload: UpdateState) => {
  updateStateListeners.forEach((listener) => {
    listener(payload);
  });
};

ipcRenderer.on("UpdatesSV-DebugLog", (_event: unknown, payload: unknown) => {
  try {
    const data = payload as { level?: string; message?: string; data?: unknown; timestamp?: number };
    const level = String(data?.level || "log");
    const message = String(data?.message || "unknown");
    if (level === "error") {
      console.error(`[updates][main] ${message}`, data?.data);
      return;
    }
    console.log(`[updates][main] ${message}`, data?.data);
  } catch {
    console.log("[updates][main] debug payload parse failed");
  }
});

const devToolsChangedListeners = new Set<(payload: DevToolsChangedPayload) => void>();
let devToolsChangedSubscribed = false;
const devToolsChangedHandler = (_event: unknown, payload: DevToolsChangedPayload) => {
  devToolsChangedListeners.forEach((listener) => {
    listener(payload);
  });
};

const underdeckApi: UnderDeckApi = {
  i18n: {
    getCurrentLocale: () => ipcRenderer.invoke("I18nSV-GetCurrentLocale"),
    setCurrentLocale: (locale) => ipcRenderer.invoke("I18nSV-SetCurrentLocale", locale),
    listExternalLocales: () => ipcRenderer.invoke("I18nSV-ListExternalLocales"),
    getExternalMessages: (locale) => ipcRenderer.invoke("I18nSV-GetExternalMessages", locale),
    importLocaleFile: (sourcePath) => ipcRenderer.invoke("I18nSV-ImportLocaleFile", sourcePath),
    deleteExternalLocale: (locale) => ipcRenderer.invoke("I18nSV-DeleteExternalLocale", locale),
  },
  apps: {
    list: () => ipcRenderer.invoke("AppsSV-List"),
    add: (app) => ipcRenderer.invoke("AppsSV-add", app),
    update: (app) => ipcRenderer.invoke("AppsSV-update", app),
    find: (id) => ipcRenderer.invoke("AppsSV-find", id),
    delete: (id) => ipcRenderer.invoke("AppsSV-delete", id),
    execute: (id) => ipcRenderer.invoke("AppsSV-execute", id),
    reposition: (id, toPosition) => ipcRenderer.invoke("AppsSV-reposition", id, toPosition),
  },
  shortcuts: {
    getComboKeys: () => ipcRenderer.invoke("HortcutSV-GetComboKeys"),
    list: () => ipcRenderer.invoke("HortcutSV-List"),
    add: (shortcut) => ipcRenderer.invoke("HortcutSV-add", shortcut),
    update: (shortcut) => ipcRenderer.invoke("HortcutSV-update", shortcut),
    find: (id) => ipcRenderer.invoke("HortcutSV-find", id),
    delete: (id) => ipcRenderer.invoke("HortcutSV-delete", id),
    updateAll: (shortcuts) => ipcRenderer.invoke("HortcutSV-UpdateAll", shortcuts),
    isStarted: () => ipcRenderer.invoke("HortcutSV-IsStarted"),
    setEnabled: (enabled) => ipcRenderer.invoke("HortcutSV-SetEnabled", enabled),
  },
  observer: {
    publish: (payload) => {
      ipcRenderer.send("ObserverSV-Publish", payload);
    },
    subscribe: (listener) => {
      observerListeners.add(listener);
      if (!observerSubscribed) {
        ipcRenderer.on("ObserverSV-Event", observerEventHandler);
        observerSubscribed = true;
      }
      return () => {
        observerListeners.delete(listener);
        if (observerListeners.size === 0 && observerSubscribed) {
          ipcRenderer.removeListener("ObserverSV-Event", observerEventHandler);
          observerSubscribed = false;
        }
      };
    },
  },
  overlay: {
    getSettings: () => ipcRenderer.invoke("OverlaySV-GetSettings"),
    updateSettings: (patch) => ipcRenderer.invoke("OverlaySV-UpdateSettings", patch),
    closeWindow: () => ipcRenderer.invoke("OverlaySV-CloseWindow"),
  },
  express: {
    status: () => ipcRenderer.invoke("ExpressSV-Status"),
    start: (port = null, sourceId) => ipcRenderer.invoke("ExpressSV-Start", port, sourceId),
    stop: (sourceId) => ipcRenderer.invoke("ExpressSV-Stop", sourceId),
    notifyWebDeckChanged: () => ipcRenderer.invoke("ExpressSV-NotifyWebDeckChanged"),
    openExternal: (url) => ipcRenderer.invoke("ExpressSV-OpenExternal", url),
    getWebDeckAccessInfo: () => ipcRenderer.invoke("ExpressSV-GetWebDeckAccessInfo"),
    onStatusChanged: (listener) => {
      expressStatusListeners.add(listener);
      if (!expressStatusSubscribed) {
        ipcRenderer.on("ExpressSV-StatusChanged", expressStatusHandler);
        expressStatusSubscribed = true;
      }
      return () => {
        expressStatusListeners.delete(listener);
        if (expressStatusListeners.size === 0 && expressStatusSubscribed) {
          ipcRenderer.removeListener("ExpressSV-StatusChanged", expressStatusHandler);
          expressStatusSubscribed = false;
        }
      };
    },
  },
  updates: {
    getState: () => ipcRenderer.invoke("UpdateSV-GetState"),
    getLoadingState: () => ipcRenderer.invoke("UpdateSV-GetLoadingState"),
    setAutoDownload: (enabled) => ipcRenderer.invoke("UpdateSV-SetAutoDownload", enabled),
    check: () => ipcRenderer.invoke("UpdateSV-Check"),
    downloadInstall: () => ipcRenderer.invoke("UpdateSV-DownloadInstall"),
    onStateChanged: (listener) => {
      updateStateListeners.add(listener);
      if (!updateStateSubscribed) {
        ipcRenderer.on("UpdatesSV-StateChanged", updateStateHandler);
        updateStateSubscribed = true;
      }
      return () => {
        updateStateListeners.delete(listener);
        if (updateStateListeners.size === 0 && updateStateSubscribed) {
          ipcRenderer.removeListener("UpdatesSV-StateChanged", updateStateHandler);
          updateStateSubscribed = false;
        }
      };
    },
    onLoadingStateChanged: (listener) => {
      updateLoadingStateListeners.add(listener);
      if (!updateLoadingStateSubscribed) {
        ipcRenderer.on("UpdatesSV-LoadingStateChanged", updateLoadingStateHandler);
        updateLoadingStateSubscribed = true;
      }
      return () => {
        updateLoadingStateListeners.delete(listener);
        if (updateLoadingStateListeners.size === 0 && updateLoadingStateSubscribed) {
          ipcRenderer.removeListener("UpdatesSV-LoadingStateChanged", updateLoadingStateHandler);
          updateLoadingStateSubscribed = false;
        }
      };
    },
  },
  appSettings: {
    getWindows: () => ipcRenderer.invoke("AppSettingsSV-GetWindows"),
    setWindows: (patch) => ipcRenderer.invoke("AppSettingsSV-SetWindows", patch),
    getElectron: () => ipcRenderer.invoke("AppSettingsSV-GetElectron"),
    setElectron: (patch) => ipcRenderer.invoke("AppSettingsSV-SetElectron", patch),
    onDevToolsChanged: (listener) => {
      devToolsChangedListeners.add(listener);
      if (!devToolsChangedSubscribed) {
        ipcRenderer.on("AppSettingsSV-DevToolsChanged", devToolsChangedHandler);
        devToolsChangedSubscribed = true;
      }
      return () => {
        devToolsChangedListeners.delete(listener);
        if (devToolsChangedListeners.size === 0 && devToolsChangedSubscribed) {
          ipcRenderer.removeListener("AppSettingsSV-DevToolsChanged", devToolsChangedHandler);
          devToolsChangedSubscribed = false;
        }
      };
    },
  },
  dialog: {
    selectFile: (options) => ipcRenderer.invoke("DialogSV-SelectFile", options),
    selectSaveFile: (options) => ipcRenderer.invoke("DialogSV-SelectSaveFile", options),
    readFileAsDataUrl: (filePath) => ipcRenderer.invoke("DialogSV-ReadFileAsDataUrl", filePath),
  },
  media: {
    importFileToMediaUrl: (sourcePath, folderName, targetFileName) =>
      ipcRenderer.invoke("StorageSV-ImportFileToMediaUrl", sourcePath, folderName, targetFileName),
  },
  theme: {
    saveLocalBackground: (sourcePath, mediaType = null) =>
      ipcRenderer.invoke("ThemeSV-SaveLocalBackground", sourcePath, mediaType),
    getLocalWallpaper: () =>
      ipcRenderer.invoke("ThemeSV-GetLocalWallpaper"),
    listSavedStoreWallpapers: () =>
      ipcRenderer.invoke("ThemeSV-ListSavedStoreWallpapers"),
    downloadStoreWallpaper: (request) =>
      ipcRenderer.invoke("ThemeSV-DownloadStoreWallpaper", request),
    waitDownload: (jobId) =>
      ipcRenderer.invoke("ThemeSV-WaitDownload", jobId),
    uninstallStoreWallpaper: (key) =>
      ipcRenderer.invoke("ThemeSV-UninstallStoreWallpaper", key),
    uninstallLocalWallpaper: () =>
      ipcRenderer.invoke("ThemeSV-UninstallLocalWallpaper"),
    getPreferences: (defaultTheme, defaultBackground) =>
      ipcRenderer.invoke("ThemeSV-GetPreferences", defaultTheme, defaultBackground),
    setTheme: (theme) =>
      ipcRenderer.invoke("ThemeSV-SetTheme", theme, "APP_ELECTRON"),
    setBackground: (background) =>
      ipcRenderer.invoke("ThemeSV-SetBackground", background, "APP_ELECTRON"),
    onDownloadProgress: (listener) => {
      const wrapped = (_event: unknown, payload: ThemeDownloadProgress) => listener(payload);
      ipcRenderer.on("ThemeSV-DownloadProgress", wrapped);
      return () => {
        ipcRenderer.removeListener("ThemeSV-DownloadProgress", wrapped);
      };
    },
    onPreferencesChanged: (listener) => {
      themePreferencesListeners.add(listener);
      if (!themePreferencesSubscribed) {
        ipcRenderer.on("ThemeSV-PreferencesChanged", themePreferencesHandler);
        themePreferencesSubscribed = true;
      }
      return () => {
        themePreferencesListeners.delete(listener);
        if (themePreferencesListeners.size === 0 && themePreferencesSubscribed) {
          ipcRenderer.removeListener("ThemeSV-PreferencesChanged", themePreferencesHandler);
          themePreferencesSubscribed = false;
        }
      };
    },
  },
  soundpad: {
    getPath: () => ipcRenderer.invoke("SoundPadSV-GetPath"),
    setPath: (filePath) => ipcRenderer.invoke("SoundPadSV-SetPath", filePath),
    verify: () => ipcRenderer.invoke("SoundPadSV-Verify"),
    listAudios: () => ipcRenderer.invoke("SoundPadSV-ListAudios"),
    executeCommand: (command) => ipcRenderer.invoke("SoundPadSV-ExecuteCommand", command),
    playSound: (index) => ipcRenderer.invoke("SoundPadSV-PlaySound", index),
    repeatCurrent: () => ipcRenderer.invoke("SoundPadSV-RepeatCurrent"),
    stopSound: () => ipcRenderer.invoke("SoundPadSV-StopSound"),
    togglePause: () => ipcRenderer.invoke("SoundPadSV-TogglePause"),
    onAudiosChanged: (listener) => {
      soundPadListeners.add(listener);
      if (!soundPadSubscribed) {
        ipcRenderer.on("SoundPadSV-AudiosChanged", soundPadEventHandler);
        ipcRenderer.send("SoundPadSV-SubscribeAudiosChanged");
        soundPadSubscribed = true;
      }
      return () => {
        soundPadListeners.delete(listener);
        if (soundPadListeners.size === 0 && soundPadSubscribed) {
          ipcRenderer.removeListener("SoundPadSV-AudiosChanged", soundPadEventHandler);
          ipcRenderer.send("SoundPadSV-UnsubscribeAudiosChanged");
          soundPadSubscribed = false;
        }
      };
    },
  },
  obs: {
    getSettings: () => ipcRenderer.invoke("ObsSV-GetSettings"),
    getState: () => ipcRenderer.invoke("ObsSV-GetState"),
    refreshState: () => ipcRenderer.invoke("ObsSV-RefreshState"),
    updateSettings: (patch, options) => ipcRenderer.invoke("ObsSV-UpdateSettings", patch, options),
    connect: (config) => ipcRenderer.invoke("ObsSV-Connect", config),
    disconnect: () => ipcRenderer.invoke("ObsSV-Disconnect"),
    listScenes: () => ipcRenderer.invoke("ObsSV-ListScenes"),
    listAudioInputs: () => ipcRenderer.invoke("ObsSV-ListAudioInputs"),
    setCurrentScene: (sceneName) => ipcRenderer.invoke("ObsSV-SetCurrentScene", sceneName),
    setInputMute: (inputNameOrUuid, muted) => ipcRenderer.invoke("ObsSV-SetInputMute", inputNameOrUuid, muted),
    toggleInputMute: (inputNameOrUuid) => ipcRenderer.invoke("ObsSV-ToggleInputMute", inputNameOrUuid),
    startStream: () => ipcRenderer.invoke("ObsSV-StartStream"),
    stopStream: () => ipcRenderer.invoke("ObsSV-StopStream"),
    toggleStream: () => ipcRenderer.invoke("ObsSV-ToggleStream"),
    startRecord: () => ipcRenderer.invoke("ObsSV-StartRecord"),
    stopRecord: () => ipcRenderer.invoke("ObsSV-StopRecord"),
    toggleRecordPause: () => ipcRenderer.invoke("ObsSV-ToggleRecordPause"),
    pauseRecord: () => ipcRenderer.invoke("ObsSV-PauseRecord"),
    resumeRecord: () => ipcRenderer.invoke("ObsSV-ResumeRecord"),
    onStateChanged: (listener) => {
      obsStateListeners.add(listener);
      if (!obsStateSubscribed) {
        ipcRenderer.on("ObsSV-StateChanged", obsStateEventHandler);
        ipcRenderer.send("ObsSV-SubscribeStateChanged");
        obsStateSubscribed = true;
      }
      return () => {
        obsStateListeners.delete(listener);
        if (obsStateListeners.size === 0 && obsStateSubscribed) {
          ipcRenderer.removeListener("ObsSV-StateChanged", obsStateEventHandler);
          ipcRenderer.send("ObsSV-UnsubscribeStateChanged");
          obsStateSubscribed = false;
        }
      };
    },
  },
  webdeck: {
    listPages: () => ipcRenderer.invoke("WebDeckSV-ListPages"),
    findPage: (id) => ipcRenderer.invoke("WebDeckSV-FindPage", id),
    createPage: (payload, sourceId) => ipcRenderer.invoke("WebDeckSV-CreatePage", payload, sourceId),
    updatePage: (payload, sourceId) => ipcRenderer.invoke("WebDeckSV-UpdatePage", payload, sourceId),
    deletePage: (id, sourceId) => ipcRenderer.invoke("WebDeckSV-DeletePage", id, sourceId),
    setGrid: (pageId, gridCols, gridRows, sourceId) => ipcRenderer.invoke("WebDeckSV-SetGrid", pageId, gridCols, gridRows, sourceId),
    upsertItem: (pageId, index, item, sourceId) => ipcRenderer.invoke("WebDeckSV-UpsertItem", pageId, index, item, sourceId),
    removeItem: (pageId, index, sourceId) => ipcRenderer.invoke("WebDeckSV-RemoveItem", pageId, index, sourceId),
    moveItem: (pageId, fromIndex, toIndex, sourceId) => ipcRenderer.invoke("WebDeckSV-MoveItem", pageId, fromIndex, toIndex, sourceId),
    listAutoIcons: () => ipcRenderer.invoke("WebDeckSV-ListAutoIcons"),
    setAutoPageIcon: (rootId, iconSource = null, sourceId) => ipcRenderer.invoke("WebDeckSV-SetAutoPageIcon", rootId, iconSource, sourceId),
    setAutoItemIcon: (itemKey, iconSource = null, sourceId) => ipcRenderer.invoke("WebDeckSV-SetAutoItemIcon", itemKey, iconSource, sourceId),
    onChanged: (listener) => {
      webDeckChangedListeners.add(listener);
      if (!webDeckChangedSubscribed) {
        ipcRenderer.on("WebDeckSV-Changed", webDeckChangedHandler);
        webDeckChangedSubscribed = true;
      }
      return () => {
        webDeckChangedListeners.delete(listener);
        if (webDeckChangedListeners.size === 0 && webDeckChangedSubscribed) {
          ipcRenderer.removeListener("WebDeckSV-Changed", webDeckChangedHandler);
          webDeckChangedSubscribed = false;
        }
      };
    },
  },
};

contextBridge.exposeInMainWorld("underdeck", underdeckApi);
