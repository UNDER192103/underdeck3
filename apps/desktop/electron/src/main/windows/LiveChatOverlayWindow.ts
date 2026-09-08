import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLiveChatRenderer } from "./rendererTarget.js";
import { LiveChatService } from "../services/live-chat.js";
import { observerService, ObserverChannels } from "../services/observer.js";
import type {
    LiveChatOverlayScope,
    LiveChatOverlayWindowState,
    LiveChatWindowBounds,
} from "../../types/live-chat.js";

const { BrowserWindow, app, screen } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalizeScope = (scope: LiveChatOverlayScope): LiveChatOverlayScope =>
    scope === "twitch" || scope === "tiktok" ? scope : "combined";

export class LiveChatOverlayWindowService {
    private windows = new Map<LiveChatOverlayScope, Electron.BrowserWindow>();
    private preserveOpenStateOnClose = new Set<LiveChatOverlayScope>();

    constructor(private readonly liveChatService: LiveChatService) {}

    private emitState(scope?: LiveChatOverlayScope) {
        observerService.publish(
            ObserverChannels.LIVE_CHAT_OVERLAY_CHANGED,
            { state: this.getState(scope) },
            "LIVE_CHAT_WINDOW"
        );
    }

    private defaultBounds(): LiveChatWindowBounds {
        const display = screen.getPrimaryDisplay().workArea;
        const width = 380;
        const height = Math.min(680, display.height);
        return {
            x: display.x + Math.max(0, display.width - width - 24),
            y: display.y + Math.max(0, Math.round((display.height - height) / 2)),
            width,
            height,
        };
    }

    private getSavedBounds(scope: LiveChatOverlayScope) {
        const saved = this.liveChatService.getSettings().overlay.bounds[scope];
        if (!saved) return this.defaultBounds();
        return {
            x: Number.isFinite(saved.x) ? saved.x : undefined,
            y: Number.isFinite(saved.y) ? saved.y : undefined,
            width: Math.max(280, Number(saved.width || 380)),
            height: Math.max(360, Number(saved.height || 680)),
        } satisfies LiveChatWindowBounds;
    }

    private saveBounds(scope: LiveChatOverlayScope, win: Electron.BrowserWindow) {
        if (win.isDestroyed()) return;
        const bounds = win.getBounds();
        void this.liveChatService.updateSettings({
            overlay: { bounds: { [scope]: bounds } },
        });
    }

    private async persistOpenState(scope: LiveChatOverlayScope, open: boolean) {
        const current = this.liveChatService.getSettings().overlay.openScopes;
        const next = open
            ? [...new Set([...current, scope])]
            : current.filter((item) => item !== scope);
        if (next.length === current.length && next.every((item, index) => item === current[index])) return;
        await this.liveChatService.updateSettings({ overlay: { openScopes: next } });
    }

    public async open(rawScope?: LiveChatOverlayScope): Promise<LiveChatOverlayWindowState> {
        const settings = this.liveChatService.getSettings();
        const scope = normalizeScope(rawScope ?? (settings.overlay.mode === "separate" ? "twitch" : "combined"));
        const existing = this.windows.get(scope);
        if (existing && !existing.isDestroyed()) {
            existing.show();
            existing.focus();
            return this.getState(scope);
        }

        const isDev = !app.isPackaged;
        const preloadPath = isDev
            ? path.join(process.cwd(), "dist", "preload", "index.js")
            : path.join(__dirname, "..", "..", "preload", "index.js");
        const bounds = this.getSavedBounds(scope);
        const locked = settings.overlay.locked;
        const win = new BrowserWindow({
            ...bounds,
            show: false,
            frame: false,
            transparent: false,
            backgroundColor: "#000000",
            movable: !locked,
            resizable: !locked,
            minimizable: false,
            maximizable: false,
            alwaysOnTop: settings.overlay.alwaysOnTop,
            skipTaskbar: true,
            autoHideMenuBar: true,
            minWidth: 280,
            minHeight: 360,
            webPreferences: {
                preload: preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                devTools: true,
            },
        });

        this.windows.set(scope, win);
        await this.persistOpenState(scope, true);
        if (settings.overlay.alwaysOnTop) {
            win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            win.setAlwaysOnTop(true, "screen-saver");
        }
        win.once("ready-to-show", () => {
            if (win.isDestroyed()) return;
            win.show();
            win.focus();
            this.emitState(scope);
        });
        win.on("close", () => this.saveBounds(scope, win));
        win.on("closed", () => {
            this.windows.delete(scope);
            if (this.preserveOpenStateOnClose.has(scope)) {
                this.preserveOpenStateOnClose.delete(scope);
            } else {
                void this.persistOpenState(scope, false);
            }
            this.emitState(scope);
        });
        loadLiveChatRenderer(win, isDev, scope);
        return this.getState(scope);
    }

