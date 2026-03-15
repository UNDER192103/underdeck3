import electron from "electron";
const { app, ipcMain, shell, BrowserWindow } = electron;
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import qrcode from "qrcode";
import { MainAppService } from "./main-app.js";
import { ExpressServer } from "./express.js";
import { Shortcutkey, normalizeShortcutKeys } from "./shortcutkeys.js";
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
import { logsService, LogsSettings, LogCategory } from "./logs.js";
import { NotificationService } from "./notifications.js";
import { ObserverPayload, observerService, ObserverChannels, ObserverEventDataMap } from "./observer.js";

type WebDeckChangedPayload = { sourceId: string; timestamp: number };
type ExpressStatusChangedPayload = { sourceId: string; enabled: boolean; port: number; timestamp: number };
type ThemePreferencesChangedPayload = { sourceId: string; timestamp: number };
type DevToolsChangedPayload = { enabled: boolean; timestamp: number };
type WindowsSettingsPayload = { autoStart: boolean; enableNotifications: boolean };
type ElectronSettingsPayload = {
    startMinimized: boolean;
    closeToTray: boolean;
    devTools: boolean;
    openLinksInBrowser: boolean;
};
type LogsSettingsPayload = LogsSettings;
type WindowControlState = {
    maximized: boolean;
    minimized: boolean;
    fullscreen: boolean;
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
    private onWindowsSettingsChanged?: (settings: WindowsSettingsPayload) => Promise<void> | void;
    private onUpdateAvailableForHandoff?: () => Promise<void> | void;
    private soundPadSubscriptions = new Map<number, () => void>();
    private obsSubscriptions = new Map<number, () => void>();
    private devToolsGuards = new Set<number>();

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
        onLocaleChanged?: () => Promise<void> | void,
        onWindowsSettingsChanged?: (settings: WindowsSettingsPayload) => Promise<void> | void,
        onUpdateAvailableForHandoff?: () => Promise<void> | void
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
        this.onWindowsSettingsChanged = onWindowsSettingsChanged;
        this.onUpdateAvailableForHandoff = onUpdateAvailableForHandoff;

        // Subscribe to observer events to forward to IPC
        this.setupObserverBridge();
    }

    /**
     * Sets up the bridge between observer events and IPC
     * REMOVED - now using GlobalObserver directly
     */
    private setupObserverBridge() {
        // No longer needed - all events go through GlobalObserver
    }

    private notifyAppsChanged(type: string, data?: unknown) {
        // REMOVED - old IPC system, now using GlobalObserver directly from source
    }

    private notifyWebDeckChanged(type: string, data?: unknown) {
        // REMOVED - old IPC system, now using GlobalObserver directly from source
    }

    private notifyObsStateChanged(state: unknown) {
        // REMOVED - old IPC system, now using GlobalObserver directly from source
    }

    private notifySoundPadAudiosChanged(audios: unknown[]) {
        // REMOVED - old IPC system, now using GlobalObserver directly from source
    }

    private unsubscribeSoundPadAudiosChangedBySenderId(senderId: number) {
        const unsubscribe = this.soundPadSubscriptions.get(senderId);
        if (!unsubscribe) return;
        unsubscribe();
        this.soundPadSubscriptions.delete(senderId);
    }

    private resolveMediaUrlToAbsolutePath(mediaUrl: string) {
        try {
            const url = new URL(mediaUrl);
            if (url.protocol !== "underdeck-media:") return null;
            const rawPath = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/^\/+/, "");
            const root = path.join(app.getPath("userData"), Settings.get("storage").baseFolder);
            const absolute = path.normalize(path.join(root, rawPath));
            const normalizedRoot = path.normalize(root);
            if (!absolute.startsWith(normalizedRoot)) return null;
            return absolute;
        } catch {
            return null;
        }
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

    private getWindowControlState(win: Electron.BrowserWindow | null): WindowControlState {
        if (!win || win.isDestroyed()) {
            return {
                maximized: false,
                minimized: false,
                fullscreen: false,
            };
        }

        return {
            maximized: win.isMaximized(),
            minimized: win.isMinimized(),
            fullscreen: win.isFullScreen(),
        };
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

    private publishGlobalObserverEvent(payload: ObserverPayload, senderId?: number) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed()) return;
            try {
                win.webContents.send("GlobalObserverSV-Event", payload);
            } catch {
                // ignore broadcast errors
            }
        });
    }

    private isDevToolsShortcut(input: Electron.Input) {
        const key = String(input?.key || "").toLowerCase();
        const withCtrlOrCmd = Boolean(input?.control || input?.meta);
        if (key === "f12") return true;
        if (withCtrlOrCmd && input?.shift && (key === "i" || key === "j")) return true;
        return false;
    }

    private attachDevToolsGuard(win: Electron.BrowserWindow) {
        if (win.isDestroyed()) return;
        const webContents = win.webContents;
        const id = webContents.id;
        if (this.devToolsGuards.has(id)) return;
        this.devToolsGuards.add(id);

        webContents.on("before-input-event", (event, input) => {
            if (this.getElectronSettings().devTools) return;
            if (!this.isDevToolsShortcut(input)) return;
            event.preventDefault();
        });

        webContents.on("devtools-opened", () => {
            if (this.getElectronSettings().devTools) return;
            if (webContents.isDestroyed()) return;
            webContents.closeDevTools();
        });

        webContents.once("destroyed", () => {
            this.devToolsGuards.delete(id);
        });
    }

    private applyDevToolsPolicy(win: Electron.BrowserWindow, enabled: boolean) {
        if (win.isDestroyed()) return;
        this.attachDevToolsGuard(win);
        if (!enabled && win.webContents.isDevToolsOpened()) {
            win.webContents.closeDevTools();
        }
    }

    private notifyDevToolsChangedClients(enabled: boolean) {
        const payload: DevToolsChangedPayload = {
            enabled: Boolean(enabled),
            timestamp: Date.now(),
        };
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
            if (win.isDestroyed()) return;
            this.applyDevToolsPolicy(win, payload.enabled);
            try {
                win.webContents.send("AppSettingsSV-DevToolsChanged", payload);
            } catch {
                // ignore broadcast errors
            }
        });
    }

    private getWindowsSettings(): WindowsSettingsPayload {
        const current = Settings.get("windows");
        return {
            autoStart: Boolean(current?.autoStart),
            enableNotifications: Boolean(current?.enableNotifications),
        };
    }

    private getElectronSettings(): ElectronSettingsPayload {
        const current = Settings.get("electron");
        return {
            startMinimized: Boolean(current?.startMinimized),
            closeToTray: Boolean(current?.closeToTray),
            devTools: Boolean(current?.devTools),
            openLinksInBrowser: Boolean(current?.openLinksInBrowser),
        };
    }

    private getDeviceInfo() {
        const current = Settings.get("device") ?? {};
        let hwid = String(current?.hwid ?? "").trim();
        if (!hwid) {
            hwid = randomUUID();
            Settings.set("device", { ...current, hwid });
        }
        return { hwid, name: os.hostname() };
    }

    start() {
        app.on("browser-window-created", (_event, win) => {
            this.applyDevToolsPolicy(win, this.getElectronSettings().devTools);
        });
        BrowserWindow.getAllWindows().forEach((win) => {
            this.applyDevToolsPolicy(win, this.getElectronSettings().devTools);
        });

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

        ipcMain.on("GlobalObserverSV-Publish", (event, raw: Partial<ObserverPayload>) => {
            const payload: ObserverPayload = {
                id: String(raw?.id || "unknown"),
                channel: String(raw?.channel || "GLOBAL"),
                data: raw?.data,
                sourceId: String(raw?.sourceId || "UNKNOWN"),
                timestamp: Number(raw?.timestamp || Date.now()),
            };

            observerService.emit(payload.channel, payload);
            observerService.emit("GLOBAL", payload);

            this.publishGlobalObserverEvent(payload, event.sender.id);
            if (payload.channel != "GLOBAL") {
                this.publishGlobalObserverEvent({
                    ...payload,
                    origin: payload.channel,
                    channel: "GLOBAL"
                }, event.sender.id);
            }
        });

        observerService.subscribe('_IPCMAIN_PUBLISH_EVENT_', (raw: Partial<ObserverPayload>) => {
            const payload: ObserverPayload = {
                id: String(raw?.id || "unknown"),
                channel: String(raw?.channel || "GLOBAL"),
                data: raw?.data,
                sourceId: String(raw?.sourceId || "UNKNOWN"),
                timestamp: Number(raw?.timestamp || Date.now()),
            };
            this.publishGlobalObserverEvent(payload, Number(raw?.sourceId) || undefined);
            if (payload.channel != "GLOBAL") {
                this.publishGlobalObserverEvent({
                    ...payload,
                    origin: payload.channel,
                    channel: "GLOBAL"
                }, Number(raw?.sourceId) || undefined);
            }
        });

        ipcMain.handle("WindowSV-GetState", async (event): Promise<WindowControlState> => {
            const win = BrowserWindow.fromWebContents(event.sender);
            return this.getWindowControlState(win);
        });

        ipcMain.handle("SystemSV-GetDeviceInfo", async () => {
            return this.getDeviceInfo();
        });

        ipcMain.handle("SystemSV-MakeQrCodeDataUrl", async (_event, raw: unknown) => {
            const text = String(raw ?? "").trim();
            if (!text) return null;
            try {
                return await qrcode.toDataURL(text, { margin: 1, scale: 6 });
            } catch {
                return null;
            }
        });
        ipcMain.handle("WindowSV-Minimize", async (event): Promise<WindowControlState> => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
                win.minimize();
            }
            return this.getWindowControlState(win);
        });
        ipcMain.handle("WindowSV-ToggleMaximize", async (event): Promise<WindowControlState> => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
                if (win.isMaximized()) {
                    win.unmaximize();
                } else {
                    win.maximize();
                }
            }
            return this.getWindowControlState(win);
        });
        ipcMain.handle("WindowSV-Close", async (event): Promise<boolean> => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (!win || win.isDestroyed()) return false;
            win.close();
            return true;
        });
        ipcMain.on("WindowSV-SubscribeStateChanged", (event) => {
            const sender = event.sender;
            const win = BrowserWindow.fromWebContents(sender);
            if (!win || win.isDestroyed()) return;

            const publish = () => {
                if (sender.isDestroyed()) return;
                sender.send("WindowSV-StateChanged", this.getWindowControlState(win));
            };

            const events = [
                "maximize",
                "unmaximize",
                "minimize",
                "restore",
                "enter-full-screen",
                "leave-full-screen",
            ];

            events.forEach((eventName) => (win as any).on(eventName, publish));
            sender.once("destroyed", () => {
                events.forEach((eventName) => (win as any).removeListener(eventName, publish));
            });

            publish();
        });

        ipcMain.handle("AppsSV-List", async () => await this.AppService.listApps());
        ipcMain.handle("AppsSV-add", async (_event, app: App) => {
            const result = await this.AppService.addApp(app);
            // Publica evento para SocketContext e Express
            observerService.publish("apps:changed", { type: "added" as const, apps: [app] } as any, "IPCMAIN");
            return result;
        });
        ipcMain.handle("AppsSV-update", async (_event, app: App) => {
            const result = await this.AppService.updateApp(app);
            // Publica evento para SocketContext e Express
            observerService.publish("apps:changed", { type: "updated" as const, apps: [app] } as any, "IPCMAIN");
            return result;
        });
        ipcMain.handle("AppsSV-find", async (_event, id: string) => await this.AppService.findApp(id));
        ipcMain.handle("AppsSV-delete", async (_event, id: string) => {
            const result = await this.AppService.deleteApp(id);
            const shortcuts = await this.AppService.listShortcuts();
            await this.hortcutService.updateDataMacros(shortcuts);
            // Publica evento para SocketContext e Express
            observerService.publish("apps:changed", { type: "deleted" as const, apps: [{ id }] } as any, "IPCMAIN");
            return result;
        });
        ipcMain.handle("AppsSV-execute", async (_event, id: string) => await this.AppService.executeApp(id));
        ipcMain.handle("AppsSV-reposition", async (_event, id: string, toPosition: number) => {
            const result = await this.AppService.repositionApp(id, toPosition);
            // Publica evento para SocketContext e Express
            observerService.publish("apps:changed", { type: "repositioned" as const, apps: [{ id, position: toPosition }] } as any, "IPCMAIN");
            return result;
        });

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
            }
            this.hortcutService.setMacrosEnabled(Boolean(enabled));
            if (this.onOverlaySettingsChanged) {
                await this.onOverlaySettingsChanged();
            }
            return this.hortcutService.isStarted();
        });

        ipcMain.handle("OverlaySV-GetSettings", async (): Promise<OverlaySettings> => {
            const raw = Settings.get("overlay");
            return {
                enabled: Boolean(raw?.enabled),
                keys: normalizeShortcutKeys(raw?.keys),
                closeOnBlur: typeof raw?.closeOnBlur === "boolean" ? raw.closeOnBlur : true,
            };
        });
        ipcMain.handle("OverlaySV-UpdateSettings", async (_event, patch: Partial<OverlaySettings>) => {
            const current = Settings.get("overlay");
            const next: OverlaySettings = {
                enabled: typeof patch?.enabled === "boolean" ? patch.enabled : Boolean(current?.enabled),
                keys: Array.isArray(patch?.keys)
                    ? normalizeShortcutKeys(patch.keys)
                    : normalizeShortcutKeys(current?.keys),
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
            const result = this.themeService.setTheme(theme, sourceId);
            // Note: notifyThemePreferencesChangedClients is now called via observer subscription
            return result;
        });
        ipcMain.handle("ThemeSV-SetBackground", async (_event, background: { variant: "neural" } | { variant: "image"; imageSrc: string } | { variant: "video"; videoSrc: string }, sourceId?: string) => {
            const result = this.themeService.setBackground(background, sourceId);
            // Note: notifyThemePreferencesChangedClients is now called via observer subscription
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
        ipcMain.handle("ObsSV-SetInputVolume", async (_event, inputNameOrUuid: string, inputVolumeMul: number) => this.obsService.setInputVolume(inputNameOrUuid, inputVolumeMul));
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

        // Handler para comandos do WebDeck remoto
        ipcMain.on("WebDeckSV-Command", async (event, payload: { cmd: string; data?: any }, callback?: any) => {
            try {
                const { cmd, data } = payload;
                
                if (cmd === "webdeck:getMetadata") {
                    const pages = this.webDeckService.listPages();
                    const apps = await this.AppService.listApps();
                    const { icons: autoIcons, timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
                    const iconTimestamps: Record<string, number> = { ...this.webDeckService.listIconTimestamps() };
                    const pushTimestamp = (url: string | null | undefined, timestamp: number) => {
                        if (!url) return;
                        const safeTimestamp = Number(timestamp || 0);
                        const current = iconTimestamps[url];
                        if (!current || safeTimestamp > current) {
                            iconTimestamps[url] = safeTimestamp;
                        }
                    };
                    pages.forEach((page) => {
                        const pageTimestamp = Number((page as any)?.updatedAt ?? 0);
                        pushTimestamp(page.icon, pageTimestamp);
                        page.items?.forEach((item) => {
                            if (!item?.icon) return;
                            pushTimestamp(item.icon, pageTimestamp);
                        });
                    });
                    apps.forEach((app: any) => {
                        pushTimestamp(app?.icon, Number(app?.updatedAt ?? 0));
                    });
                    Object.entries(autoIcons.pages ?? {}).forEach(([key, icon]) => {
                        pushTimestamp(icon, Number(autoIconTimestamps.pages?.[key] ?? 0));
                    });
                    Object.entries(autoIcons.items ?? {}).forEach(([key, icon]) => {
                        pushTimestamp(icon, Number(autoIconTimestamps.items?.[key] ?? 0));
                    });
                    callback?.({
                        ok: true,
                        data: {
                            pages,
                            apps,
                            autoIcons,
                            iconTimestamps,
                            timestamp: Date.now()
                        }
                    });
                    return;
                }
                
                if (cmd === "webdeck:getMedia") {
                    const urls: string[] = data?.urls || [];
                    const assets: Record<string, string> = {};
                    
                    for (const url of urls) {
                        try {
                            // Converter underdeck-media:// para caminho real e ler arquivo
                            if (url.startsWith("underdeck-media://")) {
                                const parsed = new URL(url);
                                const relativePath = `${parsed.hostname}${parsed.pathname}`.replace(/^\/+/, "");
                                const fullPath = path.join(electron.app.getPath("userData"), "media", relativePath);
                                
                                if (fs.existsSync(fullPath)) {
                                    const buffer = fs.readFileSync(fullPath);
                                    const base64 = buffer.toString("base64");
                                    const ext = path.extname(fullPath).toLowerCase();
                                    const mimeTypes: Record<string, string> = {
                                        ".jpg": "image/jpeg",
                                        ".jpeg": "image/jpeg",
                                        ".png": "image/png",
                                        ".gif": "image/gif",
                                        ".webp": "image/webp",
                                        ".mp4": "video/mp4",
                                        ".webm": "video/webm",
                                    };
                                    const mimeType = mimeTypes[ext] || "application/octet-stream";
                                    assets[url] = `data:${mimeType};base64,${base64}`;
                                }
                            }
                        } catch (err) {
                            console.error(`Failed to load media for URL ${url}:`, err);
                        }
                    }
                    
                    callback?.({
                        ok: true,
                        data: { assets }
                    });
                    return;
                }
                
                if (cmd === "webdeck:activateItem") {
                    const { type, refId } = data || {};
                    // Aqui iria a lógica para ativar o item (som, cena OBS, etc)
                    // Por enquanto só retorna sucesso
                    callback?.({ ok: true });
                    return;
                }
                
                callback?.({ ok: false, error: `Unknown command: ${cmd}` });
            } catch (error: any) {
                callback?.({ ok: false, error: error?.message || "Command failed" });
            }
        });

        ipcMain.handle("WebDeckSV-ListPages", async () => this.webDeckService.listPages());
        ipcMain.handle("WebDeckSV-FindPage", async (_event, id: string) => this.webDeckService.findPage(id));
        // Retorna apenas metadados (páginas, apps, etc) SEM imagens para otimização
        ipcMain.handle("WebDeckSV-GetMetadata", async () => {
            const pages = this.webDeckService.listPages();
            const apps = await this.AppService.listApps();
            const { icons: autoIcons, timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
            const iconTimestamps: Record<string, number> = { ...this.webDeckService.listIconTimestamps() };
            const pushTimestamp = (url: string | null | undefined, timestamp: number) => {
                if (!url) return;
                const safeTimestamp = Number(timestamp || 0);
                const current = iconTimestamps[url];
                if (!current || safeTimestamp > current) {
                    iconTimestamps[url] = safeTimestamp;
                }
            };
            pages.forEach((page) => {
                const pageTimestamp = Number((page as any)?.updatedAt ?? 0);
                pushTimestamp(page.icon, pageTimestamp);
                page.items?.forEach((item) => {
                    if (!item?.icon) return;
                    pushTimestamp(item.icon, pageTimestamp);
                });
            });
            apps.forEach((app: any) => {
                pushTimestamp(app?.icon, Number(app?.updatedAt ?? 0));
            });
            Object.entries(autoIcons.pages ?? {}).forEach(([key, icon]) => {
                pushTimestamp(icon, Number(autoIconTimestamps.pages?.[key] ?? 0));
            });
            Object.entries(autoIcons.items ?? {}).forEach(([key, icon]) => {
                pushTimestamp(icon, Number(autoIconTimestamps.items?.[key] ?? 0));
            });
            return {
                pages,
                apps,
                autoIcons,
                iconTimestamps,
                timestamp: Date.now()
            };
        });
        ipcMain.handle("WebDeckSV-CreatePage", async (_event, payload: { name: string; iconSource?: string | null; gridCols?: number; gridRows?: number }, sourceId?: string) => {
            const result = await this.webDeckService.createPage(payload);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-UpdatePage", async (_event, payload: { id: string; name?: string; iconSource?: string | null }, sourceId?: string) => {
            const result = await this.webDeckService.updatePage(payload);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-DeletePage", async (_event, id: string, sourceId?: string) => {
            const result = await this.webDeckService.deletePage(id);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-SetGrid", async (_event, pageId: string, gridCols: number, gridRows: number, sourceId?: string) => {
            const result = await this.webDeckService.setGrid(pageId, gridCols, gridRows);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-UpsertItem", async (_event, pageId: string, index: number, item: { id?: string; type: "back" | "page" | "app" | "soundpad" | "obs"; refId: string; label?: string; icon?: string | null }, sourceId?: string) => {
            const result = await this.webDeckService.upsertItem(pageId, index, item);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-RemoveItem", async (_event, pageId: string, index: number, sourceId?: string) => {
            const result = await this.webDeckService.removeItem(pageId, index);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-MoveItem", async (_event, pageId: string, fromIndex: number, toIndex: number, sourceId?: string) => {
            const result = await this.webDeckService.moveItem(pageId, fromIndex, toIndex);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-ListAutoIcons", async () => this.webDeckService.listAutoIcons());
        ipcMain.handle("WebDeckSV-SetAutoPageIcon", async (_event, rootId: string, iconSource?: string | null, sourceId?: string) => {
            const result = await this.webDeckService.setAutoPageIcon(rootId, iconSource ?? null);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
            return result;
        });
        ipcMain.handle("WebDeckSV-SetAutoItemIcon", async (_event, itemKey: string, iconSource?: string | null, sourceId?: string) => {
            const result = await this.webDeckService.setAutoItemIcon(itemKey, iconSource ?? null);
            this.notifyWebDeckChangedClients(sourceId);
            // Publica no observer para SocketContext e Express - usa dados completos
            const allPages = this.webDeckService.listPages();
            const autoIcons = this.webDeckService.listAutoIcons();
            observerService.publish("webdeck:pages-changed", { pages: allPages, autoIcons } as any, sourceId || "IPCMAIN");
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
            const result = await this.updaterService.checkForUpdatesOnly();
            if (result.updateAvailable && this.onUpdateAvailableForHandoff) {
                await this.onUpdateAvailableForHandoff();
            }
            return this.updaterService.getState();
        });
        ipcMain.handle("UpdateSV-DownloadInstall", async () => {
            return this.updaterService.downloadAndInstall();
        });

        ipcMain.handle("AppSettingsSV-GetWindows", async (): Promise<WindowsSettingsPayload> => {
            return this.getWindowsSettings();
        });
        ipcMain.handle("AppSettingsSV-SetWindows", async (_event, patch: Partial<WindowsSettingsPayload>) => {
            const current = this.getWindowsSettings();
            const next: WindowsSettingsPayload = {
                autoStart: typeof patch?.autoStart === "boolean" ? patch.autoStart : current.autoStart,
                enableNotifications: typeof patch?.enableNotifications === "boolean" ? patch.enableNotifications : current.enableNotifications,
            };
            if (this.onWindowsSettingsChanged) {
                await this.onWindowsSettingsChanged(next);
            }
            Settings.set("windows", next);
            return next;
        });

        ipcMain.handle("AppSettingsSV-GetElectron", async (): Promise<ElectronSettingsPayload> => {
            return this.getElectronSettings();
        });
        ipcMain.handle("AppSettingsSV-SetElectron", async (_event, patch: Partial<ElectronSettingsPayload>) => {
            const current = this.getElectronSettings();
            const next: ElectronSettingsPayload = {
                startMinimized: typeof patch?.startMinimized === "boolean" ? patch.startMinimized : current.startMinimized,
                closeToTray: typeof patch?.closeToTray === "boolean" ? patch.closeToTray : current.closeToTray,
                devTools: typeof patch?.devTools === "boolean" ? patch.devTools : current.devTools,
                openLinksInBrowser: typeof patch?.openLinksInBrowser === "boolean" ? patch.openLinksInBrowser : current.openLinksInBrowser,
            };
            Settings.set("electron", {
                ...Settings.get("electron"),
                ...next,
            });
            if (current.devTools !== next.devTools) {
                this.notifyDevToolsChangedClients(next.devTools);
            }
            return next;
        });

        ipcMain.handle("NotificationSV-Send", async (_event, title: string, body: string) => {
            return NotificationService.send(title, body);
        });

        ipcMain.handle("MediaSV-ReadAsDataUrl", async (_event, source: string) => {
            const raw = String(source || "").trim();
            if (!raw) return null;
            if (raw.startsWith("underdeck-media://")) {
                const absolute = this.resolveMediaUrlToAbsolutePath(raw);
                if (!absolute) {
                    logsService.log("webdeck", "media.base64.missing", { source: raw }, "warn");
                    return null;
                }
                const dataUrl = await this.fileDialog.readFileAsDataUrl(absolute);
                if (dataUrl) {
                    logsService.log("webdeck", "media.base64", { source: raw, size: dataUrl.length });
                } else {
                    logsService.log("webdeck", "media.base64.empty", { source: raw }, "warn");
                }
                return dataUrl;
            }
            if (raw.startsWith("file://")) {
                const dataUrl = await this.fileDialog.readFileAsDataUrl(raw.replace(/^file:\/\//i, ""));
                if (dataUrl) {
                    logsService.log("webdeck", "media.base64", { source: raw, size: dataUrl.length });
                } else {
                    logsService.log("webdeck", "media.base64.empty", { source: raw }, "warn");
                }
                return dataUrl;
            }
            if (path.isAbsolute(raw)) {
                const dataUrl = await this.fileDialog.readFileAsDataUrl(raw);
                if (dataUrl) {
                    logsService.log("webdeck", "media.base64", { source: raw, size: dataUrl.length });
                } else {
                    logsService.log("webdeck", "media.base64.empty", { source: raw }, "warn");
                }
                return dataUrl;
            }
            return null;
        });

        ipcMain.handle("MediaSV-GetFileSize", async (_event, source: string) => {
            const raw = String(source || "").trim();
            if (!raw) return null;
            try {
                let filePath: string | null = null;
                if (raw.startsWith("underdeck-media://")) {
                    filePath = this.resolveMediaUrlToAbsolutePath(raw);
                } else if (raw.startsWith("file://")) {
                    filePath = raw.replace(/^file:\/\//i, "");
                } else if (path.isAbsolute(raw)) {
                    filePath = raw;
                }
                if (!filePath) return null;
                const stats = await fs.promises.stat(filePath);
                return stats.size;
            } catch {
                return null;
            }
        });

        ipcMain.handle("LogsSV-GetSettings", async (): Promise<LogsSettingsPayload> => {
            return logsService.getSettings();
        });
        ipcMain.handle("LogsSV-SetSettings", async (_event, patch: Partial<LogsSettingsPayload>) => {
            return logsService.updateSettings(patch);
        });
        ipcMain.handle("LogsSV-OpenLogFile", async (_event, category: LogCategory) => {
            return logsService.openLogFile(category);
        });
        ipcMain.handle("LogsSV-ClearLogFile", async (_event, category: LogCategory) => {
            return logsService.clearLogFile(category);
        });
        ipcMain.handle("LogsSV-ClearLogs", async () => {
            return logsService.clearLogs();
        });
    }
}
