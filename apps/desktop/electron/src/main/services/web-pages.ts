import electron from "electron";
import EventEmitter from "events";
import fs from "node:fs";
import path from "node:path";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import fetch from "cross-fetch";
import { getDb } from "./database.js";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";
import { observerService, ObserverChannels } from "./observer.js";
import type { WebPage, WebPagesSettings } from "../../types/webpages.js";

const { BrowserWindow, session: electronSession } = electron;

export class WebPagesService extends EventEmitter {
    private blocker: ElectronBlocker | null = null;
    private adblockEnabled = false;
    private adblockSyncPromise: Promise<void> | null = null;
    private pagesSession: electron.Session | null = null;
    private openWindows = new Set<Electron.BrowserWindow>();
    private initialized = false;

    constructor() {
        super();
        // Initialize adblock settings once; avoids re-attaching listeners on every open.
        void this.ensureInitialized();
    }

    private async ensureInitialized() {
        if (this.initialized) return;
        this.initialized = true;
        try {
            await this.syncAdblockSetting();
        } catch {
            // ignore initialization errors
        }
    }

    private getSettings(): WebPagesSettings {
        const current = Settings.get("webPages");
        return {
            useAdblock: typeof current?.useAdblock === "boolean" ? current.useAdblock : true,
            blockNewWindows: typeof current?.blockNewWindows === "boolean" ? current.blockNewWindows : true,
        };
    }

    private setSettings(next: WebPagesSettings) {
        Settings.set("webPages", next);
    }

    private async ensurePagesSession() {
        if (this.pagesSession) return this.pagesSession;
        if (!electron.app.isReady()) {
            await electron.app.whenReady();
        }
        this.pagesSession = electronSession.fromPartition("persist:underdeck-webpages");
        return this.pagesSession;
    }