    public async close(rawScope?: LiveChatOverlayScope): Promise<LiveChatOverlayWindowState> {
        const scope = normalizeScope(rawScope ?? "combined");
        await this.persistOpenState(scope, false);
        const win = this.windows.get(scope);
        if (win && !win.isDestroyed()) win.close();
        return this.getState(scope);
    }

    public async closeAll(preserveOpenState = true) {
        if (preserveOpenState) this.prepareForAppShutdown();
        this.windows.forEach((win, scope) => {
            if (win.isDestroyed()) return;
            if (preserveOpenState) this.preserveOpenStateOnClose.add(scope);
            win.close();
        });
        this.windows.clear();
    }

    public prepareForAppShutdown() {
        this.windows.forEach((_win, scope) => this.preserveOpenStateOnClose.add(scope));
    }

    public async restoreOnStartupIfNeeded() {
        const settings = this.liveChatService.getSettings();
        const hasEnabledProvider = settings.twitch.enabled || settings.tiktok.enabled;
        if (!settings.enabled || !hasEnabledProvider) return;
        const requested = settings.overlay.openScopes;
        if (requested.length === 0) return;
        const scopes: LiveChatOverlayScope[] = settings.overlay.mode === "combined"
            ? ["combined"]
            : [
                ...(settings.twitch.enabled && (requested.includes("combined") || requested.includes("twitch")) ? ["twitch" as const] : []),
                ...(settings.tiktok.enabled && (requested.includes("combined") || requested.includes("tiktok")) ? ["tiktok" as const] : []),
            ];
        for (const scope of scopes) {
            if (scope === "tiktok" && !settings.tiktok.enabled) continue;
            if (scope === "twitch" && !settings.twitch.enabled) continue;
            if (scope === "combined" && !hasEnabledProvider) continue;
            await this.open(scope);
        }
    }

    public async setLocked(locked: boolean) {
        await this.liveChatService.updateSettings({ overlay: { locked } });
        this.windows.forEach((win) => {
            if (win.isDestroyed()) return;
            win.setMovable(!locked);
            win.setResizable(!locked);
        });
        this.emitState();
        return this.getState();
    }

    public async setPaused(paused: boolean) {
        await this.liveChatService.updateSettings({ overlay: { paused } });
        this.emitState();
        return this.getState();
    }

    public async setAlwaysOnTop(alwaysOnTop: boolean) {
        await this.liveChatService.updateSettings({ overlay: { alwaysOnTop } });
        this.windows.forEach((win) => {
            if (win.isDestroyed()) return;
            win.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? "screen-saver" : "normal");
            win.setVisibleOnAllWorkspaces(alwaysOnTop, { visibleOnFullScreen: alwaysOnTop });
        });
        this.emitState();
        return this.getState();
    }

    public clear(scope?: LiveChatOverlayScope) {
        observerService.publish(ObserverChannels.LIVE_CHAT_CLEAR_REQUESTED, { scope }, "LIVE_CHAT_WINDOW");
        return true;
    }

    public getState(rawScope?: LiveChatOverlayScope): LiveChatOverlayWindowState {
        const settings = this.liveChatService.getSettings();
        const scope = normalizeScope(rawScope ?? (settings.overlay.mode === "separate" ? "twitch" : "combined"));
        const win = this.windows.get(scope);
        return {
            open: Boolean(win && !win.isDestroyed()),
            scope,
            paused: settings.overlay.paused,
            locked: settings.overlay.locked,
            alwaysOnTop: settings.overlay.alwaysOnTop,
        };
    }
}
