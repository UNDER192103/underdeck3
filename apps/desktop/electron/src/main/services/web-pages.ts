import electron from "electron";
import EventEmitter from "events";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import fetch from "cross-fetch";
import { getDb } from "./database.js";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";
import { observerService, ObserverChannels } from "./observer.js";
import { getAssetPath } from "../../communs/commun.js";
import type { WebPage, WebPageShortcutRequest, WebPageShortcutResult, WebPagesSettings } from "../../types/webpages.js";

const { BrowserWindow, nativeImage, session: electronSession, shell } = electron;
const ACTION_PROTOCOL = "underdeck";

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

    createShortcut(request: WebPageShortcutRequest): WebPageShortcutResult {
        if (process.platform !== "win32") {
            return { ok: false, error: "Shortcuts are only supported on Windows right now." };
        }

        const page = this.findPage(String(request.pageId || ""));
        if (!page) {
            return { ok: false, error: "Web page not found." };
        }

        const shortcutName = this.sanitizeShortcutName(request.name || page.name || "Under Deck");
        const destination = request.destination === "startMenu" ? "startMenu" : request.destination === "custom" ? "custom" : "desktop";
        const directory = this.getShortcutDirectory(destination, request.customDirectory);
        if (!directory) {
            return { ok: false, error: "Shortcut destination not found." };
        }

        try {
            fs.mkdirSync(directory, { recursive: true });
        } catch {
            return { ok: false, error: "Could not create shortcut destination." };
        }

        const shortcutPath = path.join(directory, `${shortcutName}.lnk`);
        const actionUrl = `${ACTION_PROTOCOL}://action?type=open-webpage&pageId=${encodeURIComponent(page.id)}`;
        const icon = this.resolveShortcutIcon(request.iconPath || page.icon, page.id);
        const success = shell.writeShortcutLink(shortcutPath, "create", {
            target: "C:\\Windows\\explorer.exe",
            args: `"${actionUrl}"`,
            icon,
            iconIndex: 0,
            description: `Abrir ${page.name} no Under Deck`,
        });

        return success ? { ok: true, path: shortcutPath } : { ok: false, error: "Windows could not create the shortcut." };
    }

    private sanitizeShortcutName(name: string) {
        const safeName = String(name || "Under Deck").replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim();
        return safeName || "Under Deck";
    }

    private getShortcutDirectory(destination: WebPageShortcutRequest["destination"], customDirectory?: string | null) {
        if (destination === "startMenu") {
            return path.join(electron.app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs");
        }
        if (destination === "custom") {
            const target = String(customDirectory || "").trim();
            return target || electron.app.getPath("desktop");
        }
        return electron.app.getPath("desktop");
    }

    private resolveShortcutIcon(icon: string | null | undefined, pageId: string) {
        const absoluteIcon = this.resolveIconToAbsolutePath(icon);
        if (absoluteIcon && fs.existsSync(absoluteIcon)) {
            if (path.extname(absoluteIcon).toLowerCase() === ".ico") return absoluteIcon;
            const converted = this.convertImageToShortcutIcon(absoluteIcon, pageId);
            if (converted) return converted;
        }
        if (icon?.startsWith("data:")) {
            const converted = this.convertDataUrlToShortcutIcon(icon, pageId);
            if (converted) return converted;
        }
        return getAssetPath("img", "icon.ico");
    }

    private getShortcutIconsFolder() {
        const folder = path.join(electron.app.getPath("userData"), "shortcut-icons");
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }

    private getShortcutIconCachePath(sourceKey: string, pageId: string) {
        const hash = createHash("sha1").update(pageId).update(sourceKey).digest("hex");
        return path.join(this.getShortcutIconsFolder(), `${hash}.ico`);
    }

    private getFileSourceKey(filePath: string, pageId: string) {
        try {
            const stats = fs.statSync(filePath);
            return `${pageId}:${filePath}:${stats.mtimeMs}:${stats.size}`;
        } catch {
            return `${pageId}:${filePath}`;
        }
    }

    private convertImageToShortcutIcon(filePath: string, pageId: string) {
        const cachePath = this.getShortcutIconCachePath(this.getFileSourceKey(filePath, pageId), pageId);
        if (fs.existsSync(cachePath)) return cachePath;

        const image = nativeImage.createFromPath(filePath);
        if (image.isEmpty()) return null;
        return this.writeNativeImageAsIcon(image, cachePath);
    }

    private convertDataUrlToShortcutIcon(dataUrl: string, pageId: string) {
        const cachePath = this.getShortcutIconCachePath(dataUrl, pageId);
        if (fs.existsSync(cachePath)) return cachePath;

        const image = nativeImage.createFromDataURL(dataUrl);
        if (image.isEmpty()) return null;
        return this.writeNativeImageAsIcon(image, cachePath);
    }

    private writeNativeImageAsIcon(image: electron.NativeImage, targetPath: string) {
        try {
            const sizes = [16, 24, 32, 48, 64, 128, 256];
            const images = sizes.map((size) => ({
                size,
                buffer: image.resize({ width: size, height: size, quality: "best" }).toPNG(),
            })).filter((entry) => entry.buffer.length > 0);

            if (images.length === 0) return null;

            const headerSize = 6;
            const directorySize = images.length * 16;
            let offset = headerSize + directorySize;
            const header = Buffer.alloc(headerSize);
            header.writeUInt16LE(0, 0);
            header.writeUInt16LE(1, 2);
            header.writeUInt16LE(images.length, 4);

            const entries = images.map(({ size, buffer }) => {
                const entry = Buffer.alloc(16);
                entry.writeUInt8(size >= 256 ? 0 : size, 0);
                entry.writeUInt8(size >= 256 ? 0 : size, 1);
                entry.writeUInt8(0, 2);
                entry.writeUInt8(0, 3);
                entry.writeUInt16LE(1, 4);
                entry.writeUInt16LE(32, 6);
                entry.writeUInt32LE(buffer.length, 8);
                entry.writeUInt32LE(offset, 12);
                offset += buffer.length;
                return entry;
            });

            fs.writeFileSync(targetPath, Buffer.concat([header, ...entries, ...images.map((entry) => entry.buffer)]));
            return targetPath;
        } catch (error) {
            logsService.log("webpages", "shortcut_icon.convert_failed", { error: String(error) }, "warn");
            return null;
        }
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
