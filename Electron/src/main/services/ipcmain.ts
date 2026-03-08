import electron from "electron";
const { ipcMain, shell, BrowserWindow } = electron;
import { MainAppService } from "./main-app.js";
import { ExpressServer } from "./express.js";
import { Shortcutkey } from "./shortcutkeys.js";
import { App } from "../../types/apps.js";
import { Shortcut } from "../../types/shortcuts.js";
import { FileDialogService } from "./file-dialog.js";
import { SaveFileOptions, SelectFileOptions } from "../../types/file-dialog.js";
import { TranslationService } from "./translations.js";
import { ThemeService } from "./theme.js";
import { ThemeDownloadRequest } from "../../types/theme.js";
import { Settings } from "./settings.js";
import { SoundPadService } from "./soundpad.js";
import { ObsService, ObsState } from "./obs.js";
import { WebDeckService } from "./webdeck.js";
import { OverlaySettings } from "../../types/overlay.js";
import { UpdaterService } from "./updater.js";
type WebDeckChangedPayload = { sourceId: string; timestamp: number };
type ExpressStatusChangedPayload = { sourceId: string; enabled: boolean; port: number; timestamp: number };
type ThemePreferencesChangedPayload = { sourceId: string; timestamp: number };
type ObserverPayload = {
    id: string;
    channel: string;
    data?: unknown;
    sourceId: string;
    timestamp: number;
};

export class IpcmainService {
    private AppService: MainAppService;
    private express: ExpressServer;
    private hortcutService: Shortcutkey;
    private fileDialog: FileDialogService;
    private translationService: TranslationService;
    private themeService: ThemeService;
    private soundPadService: SoundPadService;
    private obsService: ObsService;
    private webDeckService: WebDeckService;
    private updaterService: UpdaterService;
    private onOverlaySettingsChanged?: () => Promise<void> | void;
    private onLocaleChanged?: () => Promise<void> | void;
    private soundPadSubscriptions = new Map<number, () => void>();
    private obsSubscriptions = new Map<number, () => void>();

