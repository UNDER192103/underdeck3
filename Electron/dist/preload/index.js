"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const soundPadListeners = new Set();
let soundPadSubscribed = false;
const soundPadEventHandler = (_event, audios) => {
    soundPadListeners.forEach((listener) => {
        listener(audios);
    });
};
const obsStateListeners = new Set();
let obsStateSubscribed = false;
const obsStateEventHandler = (_event, state) => {
    obsStateListeners.forEach((listener) => {
        listener(state);
    });
};
const observerListeners = new Set();
let observerSubscribed = false;
const observerEventHandler = (_event, payload) => {
    observerListeners.forEach((listener) => {
        listener(payload);
    });
};
const webDeckChangedListeners = new Set();
let webDeckChangedSubscribed = false;
const webDeckChangedHandler = (_event, payload) => {
    webDeckChangedListeners.forEach((listener) => {
        listener(payload);
    });
};
const themePreferencesListeners = new Set();
let themePreferencesSubscribed = false;
const themePreferencesHandler = (_event, payload) => {
    themePreferencesListeners.forEach((listener) => {
        listener(payload);
    });
};
const expressStatusListeners = new Set();
let expressStatusSubscribed = false;
const expressStatusHandler = (_event, payload) => {
    expressStatusListeners.forEach((listener) => {
        listener(payload);
    });
};
const updateLoadingStateListeners = new Set();
let updateLoadingStateSubscribed = false;
const updateLoadingStateHandler = (_event, payload) => {
    updateLoadingStateListeners.forEach((listener) => {
        listener(payload);
    });
};
const underdeckApi = {
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
    dialog: {
        selectFile: (options) => ipcRenderer.invoke("DialogSV-SelectFile", options),
        selectSaveFile: (options) => ipcRenderer.invoke("DialogSV-SelectSaveFile", options),
        readFileAsDataUrl: (filePath) => ipcRenderer.invoke("DialogSV-ReadFileAsDataUrl", filePath),
    },
    media: {
        importFileToMediaUrl: (sourcePath, folderName, targetFileName) => ipcRenderer.invoke("StorageSV-ImportFileToMediaUrl", sourcePath, folderName, targetFileName),
    },
    theme: {
        saveLocalBackground: (sourcePath, mediaType = null) => ipcRenderer.invoke("ThemeSV-SaveLocalBackground", sourcePath, mediaType),
        getLocalWallpaper: () => ipcRenderer.invoke("ThemeSV-GetLocalWallpaper"),
        listSavedStoreWallpapers: () => ipcRenderer.invoke("ThemeSV-ListSavedStoreWallpapers"),
        downloadStoreWallpaper: (request) => ipcRenderer.invoke("ThemeSV-DownloadStoreWallpaper", request),
        waitDownload: (jobId) => ipcRenderer.invoke("ThemeSV-WaitDownload", jobId),
        uninstallStoreWallpaper: (key) => ipcRenderer.invoke("ThemeSV-UninstallStoreWallpaper", key),
        uninstallLocalWallpaper: () => ipcRenderer.invoke("ThemeSV-UninstallLocalWallpaper"),
        getPreferences: (defaultTheme, defaultBackground) => ipcRenderer.invoke("ThemeSV-GetPreferences", defaultTheme, defaultBackground),
        setTheme: (theme) => ipcRenderer.invoke("ThemeSV-SetTheme", theme, "APP_ELECTRON"),
        setBackground: (background) => ipcRenderer.invoke("ThemeSV-SetBackground", background, "APP_ELECTRON"),
        onDownloadProgress: (listener) => {
            const wrapped = (_event, payload) => listener(payload);
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
