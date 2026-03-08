import electron from "electron";
const { ipcMain, shell, BrowserWindow } = electron;
import { TranslationService } from "./translations.js";
import { Settings } from "./settings.js";
export class IpcmainService {
    AppService;
    express;
    hortcutService;
    fileDialog;
    translationService;
    themeService;
    soundPadService;
    obsService;
    webDeckService;
    updaterService;
    onOverlaySettingsChanged;
    onLocaleChanged;
    soundPadSubscriptions = new Map();
    obsSubscriptions = new Map();
    constructor(AppService, express, hortcutService, fileDialog, themeService, soundPadService, obsService, webDeckService, updaterService, onOverlaySettingsChanged, onLocaleChanged) {
        this.AppService = AppService;
        this.express = express;
        this.hortcutService = hortcutService;
        this.fileDialog = fileDialog;
        this.translationService = new TranslationService();
        this.themeService = themeService;
        this.soundPadService = soundPadService;
        this.obsService = obsService;
        this.webDeckService = webDeckService;
        this.updaterService = updaterService;
        this.onOverlaySettingsChanged = onOverlaySettingsChanged;
        this.onLocaleChanged = onLocaleChanged;
    }
    unsubscribeSoundPadAudiosChangedBySenderId(senderId) {
        const unsubscribe = this.soundPadSubscriptions.get(senderId);
        if (!unsubscribe)
            return;
        unsubscribe();
        this.soundPadSubscriptions.delete(senderId);
    }
    subscribeSoundPadAudiosChanged(event) {
        const senderId = event.sender.id;
        this.unsubscribeSoundPadAudiosChangedBySenderId(senderId);
        const listener = async () => {
            if (event.sender.isDestroyed()) {
                this.unsubscribeSoundPadAudiosChangedBySenderId(senderId);
                return;
            }
            const audios = await this.soundPadService.listAudios();
            event.sender.send("SoundPadSV-AudiosChanged", audios);
        };
        this.soundPadService.on("audios-changed", listener);
        const unsubscribe = () => {
            this.soundPadService.off("audios-changed", listener);
        };
        this.soundPadSubscriptions.set(senderId, unsubscribe);
        event.sender.once("destroyed", () => {
            this.unsubscribeSoundPadAudiosChangedBySenderId(senderId);
        });
        void listener();
    }
    unsubscribeObsStateChangedBySenderId(senderId) {
        const unsubscribe = this.obsSubscriptions.get(senderId);
        if (!unsubscribe)
            return;
        unsubscribe();
        this.obsSubscriptions.delete(senderId);
    }
    subscribeObsStateChanged(event) {
        const senderId = event.sender.id;
        this.unsubscribeObsStateChangedBySenderId(senderId);
        const listener = (state) => {
            if (event.sender.isDestroyed()) {
                this.unsubscribeObsStateChangedBySenderId(senderId);
                return;
            }
            event.sender.send("ObsSV-StateChanged", state);
        };
        this.obsService.on("state-changed", listener);
        const unsubscribe = () => {
            this.obsService.off("state-changed", listener);
        };
        this.obsSubscriptions.set(senderId, unsubscribe);
        event.sender.once("destroyed", () => {
            this.unsubscribeObsStateChangedBySenderId(senderId);
        });
        void this.obsService.getState().then((state) => {
            if (event.sender.isDestroyed())
                return;
            event.sender.send("ObsSV-StateChanged", state);
        });
    }
    notifyWebDeckChangedClients(sourceId) {
        const payload = {
            sourceId: String(sourceId || "UNKNOWN"),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed())
                return;
            try {
                win.webContents.send("WebDeckSV-Changed", payload);
            }
            catch {
                // ignore broadcast errors
            }
        });
    }
    notifyExpressStatusChangedClients(sourceId) {
        const express = Settings.get("express");
        const payload = {
            sourceId: String(sourceId || "UNKNOWN"),
            enabled: Boolean(express?.enabled),
            port: Number(express?.port ?? 59231),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed())
                return;
            try {
                win.webContents.send("ExpressSV-StatusChanged", payload);
            }
            catch {
                // ignore broadcast errors
            }
        });
    }
    notifyThemePreferencesChangedClients(sourceId) {
        const payload = {
            sourceId: String(sourceId || "UNKNOWN"),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed())
                return;
            try {
                win.webContents.send("ThemeSV-PreferencesChanged", payload);
            }
            catch {
                // ignore broadcast errors
            }
        });
    }
    publishObserverEvent(payload, senderId) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed())
                return;
            if (senderId && win.webContents.id === senderId)
                return;
            try {
                win.webContents.send("ObserverSV-Event", payload);
            }
            catch {
                // ignore broadcast errors
            }
        });
    }
    start() {
        ipcMain.on("ObserverSV-Publish", (event, raw) => {
            const payload = {
                id: String(raw?.id || "unknown"),
                channel: String(raw?.channel || "global"),
                data: raw?.data,
                sourceId: String(raw?.sourceId || "UNKNOWN"),
                timestamp: Number(raw?.timestamp || Date.now()),
            };
            this.publishObserverEvent(payload, event.sender.id);
        });
        ipcMain.handle("AppsSV-List", async () => await this.AppService.listApps());
        ipcMain.handle("AppsSV-add", async (_event, app) => await this.AppService.addApp(app));
        ipcMain.handle("AppsSV-update", async (_event, app) => await this.AppService.updateApp(app));
        ipcMain.handle("AppsSV-find", async (_event, id) => await this.AppService.findApp(id));
        ipcMain.handle("AppsSV-delete", async (_event, id) => {
            const result = await this.AppService.deleteApp(id);
            const shortcuts = await this.AppService.listShortcuts();
            await this.hortcutService.updateDataMacros(shortcuts);
            return result;
        });
        ipcMain.handle("AppsSV-execute", async (_event, id) => await this.AppService.executeApp(id));
        ipcMain.handle("AppsSV-reposition", async (_event, id, toPosition) => await this.AppService.repositionApp(id, toPosition));
        ipcMain.handle("HortcutSV-GetComboKeys", async () => await this.hortcutService.getComboKeys());
        ipcMain.handle("HortcutSV-List", async () => await this.AppService.listShortcuts());
        ipcMain.handle("HortcutSV-add", async (_event, shortcut) => await this.AppService.addShortcut(shortcut));
        ipcMain.handle("HortcutSV-update", async (_event, shortcut) => await this.AppService.updateShortcut(shortcut));
        ipcMain.handle("HortcutSV-find", async (_event, id) => await this.AppService.findShortcut(id));
        ipcMain.handle("HortcutSV-delete", async (_event, id) => await this.AppService.deleteShortcut(id));
        ipcMain.handle("HortcutSV-UpdateAll", async (_event, shortcuts) => await this.hortcutService.updateDataMacros(shortcuts));
        ipcMain.handle("HortcutSV-IsStarted", async () => this.hortcutService.isStarted());
        ipcMain.handle("HortcutSV-SetEnabled", async (_event, enabled) => {
            Settings.set("shortcuts", {
                ...Settings.get("shortcuts"),
                enalbed: enabled,
            });
            if (enabled) {
                const shortcuts = await this.AppService.listShortcuts();
                await this.hortcutService.updateDataMacros(shortcuts);
                this.hortcutService.start();
            }
            else {
                this.hortcutService.stop();
            }
            if (this.onOverlaySettingsChanged) {
                await this.onOverlaySettingsChanged();
            }
            return this.hortcutService.isStarted();
        });
        ipcMain.handle("OverlaySV-GetSettings", async () => {
            const raw = Settings.get("overlay");
            return {
                enabled: Boolean(raw?.enabled),
                keys: Array.isArray(raw?.keys)
                    ? raw.keys.map((key) => String(key || "").trim()).filter(Boolean)
                    : [],
                closeOnBlur: typeof raw?.closeOnBlur === "boolean" ? raw.closeOnBlur : true,
            };
        });
        ipcMain.handle("OverlaySV-UpdateSettings", async (_event, patch) => {
            const current = Settings.get("overlay");
            const next = {
                enabled: typeof patch?.enabled === "boolean" ? patch.enabled : Boolean(current?.enabled),
                keys: Array.isArray(patch?.keys)
                    ? patch.keys.map((key) => String(key || "").trim()).filter(Boolean)
                    : (Array.isArray(current?.keys) ? current.keys : []),
                closeOnBlur: typeof patch?.closeOnBlur === "boolean"
                    ? patch.closeOnBlur
                    : (typeof current?.closeOnBlur === "boolean" ? current.closeOnBlur : true),
            };
            Settings.set("overlay", next);
            if (this.onOverlaySettingsChanged) {
                await this.onOverlaySettingsChanged();
            }
            return next;
        });
        ipcMain.handle("OverlaySV-CloseWindow", async (event) => {
            const win = electron.BrowserWindow.fromWebContents(event.sender);
            if (!win || win.isDestroyed())
                return false;
            if (win.isVisible()) {
                win.hide();
            }
            return true;
        });
        ipcMain.handle("ExpressSV-Status", async () => this.express.satus());
        ipcMain.handle("ExpressSV-Start", async (_event, port, sourceId) => {
            Settings.set("express", {
                port: port ?? Settings.get("express").port,
                enabled: true,
            });
            const started = await this.express.start(Settings.get("express").port);
            this.notifyExpressStatusChangedClients(sourceId);
            return started;
        });
        ipcMain.handle("ExpressSV-Stop", async (_event, sourceId) => {
            Settings.set("express", {
                ...Settings.get("express"),
                enabled: false,
            });
            const stopped = await this.express.stop();
            this.notifyExpressStatusChangedClients(sourceId);
            return stopped;
        });
        ipcMain.handle("ExpressSV-NotifyWebDeckChanged", async () => {
            return this.express.notifyWebDeckChanged();
        });
        ipcMain.handle("ExpressSV-GetWebDeckAccessInfo", async () => {
            return this.express.getWebDeckAccessInfo();
        });
        ipcMain.handle("ExpressSV-OpenExternal", async (_event, url) => {
            const target = String(url ?? "").trim();
            if (!target)
                return false;
            try {
                await shell.openExternal(target);
                return true;
            }
            catch {
                return false;
            }
        });
        ipcMain.handle("DialogSV-SelectFile", async (_event, options) => {
            return this.fileDialog.selectFile(options);
        });
        ipcMain.handle("DialogSV-SelectSaveFile", async (_event, options) => {
            return this.fileDialog.selectSavePath(options);
        });
        ipcMain.handle("DialogSV-ReadFileAsDataUrl", async (_event, filePath) => {
            return this.fileDialog.readFileAsDataUrl(filePath);
        });
        ipcMain.handle("StorageSV-ImportFileToMediaUrl", async (_event, sourcePath, folderName, targetFileName) => {
            const imported = this.AppService.importFileToStorage(sourcePath, folderName, targetFileName);
            return imported?.mediaUrl ?? null;
        });
        ipcMain.handle("ThemeSV-SaveLocalBackground", async (_event, sourcePath, mediaType) => {
            return this.themeService.saveLocalBackground(sourcePath, mediaType);
        });
        ipcMain.handle("ThemeSV-GetLocalWallpaper", async () => {
            return this.themeService.getLocalWallpaper();
        });
        ipcMain.handle("ThemeSV-ListSavedStoreWallpapers", async () => {
            return this.themeService.listSavedStoreWallpapers();
        });
        ipcMain.handle("ThemeSV-DownloadStoreWallpaper", async (event, request) => {
            return this.themeService.startStoreDownload(request, (payload) => {
                event.sender.send("ThemeSV-DownloadProgress", payload);
            });
        });
        ipcMain.handle("ThemeSV-WaitDownload", async (_event, jobId) => {
            return this.themeService.waitDownload(jobId);
        });
        ipcMain.handle("ThemeSV-UninstallStoreWallpaper", async (_event, key) => {
            return this.themeService.uninstallStoreWallpaper(key);
        });
        ipcMain.handle("ThemeSV-UninstallLocalWallpaper", async () => {
            return this.themeService.uninstallLocalWallpaper();
        });
        ipcMain.handle("ThemeSV-GetPreferences", async (_event, defaultTheme, defaultBackground) => {
            return this.themeService.getPreferences(defaultTheme, defaultBackground);
        });
        ipcMain.handle("ThemeSV-SetTheme", async (_event, theme, sourceId) => {
            const result = this.themeService.setTheme(theme);
            this.notifyThemePreferencesChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("ThemeSV-SetBackground", async (_event, background, sourceId) => {
            const result = this.themeService.setBackground(background);
            this.notifyThemePreferencesChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("SoundPadSV-GetPath", async () => this.soundPadService.getPath());
        ipcMain.handle("SoundPadSV-SetPath", async (_event, filePath) => this.soundPadService.setPath(filePath));
        ipcMain.handle("SoundPadSV-Verify", async () => this.soundPadService.verify());
        ipcMain.handle("SoundPadSV-ListAudios", async () => this.soundPadService.listAudios());
        ipcMain.handle("SoundPadSV-ExecuteCommand", async (_event, command) => this.soundPadService.executeCommand(command));
        ipcMain.handle("SoundPadSV-PlaySound", async (_event, index) => this.soundPadService.playSound(index));
        ipcMain.handle("SoundPadSV-RepeatCurrent", async () => this.soundPadService.repeatCurrentSound());
        ipcMain.handle("SoundPadSV-StopSound", async () => this.soundPadService.stopSound());
        ipcMain.handle("SoundPadSV-TogglePause", async () => this.soundPadService.togglePause());
        ipcMain.on("SoundPadSV-SubscribeAudiosChanged", (event) => this.subscribeSoundPadAudiosChanged(event));
        ipcMain.on("SoundPadSV-UnsubscribeAudiosChanged", (event) => {
            this.unsubscribeSoundPadAudiosChangedBySenderId(event.sender.id);
        });
        ipcMain.handle("ObsSV-GetSettings", async () => this.obsService.getSettings());
        ipcMain.handle("ObsSV-GetState", async () => this.obsService.getState());
        ipcMain.handle("ObsSV-RefreshState", async () => {
            await this.obsService.refreshState();
            return this.obsService.getState();
        });
        ipcMain.handle("ObsSV-UpdateSettings", async (_event, patch, options) => this.obsService.updateSettings(patch, options));
        ipcMain.handle("ObsSV-Connect", async (_event, config) => this.obsService.connect(config));
        ipcMain.handle("ObsSV-Disconnect", async () => this.obsService.disconnect());
        ipcMain.handle("ObsSV-ListScenes", async () => this.obsService.listScenes());
        ipcMain.handle("ObsSV-ListAudioInputs", async () => this.obsService.listAudioInputs());
        ipcMain.handle("ObsSV-SetCurrentScene", async (_event, sceneName) => this.obsService.setCurrentScene(sceneName));
        ipcMain.handle("ObsSV-SetInputMute", async (_event, inputNameOrUuid, muted) => this.obsService.setInputMute(inputNameOrUuid, muted));
        ipcMain.handle("ObsSV-ToggleInputMute", async (_event, inputNameOrUuid) => this.obsService.toggleInputMute(inputNameOrUuid));
        ipcMain.handle("ObsSV-StartStream", async () => this.obsService.startStream());
        ipcMain.handle("ObsSV-StopStream", async () => this.obsService.stopStream());
        ipcMain.handle("ObsSV-ToggleStream", async () => this.obsService.toggleStream());
        ipcMain.handle("ObsSV-StartRecord", async () => this.obsService.startRecord());
        ipcMain.handle("ObsSV-StopRecord", async () => this.obsService.stopRecord());
        ipcMain.handle("ObsSV-ToggleRecordPause", async () => this.obsService.toggleRecordPause());
        ipcMain.handle("ObsSV-PauseRecord", async () => this.obsService.pauseRecord());
        ipcMain.handle("ObsSV-ResumeRecord", async () => this.obsService.resumeRecord());
        ipcMain.on("ObsSV-SubscribeStateChanged", (event) => this.subscribeObsStateChanged(event));
        ipcMain.on("ObsSV-UnsubscribeStateChanged", (event) => {
            this.unsubscribeObsStateChangedBySenderId(event.sender.id);
        });
        ipcMain.handle("WebDeckSV-ListPages", async () => this.webDeckService.listPages());
        ipcMain.handle("WebDeckSV-FindPage", async (_event, id) => this.webDeckService.findPage(id));
        ipcMain.handle("WebDeckSV-CreatePage", async (_event, payload, sourceId) => {
            const result = await this.webDeckService.createPage(payload);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-UpdatePage", async (_event, payload, sourceId) => {
            const result = await this.webDeckService.updatePage(payload);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-DeletePage", async (_event, id, sourceId) => {
            const result = await this.webDeckService.deletePage(id);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-SetGrid", async (_event, pageId, gridCols, gridRows, sourceId) => {
            const result = await this.webDeckService.setGrid(pageId, gridCols, gridRows);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-UpsertItem", async (_event, pageId, index, item, sourceId) => {
            const result = await this.webDeckService.upsertItem(pageId, index, item);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-RemoveItem", async (_event, pageId, index, sourceId) => {
            const result = await this.webDeckService.removeItem(pageId, index);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-MoveItem", async (_event, pageId, fromIndex, toIndex, sourceId) => {
            const result = await this.webDeckService.moveItem(pageId, fromIndex, toIndex);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-ListAutoIcons", async () => this.webDeckService.listAutoIcons());
        ipcMain.handle("WebDeckSV-SetAutoPageIcon", async (_event, rootId, iconSource, sourceId) => {
            const result = await this.webDeckService.setAutoPageIcon(rootId, iconSource ?? null);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-SetAutoItemIcon", async (_event, itemKey, iconSource, sourceId) => {
            const result = await this.webDeckService.setAutoItemIcon(itemKey, iconSource ?? null);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("I18nSV-GetCurrentLocale", async () => {
            return this.translationService.getCurrentLocale();
        });
        ipcMain.handle("I18nSV-SetCurrentLocale", async (_event, locale) => {
            const next = this.translationService.setCurrentLocale(locale);
            if (this.onLocaleChanged) {
                await this.onLocaleChanged();
            }
            return next;
        });
        ipcMain.handle("I18nSV-ListExternalLocales", async () => {
            return this.translationService.listExternalLocales();
        });
        ipcMain.handle("I18nSV-GetExternalMessages", async (_event, locale) => {
            return this.translationService.getExternalMessages(locale);
        });
        ipcMain.handle("I18nSV-ImportLocaleFile", async (_event, sourcePath) => {
            return this.translationService.importLocaleFile(sourcePath);
        });
        ipcMain.handle("I18nSV-DeleteExternalLocale", async (_event, locale) => {
            return this.translationService.deleteExternalLocale(locale);
        });
        ipcMain.handle("UpdateSV-GetState", async () => {
            return this.updaterService.getState();
        });
        ipcMain.handle("UpdateSV-GetLoadingState", async () => {
            return this.updaterService.getLoadingState();
        });
        ipcMain.handle("UpdateSV-SetAutoDownload", async (_event, enabled) => {
            return this.updaterService.setAutoDownloadWhenAvailable(Boolean(enabled));
        });
        ipcMain.handle("UpdateSV-Check", async () => {
            await this.updaterService.checkForStartupUpdates();
            return this.updaterService.getState();
        });
        ipcMain.handle("UpdateSV-DownloadInstall", async () => {
            return this.updaterService.downloadAndInstall();
        });
    }
}