    constructor(
        AppService: MainAppService,
        express: ExpressServer,
        hortcutService: Shortcutkey,
        fileDialog: FileDialogService,
        themeService: ThemeService,
        soundPadService: SoundPadService,
        obsService: ObsService,
        webDeckService: WebDeckService,
        updaterService: UpdaterService,
        onOverlaySettingsChanged?: () => Promise<void> | void,
        onLocaleChanged?: () => Promise<void> | void
    ) {
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

    private unsubscribeSoundPadAudiosChangedBySenderId(senderId: number) {
        const unsubscribe = this.soundPadSubscriptions.get(senderId);
        if (!unsubscribe) return;
        unsubscribe();
        this.soundPadSubscriptions.delete(senderId);
    }

    private subscribeSoundPadAudiosChanged(event: Electron.IpcMainEvent) {
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

    private unsubscribeObsStateChangedBySenderId(senderId: number) {
        const unsubscribe = this.obsSubscriptions.get(senderId);
        if (!unsubscribe) return;
        unsubscribe();
        this.obsSubscriptions.delete(senderId);
    }

    private subscribeObsStateChanged(event: Electron.IpcMainEvent) {
        const senderId = event.sender.id;
        this.unsubscribeObsStateChangedBySenderId(senderId);

        const listener = (state: ObsState) => {
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
            if (event.sender.isDestroyed()) return;
            event.sender.send("ObsSV-StateChanged", state);
        });
    }

    private notifyWebDeckChangedClients(sourceId?: string) {
        const payload: WebDeckChangedPayload = {
            sourceId: String(sourceId || "UNKNOWN"),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed()) return;
            try {
                win.webContents.send("WebDeckSV-Changed", payload);
            } catch {
                // ignore broadcast errors
            }
        });
    }

    private notifyExpressStatusChangedClients(sourceId?: string) {
        const express = Settings.get("express");
        const payload: ExpressStatusChangedPayload = {
            sourceId: String(sourceId || "UNKNOWN"),
            enabled: Boolean(express?.enabled),
            port: Number(express?.port ?? 59231),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed()) return;
            try {
                win.webContents.send("ExpressSV-StatusChanged", payload);
            } catch {
                // ignore broadcast errors
            }
        });
    }

    private notifyThemePreferencesChangedClients(sourceId?: string) {
        const payload: ThemePreferencesChangedPayload = {
            sourceId: String(sourceId || "UNKNOWN"),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed()) return;
            try {
                win.webContents.send("ThemeSV-PreferencesChanged", payload);
            } catch {
                // ignore broadcast errors
            }
        });
    }

    private publishObserverEvent(payload: ObserverPayload, senderId?: number) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed()) return;
            if (senderId && win.webContents.id === senderId) return;
            try {
                win.webContents.send("ObserverSV-Event", payload);
            } catch {
                // ignore broadcast errors
            }
        });
    }

    start() {
        ipcMain.on("ObserverSV-Publish", (event, raw: Partial<ObserverPayload>) => {
            const payload: ObserverPayload = {
                id: String(raw?.id || "unknown"),
                channel: String(raw?.channel || "global"),
                data: raw?.data,
                sourceId: String(raw?.sourceId || "UNKNOWN"),
                timestamp: Number(raw?.timestamp || Date.now()),
            };
            this.publishObserverEvent(payload, event.sender.id);
        });

        ipcMain.handle("AppsSV-List", async () => await this.AppService.listApps());
        ipcMain.handle("AppsSV-add", async (_event, app: App) => await this.AppService.addApp(app));
        ipcMain.handle("AppsSV-update", async (_event, app: App) => await this.AppService.updateApp(app));
        ipcMain.handle("AppsSV-find", async (_event, id: string) => await this.AppService.findApp(id));
        ipcMain.handle("AppsSV-delete", async (_event, id: string) => {
            const result = await this.AppService.deleteApp(id);
            const shortcuts = await this.AppService.listShortcuts();
            await this.hortcutService.updateDataMacros(shortcuts);
            return result;
        });
        ipcMain.handle("AppsSV-execute", async (_event, id: string) => await this.AppService.executeApp(id));
        ipcMain.handle("AppsSV-reposition", async (_event, id: string, toPosition: number) => await this.AppService.repositionApp(id, toPosition));

        ipcMain.handle("HortcutSV-GetComboKeys", async () => await this.hortcutService.getComboKeys());
        ipcMain.handle("HortcutSV-List", async () => await this.AppService.listShortcuts());
        ipcMain.handle("HortcutSV-add", async (_event, shortcut: Shortcut) => await this.AppService.addShortcut(shortcut));
        ipcMain.handle("HortcutSV-update", async (_event, shortcut: Shortcut) => await this.AppService.updateShortcut(shortcut));
        ipcMain.handle("HortcutSV-find", async (_event, id: string) => await this.AppService.findShortcut(id));
        ipcMain.handle("HortcutSV-delete", async (_event, id: string) => await this.AppService.deleteShortcut(id));
        ipcMain.handle("HortcutSV-UpdateAll", async (_event, shortcuts: Shortcut[]) => await this.hortcutService.updateDataMacros(shortcuts));
        ipcMain.handle("HortcutSV-IsStarted", async () => this.hortcutService.isStarted());
        ipcMain.handle("HortcutSV-SetEnabled", async (_event, enabled: boolean) => {
            Settings.set("shortcuts", {
                ...Settings.get("shortcuts"),
                enalbed: enabled,
            });
            if (enabled) {
                const shortcuts = await this.AppService.listShortcuts();
                await this.hortcutService.updateDataMacros(shortcuts);
                this.hortcutService.start();
            } else {
                this.hortcutService.stop();
            }
            if (this.onOverlaySettingsChanged) {
                await this.onOverlaySettingsChanged();
            }
            return this.hortcutService.isStarted();
        });

        ipcMain.handle("OverlaySV-GetSettings", async (): Promise<OverlaySettings> => {
            const raw = Settings.get("overlay");
            return {
                enabled: Boolean(raw?.enabled),
                keys: Array.isArray(raw?.keys)
                    ? raw.keys.map((key: unknown) => String(key || "").trim()).filter(Boolean)
                    : [],
                closeOnBlur: typeof raw?.closeOnBlur === "boolean" ? raw.closeOnBlur : true,
            };
        });
        ipcMain.handle("OverlaySV-UpdateSettings", async (_event, patch: Partial<OverlaySettings>) => {
            const current = Settings.get("overlay");
            const next: OverlaySettings = {
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
            if (!win || win.isDestroyed()) return false;
            if (win.isVisible()) {
                win.hide();
            }
            return true;
        });

        ipcMain.handle("ExpressSV-Status", async () => this.express.satus());
        ipcMain.handle("ExpressSV-Start", async (_event, port: number | null, sourceId?: string) => {
            Settings.set("express", {
                port: port ?? Settings.get("express").port,
                enabled: true,
            });
            const started = await this.express.start(Settings.get("express").port);
            this.notifyExpressStatusChangedClients(sourceId);
            return started;
        });
        ipcMain.handle("ExpressSV-Stop", async (_event, sourceId?: string) => {
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
        ipcMain.handle("ExpressSV-OpenExternal", async (_event, url: string) => {
            const target = String(url ?? "").trim();
            if (!target) return false;
            try {
                await shell.openExternal(target);
                return true;
            } catch {
                return false;
            }
        });

        ipcMain.handle("DialogSV-SelectFile", async (_event, options: SelectFileOptions | undefined) => {
            return this.fileDialog.selectFile(options);
        });
        ipcMain.handle("DialogSV-SelectSaveFile", async (_event, options: SaveFileOptions | undefined) => {
            return this.fileDialog.selectSavePath(options);
        });
        ipcMain.handle("DialogSV-ReadFileAsDataUrl", async (_event, filePath: string) => {
            return this.fileDialog.readFileAsDataUrl(filePath);
        });
        ipcMain.handle("StorageSV-ImportFileToMediaUrl", async (_event, sourcePath: string, folderName: string, targetFileName?: string) => {
            const imported = this.AppService.importFileToStorage(sourcePath, folderName, targetFileName);
            return imported?.mediaUrl ?? null;
        });
        ipcMain.handle("ThemeSV-SaveLocalBackground", async (_event, sourcePath: string, mediaType?: string | null) => {
            return this.themeService.saveLocalBackground(sourcePath, mediaType);
        });
        ipcMain.handle("ThemeSV-GetLocalWallpaper", async () => {
            return this.themeService.getLocalWallpaper();
        });
        ipcMain.handle("ThemeSV-ListSavedStoreWallpapers", async () => {
            return this.themeService.listSavedStoreWallpapers();
        });
        ipcMain.handle("ThemeSV-DownloadStoreWallpaper", async (event, request: ThemeDownloadRequest) => {
            return this.themeService.startStoreDownload(request, (payload) => {
                event.sender.send("ThemeSV-DownloadProgress", payload);
            });
        });
        ipcMain.handle("ThemeSV-WaitDownload", async (_event, jobId: string) => {
            return this.themeService.waitDownload(jobId);
        });
        ipcMain.handle("ThemeSV-UninstallStoreWallpaper", async (_event, key: string) => {
            return this.themeService.uninstallStoreWallpaper(key);
        });
        ipcMain.handle("ThemeSV-UninstallLocalWallpaper", async () => {
            return this.themeService.uninstallLocalWallpaper();
        });
        ipcMain.handle("ThemeSV-GetPreferences", async (_event, defaultTheme: "ligth" | "dark" | "black" | "transparent", defaultBackground: { variant: "neural" } | { variant: "image"; imageSrc: string } | { variant: "video"; videoSrc: string }) => {
            return this.themeService.getPreferences(defaultTheme, defaultBackground);
        });
        ipcMain.handle("ThemeSV-SetTheme", async (_event, theme: "ligth" | "dark" | "black" | "transparent", sourceId?: string) => {
            const result = this.themeService.setTheme(theme);
            this.notifyThemePreferencesChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("ThemeSV-SetBackground", async (_event, background: { variant: "neural" } | { variant: "image"; imageSrc: string } | { variant: "video"; videoSrc: string }, sourceId?: string) => {
            const result = this.themeService.setBackground(background);
            this.notifyThemePreferencesChangedClients(sourceId);
            return result;
        });

        ipcMain.handle("SoundPadSV-GetPath", async () => this.soundPadService.getPath());
        ipcMain.handle("SoundPadSV-SetPath", async (_event, filePath: string) => this.soundPadService.setPath(filePath));
        ipcMain.handle("SoundPadSV-Verify", async () => this.soundPadService.verify());
        ipcMain.handle("SoundPadSV-ListAudios", async () => this.soundPadService.listAudios());
        ipcMain.handle("SoundPadSV-ExecuteCommand", async (_event, command: string) => this.soundPadService.executeCommand(command));
        ipcMain.handle("SoundPadSV-PlaySound", async (_event, index: number) => this.soundPadService.playSound(index));
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
        ipcMain.handle(
            "ObsSV-UpdateSettings",
            async (
                _event,
                patch: Partial<{
                    connectOnStartup: boolean;
                    autoDetect: boolean;
                    host: string;
                    port: number;
                    password: string;
                }>,
                options?: { reconnectIfConnected?: boolean; requireValidManual?: boolean }
            ) => this.obsService.updateSettings(patch, options)
        );
        ipcMain.handle("ObsSV-Connect", async (_event, config?: { host?: string; port?: number; password?: string }) =>
            this.obsService.connect(config)
        );
        ipcMain.handle("ObsSV-Disconnect", async () => this.obsService.disconnect());
        ipcMain.handle("ObsSV-ListScenes", async () => this.obsService.listScenes());
        ipcMain.handle("ObsSV-ListAudioInputs", async () => this.obsService.listAudioInputs());
        ipcMain.handle("ObsSV-SetCurrentScene", async (_event, sceneName: string) => this.obsService.setCurrentScene(sceneName));
        ipcMain.handle("ObsSV-SetInputMute", async (_event, inputNameOrUuid: string, muted: boolean) => this.obsService.setInputMute(inputNameOrUuid, muted));
        ipcMain.handle("ObsSV-ToggleInputMute", async (_event, inputNameOrUuid: string) => this.obsService.toggleInputMute(inputNameOrUuid));
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
        ipcMain.handle("WebDeckSV-FindPage", async (_event, id: string) => this.webDeckService.findPage(id));
        ipcMain.handle("WebDeckSV-CreatePage", async (_event, payload: { name: string; iconSource?: string | null; gridCols?: number; gridRows?: number }, sourceId?: string) => {
            const result = await this.webDeckService.createPage(payload);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-UpdatePage", async (_event, payload: { id: string; name?: string; iconSource?: string | null }, sourceId?: string) => {
            const result = await this.webDeckService.updatePage(payload);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-DeletePage", async (_event, id: string, sourceId?: string) => {
            const result = await this.webDeckService.deletePage(id);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-SetGrid", async (_event, pageId: string, gridCols: number, gridRows: number, sourceId?: string) => {
            const result = await this.webDeckService.setGrid(pageId, gridCols, gridRows);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-UpsertItem", async (_event, pageId: string, index: number, item: { id?: string; type: "back" | "page" | "app" | "soundpad" | "obs"; refId: string; label?: string; icon?: string | null }, sourceId?: string) => {
            const result = await this.webDeckService.upsertItem(pageId, index, item);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-RemoveItem", async (_event, pageId: string, index: number, sourceId?: string) => {
            const result = await this.webDeckService.removeItem(pageId, index);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-MoveItem", async (_event, pageId: string, fromIndex: number, toIndex: number, sourceId?: string) => {
            const result = await this.webDeckService.moveItem(pageId, fromIndex, toIndex);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-ListAutoIcons", async () => this.webDeckService.listAutoIcons());
        ipcMain.handle("WebDeckSV-SetAutoPageIcon", async (_event, rootId: string, iconSource?: string | null, sourceId?: string) => {
            const result = await this.webDeckService.setAutoPageIcon(rootId, iconSource ?? null);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });
        ipcMain.handle("WebDeckSV-SetAutoItemIcon", async (_event, itemKey: string, iconSource?: string | null, sourceId?: string) => {
            const result = await this.webDeckService.setAutoItemIcon(itemKey, iconSource ?? null);
            this.notifyWebDeckChangedClients(sourceId);
            return result;
        });

        ipcMain.handle("I18nSV-GetCurrentLocale", async () => {
            return this.translationService.getCurrentLocale();
        });
        ipcMain.handle("I18nSV-SetCurrentLocale", async (_event, locale: string) => {
            const next = this.translationService.setCurrentLocale(locale);
            if (this.onLocaleChanged) {
                await this.onLocaleChanged();
            }
            return next;
        });
        ipcMain.handle("I18nSV-ListExternalLocales", async () => {
            return this.translationService.listExternalLocales();
        });
        ipcMain.handle("I18nSV-GetExternalMessages", async (_event, locale: string) => {
            return this.translationService.getExternalMessages(locale);
        });
        ipcMain.handle("I18nSV-ImportLocaleFile", async (_event, sourcePath: string) => {
            return this.translationService.importLocaleFile(sourcePath);
        });
        ipcMain.handle("I18nSV-DeleteExternalLocale", async (_event, locale: string) => {
            return this.translationService.deleteExternalLocale(locale);
        });

        ipcMain.handle("UpdateSV-GetState", async () => {
            return this.updaterService.getState();
        });
        ipcMain.handle("UpdateSV-GetLoadingState", async () => {
            return this.updaterService.getLoadingState();
        });
        ipcMain.handle("UpdateSV-SetAutoDownload", async (_event, enabled: boolean) => {
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