    private async ensureBlocker() {
        if (this.blocker) return this.blocker;
        this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch as any);
        return this.blocker;
    }

    private async syncAdblockSetting() {
        if (this.adblockSyncPromise) {
            return this.adblockSyncPromise;
        }
        const settings = this.getSettings();
        this.adblockSyncPromise = (async () => {
            const session = await this.ensurePagesSession();
            if (!settings.useAdblock) {
                if (this.blocker && this.adblockEnabled && typeof (this.blocker as any).disableBlockingInSession === "function") {
                    try {
                        (this.blocker as any).disableBlockingInSession(session);
                    } catch {
                        // ignore disable errors when not enabled
                    }
                }
                this.adblockEnabled = false;
                return;
            }
            if (this.adblockEnabled) {
                return;
            }
            const blocker = await this.ensureBlocker();
            blocker.enableBlockingInSession(session);
            this.adblockEnabled = true;
        })();

        try {
            await this.adblockSyncPromise;
        } finally {
            this.adblockSyncPromise = null;
        }
    }

    private getStorageRootPath() {
        return path.join(electron.app.getPath("userData"), Settings.get("storage").baseFolder);
    }

    private ensureStorageFolder(folderName: string) {
        const folder = path.join(this.getStorageRootPath(), folderName);
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }

    private toRelativeStoragePath(absolutePath: string) {
        const root = this.getStorageRootPath();
        return path.relative(root, absolutePath).split(path.sep).join("/");
    }

    private toMediaUrlFromRelativePath(relativePath: string) {
        return `underdeck-media://${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    private importFileToStorage(sourcePath: string, folderName: string, targetFileName?: string) {
        const source = sourcePath.replace(/^file:\/\//i, "");
        if (!fs.existsSync(source)) return null;

        const targetFolder = this.ensureStorageFolder(folderName);
        const extension = path.extname(source) || ".bin";
        const safeName = targetFileName ?? `${Date.now()}${extension.toLowerCase()}`;
        const targetAbsolutePath = path.join(targetFolder, safeName);

        fs.copyFileSync(source, targetAbsolutePath);

        const relativePath = this.toRelativeStoragePath(targetAbsolutePath);
        return {
            absolutePath: targetAbsolutePath,
            relativePath,
            mediaUrl: this.toMediaUrlFromRelativePath(relativePath),
        };
    }

    private resolveIconToAbsolutePath(icon: string | null | undefined) {
        if (!icon) return null;
        if (icon.startsWith("underdeck-media://")) {
            try {
                const url = new URL(icon);
                const rawPath = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/^\/+/, "");
                const absolute = path.normalize(path.join(this.getStorageRootPath(), rawPath));
                const root = path.normalize(this.getStorageRootPath());
                if (!absolute.startsWith(root)) return null;
                return absolute;
            } catch {
                return null;
            }
        }
        if (icon.startsWith("file://")) {
            return icon.replace(/^file:\/\//i, "");
        }
        if (path.isAbsolute(icon)) {
            return icon;
        }
        return null;
    }

    private deleteIconFileIfLocal(icon: string | null | undefined) {
        const absolutePath = this.resolveIconToAbsolutePath(icon);
        if (!absolutePath) return;
        if (!fs.existsSync(absolutePath)) return;
        try {
            fs.unlinkSync(absolutePath);
        } catch {
            // ignore
        }
    }

    private hasIconReference(icon: string | null | undefined) {
        if (!icon) return false;
        const db = this.getWebPagesDatabase();
        const ref = db.prepare("SELECT 1 FROM web_pages WHERE icon = ? LIMIT 1").get(icon);
        return !!ref;
    }

    private deleteIconFileIfUnreferenced(icon: string | null | undefined) {
        if (!icon) return;
        if (this.hasIconReference(icon)) return;
        this.deleteIconFileIfLocal(icon);
    }

    private persistEntityIcon(icon: string | null | undefined, entityId: string) {
        if (!icon) return null;
        if (icon.startsWith("underdeck-media://")) return icon;
        if (icon.startsWith("data:")) return icon;

        const storage = Settings.get("storage");
        const folderName = storage?.webPagesIconsFolder ?? storage?.appIconsFolder;

        const iconPath = icon.replace(/^file:\/\//i, "");
        const extension = path.extname(iconPath) || ".png";
        const imported = this.importFileToStorage(
            iconPath,
            folderName,
            `${entityId}${extension.toLowerCase()}`
        );
        return imported?.mediaUrl ?? icon;
    }

    private getWebPagesDatabase() {
        const db = getDb("webpages");
        db.prepare(`CREATE TABLE IF NOT EXISTS web_pages (id TEXT PRIMARY KEY, name TEXT, icon TEXT, url TEXT, created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`).run();
        const columns = db.prepare("PRAGMA table_info(web_pages)").all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "created_at")) {
            db.prepare("ALTER TABLE web_pages ADD COLUMN created_at INTEGER DEFAULT 0").run();
            db.prepare("UPDATE web_pages SET created_at = ?").run(Date.now());
        }
        if (!columns.some((column) => column.name === "updated_at")) {
            db.prepare("ALTER TABLE web_pages ADD COLUMN updated_at INTEGER DEFAULT 0").run();
            db.prepare("UPDATE web_pages SET updated_at = ?").run(Date.now());
        }
        return db;
    }

    private mapRow(row: any): WebPage {
        return {
            id: String(row.id),
            name: String(row.name ?? ""),
            icon: row.icon ?? null,
            url: String(row.url ?? ""),
            createdAt: Number(row.created_at ?? 0),
            updatedAt: Number(row.updated_at ?? 0),
        };
    }

    listPages(): Promise<WebPage[]> {
        const db = this.getWebPagesDatabase();
        const rows = db.prepare("SELECT * FROM web_pages ORDER BY updated_at DESC, rowid DESC").all();
        const pages = (rows as any[]).map((row) => this.mapRow(row));
        return Promise.resolve(pages);
    }

    addPage(page: WebPage) {
        const db = this.getWebPagesDatabase();
        const now = Date.now();
        const data: WebPage = {
            id: page.id,
            name: page.name,
            icon: this.persistEntityIcon(page.icon, page.id),
            url: page.url,
            createdAt: now,
            updatedAt: now,
        };
        db.prepare("INSERT INTO web_pages (id, name, icon, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            data.id,
            data.name,
            data.icon,
            data.url,
            data.createdAt,
            data.updatedAt
        );
        this.notifyChange("webpage-added", data);
        return data;
    }

    updatePage(page: WebPage) {
        const current = this.findPage(page.id);
        if (!current) return null;
        const now = Date.now();
        const nextIcon = this.persistEntityIcon(page.icon, page.id);
        const data: WebPage = {
            ...current,
            ...page,
            icon: nextIcon,
            updatedAt: now,
        };
        const db = this.getWebPagesDatabase();
        db.prepare("UPDATE web_pages SET name = ?, icon = ?, url = ?, updated_at = ? WHERE id = ?").run(
            data.name,
            data.icon,
            data.url,
            data.updatedAt,
            data.id
        );
        if (current.icon !== data.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        this.notifyChange("webpage-updated", data);
        return data;
    }

    deletePage(id: string) {
        const current = this.findPage(id);
        const db = this.getWebPagesDatabase();
        const result = db.prepare("DELETE FROM web_pages WHERE id = ?").run(id);
        if (current?.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        this.notifyChange("webpage-deleted", { id });
        return result;
    }

    findPage(id: string) {
        const db = this.getWebPagesDatabase();
        const row = db.prepare("SELECT * FROM web_pages WHERE id = ?").get(id) as any;
        if (!row) return null;
        return this.mapRow(row);
    }

    async updateSettings(patch: Partial<WebPagesSettings>) {
        const current = this.getSettings();
        const next: WebPagesSettings = {
            useAdblock: typeof patch.useAdblock === "boolean" ? patch.useAdblock : current.useAdblock,
            blockNewWindows: typeof patch.blockNewWindows === "boolean" ? patch.blockNewWindows : current.blockNewWindows,
        };
        this.setSettings(next);
        await this.syncAdblockSetting();
        this.notifyChange("webpages-settings", next);
        return next;
    }

    getSettingsSnapshot() {
        return this.getSettings();
    }

    async openPage(pageId: string) {
        const page = this.findPage(pageId);
        if (!page) return null;
        await this.openWindow(page.url, page.name);
        return true;
    }

    async openUrl(url: string, title?: string) {
        await this.openWindow(url, title ?? "Under Deck");
        return true;
    }

    private async openWindow(url: string, title?: string) {
        await this.ensureInitialized();
        const settings = this.getSettings();
        const session = await this.ensurePagesSession();
        const win = new BrowserWindow({
            width: 1200,
            height: 800,
            title: title ?? "Under Deck",
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                session,
            },
        });
        // Ghostery adblocker attaches multiple listeners per WebContents.
        // Avoid MaxListenersExceededWarning for web page windows.
        win.webContents.setMaxListeners(0);

        if (settings.blockNewWindows) {
            win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        }

        win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
            logsService.log("webpages", "webpages.load_failed", {
                url: validatedURL,
                errorCode,
                errorDescription,
            }, "warn");
        });
        win.webContents.on("render-process-gone", (_event, details) => {
            logsService.log("webpages", "webpages.render_gone", details, "warn");
        });
        win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
            if (level < 2) return;
            logsService.log("webpages", "webpages.console_error", {
                level,
                message,
                line,
                sourceId,
            }, "warn");
        });

        win.on("closed", () => {
            this.openWindows.delete(win);
        });

        this.openWindows.add(win);

        try {
            await win.loadURL(url);
        } catch {
            // ignore
        }

        return win;
    }

    closeAllWindows() {
        this.openWindows.forEach((win) => {
            if (win.isDestroyed()) return;
            win.close();
        });
        this.openWindows.clear();
    }

    private notifyChange(type: "webpage-added" | "webpage-updated" | "webpage-deleted" | "webpages-settings", data?: unknown) {
        if (type === "webpage-added") {
            observerService.publish(ObserverChannels.WEBPAGE_ADDED, { page: data }, "WEB_PAGES_SERVICE");
        }
        if (type === "webpage-updated") {
            observerService.publish(ObserverChannels.WEBPAGE_UPDATED, { page: data }, "WEB_PAGES_SERVICE");
        }
        if (type === "webpage-deleted") {
            observerService.publish(ObserverChannels.WEBPAGE_DELETED, { pageId: String((data as any)?.id ?? "") }, "WEB_PAGES_SERVICE");
        }
        if (type !== "webpages-settings") {
            void this.listPages().then((pages) => {
                observerService.publish(
                    ObserverChannels.WEBPAGES_CHANGED,
                    { type: type.replace("webpage-", "") as "added" | "updated" | "deleted", page: data, pages },
                    "WEB_PAGES_SERVICE"
                );
            });
        }
    }
}
