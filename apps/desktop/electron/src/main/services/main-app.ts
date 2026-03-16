import logger from "../../communs/logger.js";
import { getDb } from "./database.js";
import { Settings } from './settings.js';
import { App } from "../../types/apps.js";
import { Shortcut } from "../../types/shortcuts.js";
import { AppCategory } from "../../types/categories.js";
import EventEmitter from "events";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import electron from "electron";
import { exec, spawn } from "node:child_process";
import rebotjs from "robotjs";
import { SoundPadService } from "./soundpad.js";
import { ObsService } from "./obs.js";
import { WebPagesService } from "./web-pages.js";
import { logsService } from "./logs.js";
import { observerService, ObserverChannels } from "./observer.js";

const { app: electronApp, protocol } = electron;


export class MainAppService extends EventEmitter {
    private protocolRegistered = false;
    private robot: any | null = null;
    private soundPadService: SoundPadService;
    private obsService: ObsService;
    private webPagesService: WebPagesService;
    private changeCallback: ((type: string, data?: unknown) => void) | null = null;

    constructor(soundPadService: SoundPadService, obsService: ObsService, webPagesService: WebPagesService) {
        super();
        this.soundPadService = soundPadService;
        this.obsService = obsService;
        this.webPagesService = webPagesService;
        try {
            this.robot = rebotjs;
        } catch {
            this.robot = null;
        }
        /*
        observerService.subscribe('GLOBAL', (data) => {
            console.log(data);
        });
        */
    }

    public onChange(callback: (type: string, data?: unknown) => void) {
        this.changeCallback = callback;
    }

    private notifyChange(type: string, data?: unknown) {
        // Emit internal EventEmitter event (for backward compatibility)
        this.emit(type, data);

        // Publish to global observer
        const eventType = type as "app-added" | "app-updated" | "app-deleted" | "app-repositioned";

        switch (eventType) {
            case "app-added":
                observerService.publish(
                    ObserverChannels.APP_ADDED,
                    { app: data },
                    "MAIN_APP_SERVICE"
                );
                break;
            case "app-updated":
                observerService.publish(
                    ObserverChannels.APP_UPDATED,
                    { app: data },
                    "MAIN_APP_SERVICE"
                );
                break;
            case "app-deleted":
                observerService.publish(
                    ObserverChannels.APP_DELETED,
                    { appId: String(data) },
                    "MAIN_APP_SERVICE"
                );
                break;
        }

        // Always publish the general apps:changed event (async)
        void this.listApps().then((apps) => {
            observerService.publish(
                ObserverChannels.APPS_CHANGED,
                {
                    type: eventType.replace("app-", "") as "added" | "updated" | "deleted" | "repositioned",
                    app: data,
                    apps
                },
                "MAIN_APP_SERVICE"
            );
        });

        // Legacy callback support
        if (this.changeCallback) {
            try {
                this.changeCallback(type, data);
            } catch {
                // ignore callback errors
            }
        }
    }

    private notifyCategoryChange(type: "category-added" | "category-updated" | "category-deleted", data?: AppCategory | { id: string }) {
        const eventType = type as "category-added" | "category-updated" | "category-deleted";
        switch (eventType) {
            case "category-added":
                observerService.publish(
                    ObserverChannels.CATEGORY_ADDED,
                    { category: data },
                    "MAIN_APP_SERVICE"
                );
                break;
            case "category-updated":
                observerService.publish(
                    ObserverChannels.CATEGORY_UPDATED,
                    { category: data },
                    "MAIN_APP_SERVICE"
                );
                break;
            case "category-deleted":
                observerService.publish(
                    ObserverChannels.CATEGORY_DELETED,
                    { categoryId: String((data as { id?: string })?.id ?? "") },
                    "MAIN_APP_SERVICE"
                );
                break;
        }

        void this.listCategories().then((categories) => {
            observerService.publish(
                ObserverChannels.CATEGORIES_CHANGED,
                {
                    type: eventType.replace("category-", "") as "added" | "updated" | "deleted",
                    category: data,
                    categories,
                },
                "MAIN_APP_SERVICE"
            );
        });
    }

    private getStorageRootPath() {
        return path.join(electronApp.getPath("userData"), Settings.get("storage").baseFolder);
    }

    private ensureStorageFolder(folderName: string) {
        const folder = path.join(this.getStorageRootPath(), folderName);
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }

    public getStorageDirectoryPath(folderName: string) {
        return this.ensureStorageFolder(folderName);
    }

    private toRelativeStoragePath(absolutePath: string) {
        const root = this.getStorageRootPath();
        return path.relative(root, absolutePath).split(path.sep).join("/");
    }

    private toMediaUrlFromRelativePath(relativePath: string) {
        return `underdeck-media://${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    public importFileToStorage(sourcePath: string, folderName: string, targetFileName?: string) {
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

    private resolveMediaUrlToAbsolutePath(mediaUrl: string) {
        const url = new URL(mediaUrl);
        const rawPath = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/^\/+/, "");
        const absolute = path.normalize(path.join(this.getStorageRootPath(), rawPath));
        const root = path.normalize(this.getStorageRootPath());
        if (!absolute.startsWith(root)) return null;
        return absolute;
    }

    public resolveMediaToAbsolutePath(mediaUrl: string) {
        return this.resolveMediaUrlToAbsolutePath(mediaUrl);
    }

    private resolveIconToAbsolutePath(icon: string | null | undefined) {
        if (!icon) return null;
        if (icon.startsWith("underdeck-media://")) {
            return this.resolveMediaUrlToAbsolutePath(icon);
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
            // ignore failures to avoid blocking app update/delete
        }
    }

    private hasIconReference(icon: string | null | undefined) {
        if (!icon) return false;
        const appDb = this.getAppDataBase();
        const shortcutDb = this.getShortcutDataBase();
        const appRef = appDb.prepare("SELECT 1 FROM apps WHERE icon = ? LIMIT 1").get(icon);
        if (appRef) return true;
        const shortcutRef = shortcutDb.prepare("SELECT 1 FROM shortcuts WHERE icon = ? LIMIT 1").get(icon);
        if (shortcutRef) return true;
        const categoryDb = this.getCategoryDataBase();
        const categoryRef = categoryDb.prepare("SELECT 1 FROM categories WHERE icon = ? LIMIT 1").get(icon);
        return !!categoryRef;
    }

    private deleteIconFileIfUnreferenced(icon: string | null | undefined) {
        if (!icon) return;
        if (this.hasIconReference(icon)) return;
        this.deleteIconFileIfLocal(icon);
    }

    private persistEntityIcon(icon: string | null | undefined, entityId: string, folderName: string) {
        if (!icon) return null;
        if (icon.startsWith("underdeck-media://")) return icon;
        if (icon.startsWith("data:")) return icon;

        const iconPath = icon.replace(/^file:\/\//i, "");
        const extension = path.extname(iconPath) || ".png";
        const imported = this.importFileToStorage(
            iconPath,
            folderName,
            `${entityId}${extension.toLowerCase()}`
        );
        return imported?.mediaUrl ?? icon;
    }

    registerMediaProtocol() {
        if (this.protocolRegistered) return;
        protocol.handle("underdeck-media", async (request) => {
            const absolutePath = this.resolveMediaUrlToAbsolutePath(request.url);
            if (!absolutePath) return new Response("Forbidden", { status: 403 });
            if (!fs.existsSync(absolutePath)) return new Response("Not found", { status: 404 });

            const stat = fs.statSync(absolutePath);
            const fileSize = stat.size;
            const ext = path.extname(absolutePath).toLowerCase();
            const mimeByExt: Record<string, string> = {
                ".mp4": "video/mp4",
                ".webm": "video/webm",
                ".mkv": "video/x-matroska",
                ".mov": "video/quicktime",
                ".avi": "video/x-msvideo",
                ".m4v": "video/x-m4v",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".gif": "image/gif",
                ".bmp": "image/bmp",
                ".svg": "image/svg+xml",
            };
            const contentType = mimeByExt[ext] ?? "application/octet-stream";
            const rangeHeader = request.headers.get("range");

            if (request.method.toUpperCase() === "HEAD") {
                return new Response(null, {
                    status: 200,
                    headers: {
                        "Content-Type": contentType,
                        "Accept-Ranges": "bytes",
                        "Content-Length": String(fileSize),
                        "Cache-Control": "no-cache",
                    },
                });
            }

            if (rangeHeader) {
                const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
                if (!match) {
                    return new Response("Range Not Satisfiable", {
                        status: 416,
                        headers: {
                            "Content-Range": `bytes */${fileSize}`,
                        },
                    });
                }

                const startRaw = match[1];
                const endRaw = match[2];
                let start = startRaw ? Number(startRaw) : 0;
                let end = endRaw ? Number(endRaw) : fileSize - 1;

                if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) {
                    return new Response("Range Not Satisfiable", {
                        status: 416,
                        headers: {
                            "Content-Range": `bytes */${fileSize}`,
                        },
                    });
                }

                end = Math.min(end, fileSize - 1);
                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(absolutePath, { start, end });
                return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
                    status: 206,
                    headers: {
                        "Content-Type": contentType,
                        "Accept-Ranges": "bytes",
                        "Content-Length": String(chunkSize),
                        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                        "Cache-Control": "no-cache",
                    },
                });
            }

            const fullStream = fs.createReadStream(absolutePath);
            return new Response(Readable.toWeb(fullStream) as unknown as ReadableStream, {
                status: 200,
                headers: {
                    "Content-Type": contentType,
                    "Accept-Ranges": "bytes",
                    "Content-Length": String(fileSize),
                    "Cache-Control": "no-cache",
                },
            });
        });
        this.protocolRegistered = true;
    }

    private getAppDataBase() {
        const db = getDb('apps');
        db.prepare(`CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, position INTEGER DEFAULT 0, type INTEGER, name TEXT, icon TEXT, banner TEXT, description TEXT, meta_data TEXT, updated_at INTEGER DEFAULT 0)`).run();
        const columns = db.prepare("PRAGMA table_info(apps)").all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "position")) {
            db.prepare("ALTER TABLE apps ADD COLUMN position INTEGER DEFAULT 0").run();
            const rows = db.prepare("SELECT id FROM apps ORDER BY rowid ASC").all() as Array<{ id: string }>;
            rows.forEach((row, index) => {
                db.prepare("UPDATE apps SET position = ? WHERE id = ?").run(index, row.id);
            });
        }
        if (!columns.some((column) => column.name === "updated_at")) {
            db.prepare("ALTER TABLE apps ADD COLUMN updated_at INTEGER DEFAULT 0").run();
            db.prepare("UPDATE apps SET updated_at = ?").run(Date.now());
        }
        return db;
    }

    private getCategoryDataBase() {
        const db = getDb('apps');
        db.prepare(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, icon TEXT, apps TEXT, timestamp INTEGER DEFAULT 0)`).run();
        const columns = db.prepare("PRAGMA table_info(categories)").all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "apps")) {
            db.prepare("ALTER TABLE categories ADD COLUMN apps TEXT").run();
            db.prepare("UPDATE categories SET apps = ? WHERE apps IS NULL").run(JSON.stringify([]));
        }
        if (!columns.some((column) => column.name === "timestamp")) {
            db.prepare("ALTER TABLE categories ADD COLUMN timestamp INTEGER DEFAULT 0").run();
            db.prepare("UPDATE categories SET timestamp = ? WHERE timestamp IS NULL").run(Date.now());
        }
        return db;
    }

    private getShortcutDataBase() {
        const db = getDb('shortcuts');
        db.prepare(`CREATE TABLE IF NOT EXISTS shortcuts (id TEXT PRIMARY KEY, type INTEGER, name TEXT, icon TEXT, banner TEXT, description TEXT, meta_data TEXT)`).run();
        return db;
    }

    private normalizeCategoryApps(value: unknown) {
        if (!Array.isArray(value)) return [] as string[];
        const unique = new Set<string>();
        value.forEach((item) => {
            const id = String(item || "").trim();
            if (id) unique.add(id);
        });
        return Array.from(unique);
    }

    private mapCategoryRow(row: any): AppCategory {
        return {
            id: String(row.id),
            name: String(row.name ?? ""),
            icon: row.icon ?? null,
            apps: this.normalizeCategoryApps(JSON.parse(row.apps ?? "[]")),
            timestamp: Number(row.timestamp ?? Date.now()),
        };
    }

    private updateCategoryRow(categoryId: string, patch: Partial<AppCategory>) {
        const current = this.findCategory(categoryId);
        if (!current) return null;
        const next: AppCategory = {
            ...current,
            ...patch,
            apps: this.normalizeCategoryApps(patch.apps ?? current.apps),
            timestamp: Number(patch.timestamp ?? Date.now()),
        };
        const db = this.getCategoryDataBase();
        db.prepare("UPDATE categories SET name = ?, icon = ?, apps = ?, timestamp = ? WHERE id = ?").run(
            next.name,
            next.icon,
            JSON.stringify(next.apps),
            next.timestamp,
            next.id
        );
        return next;
    }

    private removeAppsFromOtherCategories(appIds: string[], exceptCategoryId?: string | null) {
        if (appIds.length === 0) return [] as AppCategory[];
        const db = this.getCategoryDataBase();
        const rows = db.prepare("SELECT * FROM categories").all() as any[];
        const updated: AppCategory[] = [];
        const idsSet = new Set(appIds);
        rows.forEach((row) => {
            if (exceptCategoryId && row.id === exceptCategoryId) return;
            const apps = this.normalizeCategoryApps(JSON.parse(row.apps ?? "[]"));
            const filtered = apps.filter((id) => !idsSet.has(id));
            if (filtered.length === apps.length) return;
            const next = this.updateCategoryRow(String(row.id), { apps: filtered });
            if (next) updated.push(next);
        });
        return updated;
    }

    private removeAppFromCategories(appId: string) {
        const db = this.getCategoryDataBase();
        const rows = db.prepare("SELECT * FROM categories").all() as any[];
        const updated: AppCategory[] = [];
        rows.forEach((row) => {
            const apps = this.normalizeCategoryApps(JSON.parse(row.apps ?? "[]"));
            if (!apps.includes(appId)) return;
            const filtered = apps.filter((id) => id !== appId);
            const next = this.updateCategoryRow(String(row.id), { apps: filtered });
            if (next) updated.push(next);
        });
        return updated;
    }

    listApps(): Promise<App[]> {
        return new Promise((resolve, reject) => {
            const db = this.getAppDataBase();
            const rows = db.prepare('SELECT * FROM apps ORDER BY position ASC, rowid ASC').all();
            const apps = (rows as any[]).map(row => ({
                id: row.id,
                position: Number.isFinite(row.position) ? row.position : 0,
                type: row.type,
                name: row.name,
                icon: row.icon,
                banner: row.banner,
                description: row.description,
                meta_data: JSON.parse(row.meta_data),
                updatedAt: Number(row.updated_at || row.updatedAt || Date.now())
            }));
            resolve(apps);
        });
    }

    listCategories(): Promise<AppCategory[]> {
        return new Promise((resolve) => {
            const db = this.getCategoryDataBase();
            const rows = db.prepare("SELECT * FROM categories ORDER BY timestamp DESC, rowid DESC").all();
            const categories = (rows as any[]).map((row) => this.mapCategoryRow(row));
            resolve(categories);
        });
    }

    addCategory(category: AppCategory) {
        const db = this.getCategoryDataBase();
        const now = Date.now();
        const appIds = this.normalizeCategoryApps(category.apps);
        const storage = Settings.get("storage");
        const categoryIconsFolder = storage?.categoryIconsFolder ?? storage?.appIconsFolder;
        const categoryData: AppCategory = {
            id: category.id,
            name: category.name,
            icon: this.persistEntityIcon(category.icon, category.id, categoryIconsFolder),
            apps: appIds,
            timestamp: now,
        };

        db.prepare("INSERT INTO categories (id, name, icon, apps, timestamp) VALUES (?, ?, ?, ?, ?)").run(
            categoryData.id,
            categoryData.name,
            categoryData.icon,
            JSON.stringify(categoryData.apps),
            categoryData.timestamp
        );

        const updated = this.removeAppsFromOtherCategories(categoryData.apps, categoryData.id);
        updated.forEach((item) => this.notifyCategoryChange("category-updated", item));

        this.notifyCategoryChange("category-added", categoryData);
        return categoryData;
    }

    updateCategory(category: AppCategory) {
        const current = this.findCategory(category.id);
        if (!current) return null;

        const appIds = this.normalizeCategoryApps(category.apps ?? current.apps);
        const storage = Settings.get("storage");
        const categoryIconsFolder = storage?.categoryIconsFolder ?? storage?.appIconsFolder;
        const nextIcon = this.persistEntityIcon(category.icon, category.id, categoryIconsFolder);
        const now = Date.now();
        const updated = this.updateCategoryRow(category.id, {
            name: category.name ?? current.name,
            icon: nextIcon,
            apps: appIds,
            timestamp: now,
        });

        if (!updated) return null;

        if (current.icon !== updated.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }

        const normalizedUpdated = this.removeAppsFromOtherCategories(updated.apps, updated.id);
        normalizedUpdated.forEach((item) => this.notifyCategoryChange("category-updated", item));

        this.notifyCategoryChange("category-updated", updated);
        return updated;
    }

    deleteCategory(id: string) {
        const current = this.findCategory(id);
        const db = this.getCategoryDataBase();
        const result = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
        if (current?.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        this.notifyCategoryChange("category-deleted", { id });
        return result;
    }

    findCategory(id: string) {
        const db = this.getCategoryDataBase();
        const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as any;
        if (!row) return null;
        return this.mapCategoryRow(row);
    }

    setAppCategory(appId: string, categoryId: string | null) {
        const db = this.getCategoryDataBase();
        const rows = db.prepare("SELECT * FROM categories").all() as any[];
        const updated: AppCategory[] = [];
        const targetId = categoryId ? String(categoryId) : null;
        const now = Date.now();

        rows.forEach((row) => {
            const apps = this.normalizeCategoryApps(JSON.parse(row.apps ?? "[]"));
            const isTarget = targetId && row.id === targetId;
            let nextApps = apps;

            if (isTarget) {
                if (!apps.includes(appId)) {
                    nextApps = [...apps, appId];
                }
            } else if (apps.includes(appId)) {
                nextApps = apps.filter((id) => id !== appId);
            }

            if (nextApps !== apps) {
                const next = this.updateCategoryRow(String(row.id), { apps: nextApps, timestamp: now });
                if (next) updated.push(next);
            }
        });

        updated.forEach((item) => this.notifyCategoryChange("category-updated", item));
        return this.listCategories();
    }

    addApp(app: App) {
        const db = this.getAppDataBase();
        const maxPositionRow = db.prepare("SELECT MAX(position) as maxPosition FROM apps").get() as { maxPosition: number | null };
        const now = Date.now();
        const appData: App = {
            ...app,
            position: typeof app.position === "number" ? app.position : (maxPositionRow.maxPosition ?? -1) + 1,
            icon: this.persistEntityIcon(app.icon, app.id, Settings.get("storage").appIconsFolder),
            updatedAt: now,
        };
        db.prepare('INSERT INTO apps (id, position, type, name, icon, banner, description, meta_data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            appData.id,
            appData.position,
            appData.type,
            appData.name,
            appData.icon,
            appData.banner,
            appData.description,
            JSON.stringify(appData.meta_data),
            now
        );
        this.notifyChange('app-added', appData);
        return appData;
    }

    updateApp(app: App) {
        const current = this.findApp(app.id);
        if (!current) return null;

        const nextIcon = this.persistEntityIcon(app.icon, app.id, Settings.get("storage").appIconsFolder);
        const now = Date.now();
        const appData: App = {
            ...current,
            ...app,
            position: typeof app.position === "number" ? app.position : current.position,
            icon: nextIcon,
            updatedAt: now,
        };

        const db = this.getAppDataBase();
        db.prepare(
            'UPDATE apps SET position = ?, type = ?, name = ?, icon = ?, banner = ?, description = ?, meta_data = ?, updated_at = ? WHERE id = ?'
        ).run(
            appData.position,
            appData.type,
            appData.name,
            appData.icon,
            appData.banner,
            appData.description,
            JSON.stringify(appData.meta_data),
            now,
            appData.id
        );

        if (current.icon !== appData.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }

        this.notifyChange('app-updated', appData);
        return appData;
    }

    deleteApp(id: string) {
        const current = this.findApp(id);
        const db = this.getAppDataBase();
        const result = db.prepare('DELETE FROM apps WHERE id = ?').run(id);

        const shortcutDb = this.getShortcutDataBase();
        const shortcutRows = shortcutDb.prepare('SELECT * FROM shortcuts').all() as any[];
        shortcutRows.forEach((row) => {
            try {
                const metaData = JSON.parse(row.meta_data ?? "{}");
                if (metaData?.appId !== id) return;

                shortcutDb.prepare('DELETE FROM shortcuts WHERE id = ?').run(row.id);
                if (row.icon) {
                    this.deleteIconFileIfUnreferenced(row.icon);
                }
                this.notifyChange('shortcut-deleted', row.id);
            } catch {
                // ignore invalid shortcut metadata rows
            }
        });

        if (current?.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        const updatedCategories = this.removeAppFromCategories(id);
        updatedCategories.forEach((category) => this.notifyCategoryChange("category-updated", category));
        this.notifyChange('app-deleted', id);
        return result;
    }

    findApp(id: string) {
        const db = this.getAppDataBase();
        const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as any;
        if (!row) return null;
        return {
            id: row.id,
            position: Number.isFinite(row.position) ? row.position : 0,
            type: row.type,
            name: row.name,
            icon: row.icon,
            banner: row.banner,
            description: row.description,
            meta_data: JSON.parse(row.meta_data),
            updatedAt: Number(row.updated_at || row.updatedAt || Date.now()),
        }
    }

    async executeApp(id: string) {
        const app = this.findApp(id);
        if (!app) {
            logsService.log("app", "execute.missing", { id }, "warn");
            return null;
        }
        logsService.log("app", "execute.start", { id: app.id, type: app.type, name: app.name });
        const shouldLogApp = logsService.isEnabled("app");
        const truncateOutput = (value: unknown, limit = 4000) => {
            if (value === undefined || value === null) return undefined;
            const text = String(value);
            if (text.length <= limit) return text;
            return `${text.slice(0, limit)}...`;
        };
        switch (app.type) {
            case 1: {
                if (!("path" in app.meta_data) || !app.meta_data.path) {
                    logsService.log("app", "execute.invalid_path", { id: app.id }, "warn");
                    return false;
                }
                const args = Array.isArray(app.meta_data.args) ? app.meta_data.args : [];
                const fallbackCwd = path.dirname(app.meta_data.path);
                const child = spawn(app.meta_data.path, args, {
                    detached: true,
                    stdio: shouldLogApp ? ["ignore", "pipe", "pipe"] : "ignore",
                    cwd: app.meta_data.cwd || fallbackCwd,
                    env: app.meta_data.env ? { ...process.env, ...app.meta_data.env } : process.env,
                    windowsHide: true,
                });
                child.unref();
                logsService.log("app", "execute.spawn", { id: app.id, path: app.meta_data.path, args });
                if (shouldLogApp) {
                    let stdout = "";
                    let stderr = "";
                    child.stdout?.on("data", (chunk) => {
                        stdout += chunk.toString();
                    });
                    child.stderr?.on("data", (chunk) => {
                        stderr += chunk.toString();
                    });
                    child.on("error", (error) => {
                        logsService.log("app", "execute.spawn.error", {
                            id: app.id,
                            path: app.meta_data.path,
                            args,
                            error: String(error),
                            stdout: truncateOutput(stdout),
                            stderr: truncateOutput(stderr),
                        }, "error");
                    });
                    child.on("close", (code, signal) => {
                        logsService.log("app", "execute.spawn.exit", {
                            id: app.id,
                            path: app.meta_data.path,
                            args,
                            code,
                            signal,
                            stdout: truncateOutput(stdout),
                            stderr: truncateOutput(stderr),
                        });
                    });
                }
                return true;
            }
            case 2: {
                if (!("cmd" in app.meta_data)) return false;
                const currentOs = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
                if (app.meta_data.os !== currentOs) return false;

                if (currentOs === "windows") {
                    const robotKeyMap: Record<string, string> = {
                        "media-next": "audio_next",
                        "media-previous": "audio_prev",
                        "media-play-pause": "audio_play",
                        "media-pause": "audio_play",
                        "media-mute-unmute": "audio_mute",
                        "media-volume-up": "audio_vol_up",
                        "media-volume-down": "audio_vol_down",
                    };

                    const robotKey = robotKeyMap[app.meta_data.cmd];
                    if (!robotKey) return false;

                    if (!this.robot) return false;
                    try {
                        this.robot.keyTap(robotKey);
                        logsService.log("app", "execute.system", { id: app.id, cmd: app.meta_data.cmd });
                        return true;
                    } catch {
                        logsService.log("app", "execute.system.error", { id: app.id, cmd: app.meta_data.cmd }, "error");
                        return false;
                    }
                }

                logger.log(logger.cli.yellow(`Comando de sistema ainda não implementado para este OS: `), app.meta_data.os);
                return false;
            }
            case 3: {
                if (!("action" in app.meta_data) && !("type" in app.meta_data)) return false;

                // Backward compatibility for previously saved metadata.
                const legacyType = ("type" in app.meta_data ? String(app.meta_data.type) : "").toLowerCase();
                const action = "action" in app.meta_data
                    ? app.meta_data.action
                    : legacyType === "cmd"
                        ? "toggle-pause"
                        : "play-sound";

                if (action === "play-current-again") {
                    const result = await this.soundPadService.repeatCurrentSound();
                    return result.ok;
                }
                if (action === "stop") {
                    const result = await this.soundPadService.stopSound();
                    return result.ok;
                }
                if (action === "toggle-pause") {
                    const result = await this.soundPadService.togglePause();
                    return result.ok;
                }

                const numericIndex = "soundIndex" in app.meta_data
                    ? Number(app.meta_data.soundIndex)
                    : Number("path" in app.meta_data ? app.meta_data.path : NaN);
                if (!Number.isFinite(numericIndex) || numericIndex <= 0) return false;

                const result = await this.soundPadService.playSound(numericIndex);
                return result.ok;
            }
            case 4: {
                if (!("url" in app.meta_data) || !app.meta_data.url) {
                    logsService.log("app", "execute.url.invalid", { id: app.id }, "warn");
                    return false;
                }
                const url = app.meta_data.url;
                const openInApp = Boolean((app.meta_data as any)?.openInApp);
                try {
                    const _url = new URL(url);
                    if (openInApp) {
                        await this.webPagesService.openUrl(_url.toString(), app.name);
                        logsService.log("app", "execute.url.in_app", { id: app.id, url: _url.toString() });
                        return true;
                    }
                    await electron.shell.openExternal(_url.toString());
                    logsService.log("app", "execute.url", { id: app.id, url: _url.toString() });
                    return true;
                } catch (error) {
                    logsService.log("app", "execute.url.error", { id: app.id, url, error: String(error) }, "error");
                    return false;
                }
            }
            case 5: {
                const connected = await this.obsService.ensureConnected();
                if (!connected) return false;

                const meta = app.meta_data as any;
                const target = String(meta?.target ?? "").toLowerCase();
                const action = String(meta?.action ?? "").toLowerCase();

                if (target === "stream") {
                    if (action === "start") return (await this.obsService.startStream()).ok;
                    if (action === "stop") return (await this.obsService.stopStream()).ok;
                    if (action === "toggle") return (await this.obsService.toggleStream()).ok;
                    return false;
                }

                if (target === "record") {
                    if (action === "start") return (await this.obsService.startRecord()).ok;
                    if (action === "stop") return (await this.obsService.stopRecord()).ok;
                    if (action === "toggle") return (await this.obsService.toggleRecordPause()).ok;
                    if (action === "pause") return (await this.obsService.pauseRecord()).ok;
                    if (action === "resume") return (await this.obsService.resumeRecord()).ok;
                    return false;
                }

                if (target === "scene") {
                    const sceneName = String(meta?.sceneName ?? meta?.path ?? "").trim();
                    if (!sceneName) return false;
                    return (await this.obsService.setCurrentScene(sceneName)).ok;
                }

                if (target === "audio") {
                    const inputName = String(meta?.inputName ?? meta?.inputUuid ?? meta?.path ?? "").trim();
                    if (!inputName) return false;
                    if (action === "mute") return (await this.obsService.setInputMute(inputName, true)).ok;
                    if (action === "unmute") return (await this.obsService.setInputMute(inputName, false)).ok;
                    if (action === "toggle") return (await this.obsService.toggleInputMute(inputName)).ok;
                    return false;
                }

                // Backward compatibility with old metadata format.
                const legacyType = String(meta?.type ?? "").toLowerCase();
                const legacyPath = String(meta?.path ?? "").trim();
                if (legacyType === "scene" && legacyPath) {
                    return (await this.obsService.setCurrentScene(legacyPath)).ok;
                }
                if (legacyType === "input" && legacyPath) {
                    return (await this.obsService.toggleInputMute(legacyPath)).ok;
                }
                if (legacyType === "action") {
                    const normalized = legacyPath.toLowerCase();
                    if (normalized.includes("startstream")) return (await this.obsService.startStream()).ok;
                    if (normalized.includes("stopstream")) return (await this.obsService.stopStream()).ok;
                    if (normalized.includes("togglestream")) return (await this.obsService.toggleStream()).ok;
                    if (normalized.includes("startrecord")) return (await this.obsService.startRecord()).ok;
                    if (normalized.includes("stoprecord")) return (await this.obsService.stopRecord()).ok;
                    if (normalized.includes("togglerecordpause")) return (await this.obsService.toggleRecordPause()).ok;
                    if (normalized.includes("pauserecord")) return (await this.obsService.pauseRecord()).ok;
                    if (normalized.includes("resumerecord")) return (await this.obsService.resumeRecord()).ok;
                }
                return false;
            }
            case 6: {
                if (!("command" in app.meta_data) || !app.meta_data.command) {
                    logsService.log("app", "execute.command.invalid", { id: app.id }, "warn");
                    return false;
                }
                if (process.platform !== "win32") return false;
                const commandBase = String(app.meta_data.command);
                const args = Array.isArray(app.meta_data.args) ? app.meta_data.args : [];
                const quoteArg = (value: string) => {
                    if (value.length === 0) return "\"\"";
                    if (/[\s"]/g.test(value)) {
                        return `"${value.replace(/"/g, "\"\"")}"`;
                    }
                    return value;
                };
                const argsString = args.map((arg: unknown) => quoteArg(String(arg))).join(" ");
                const fullCommand = `"${commandBase}" ${argsString}`.trim();
                logsService.log("app", "execute.command", { id: app.id, command: fullCommand, args });
                exec(
                    fullCommand,
                    { env: process.env, windowsHide: true, shell: process.env.ComSpec ?? "cmd.exe" },
                    (error, stdout, stderr) => {
                        if (!shouldLogApp) return;
                        logsService.log(
                            "app",
                            error ? "execute.command.error" : "execute.command.result",
                            {
                            id: app.id,
                            command: fullCommand,
                            args,
                            error: error ? String(error) : undefined,
                            stdout: truncateOutput(stdout),
                            stderr: truncateOutput(stderr),
                        },
                        error ? "error" : "info"
                    );
                    }
                );
                return true;
            }
            default: {
                logger.log(logger.cli.yellow(`Executar APP (não implementado para o tipo): `), app);
                return false;
            }
        }
    }

    repositionApp(id: string, toPosition: number) {
        const db = this.getAppDataBase();
        const rows = db.prepare("SELECT id FROM apps ORDER BY position ASC, rowid ASC").all() as Array<{ id: string }>;
        const fromIndex = rows.findIndex((row) => row.id === id);
        if (fromIndex === -1) return this.listApps();

        const clampedTarget = Math.max(0, Math.min(toPosition, rows.length - 1));
        if (clampedTarget === fromIndex) return this.listApps();

        const [item] = rows.splice(fromIndex, 1);
        rows.splice(clampedTarget, 0, item);

        const transaction = db.transaction((items: Array<{ id: string }>) => {
            items.forEach((row, index) => {
                db.prepare("UPDATE apps SET position = ? WHERE id = ?").run(index, row.id);
            });
        });
        transaction(rows);

        return this.listApps();
    }

    listShortcuts(): Promise<Shortcut[]> {
        const db = this.getShortcutDataBase();
        const rows = db.prepare('SELECT * FROM shortcuts').all();
        const shortcuts = (rows as any[]).map(row => ({
            id: row.id,
            type: row.type,
            name: row.name,
            icon: row.icon,
            banner: row.banner,
            description: row.description,
            meta_data: JSON.parse(row.meta_data)
        }));
        return Promise.resolve(shortcuts);
    }

    addShortcut(shortcut: Shortcut) {
        const shortcutData: Shortcut = {
            ...shortcut,
            icon: this.persistEntityIcon(shortcut.icon, shortcut.id, Settings.get("storage").shortcutIconsFolder),
        };
        const db = this.getShortcutDataBase();
        const result = db.prepare('INSERT INTO shortcuts (id, type, name, icon, banner, description, meta_data) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            shortcutData.id,
            shortcutData.type,
            shortcutData.name,
            shortcutData.icon,
            shortcutData.banner,
            shortcutData.description,
            JSON.stringify(shortcutData.meta_data)
        );
        this.notifyChange('shortcut-added', shortcutData);
        return shortcutData;
    }

    updateShortcut(shortcut: Shortcut) {
        const current = this.findShortcut(shortcut.id);
        if (!current) return null;

        const nextIcon = this.persistEntityIcon(shortcut.icon, shortcut.id, Settings.get("storage").shortcutIconsFolder);
        const shortcutData: Shortcut = {
            ...current,
            ...shortcut,
            icon: nextIcon,
        };

        const db = this.getShortcutDataBase();
        db.prepare(
            "UPDATE shortcuts SET type = ?, name = ?, icon = ?, banner = ?, description = ?, meta_data = ? WHERE id = ?"
        ).run(
            shortcutData.type,
            shortcutData.name,
            shortcutData.icon,
            shortcutData.banner,
            shortcutData.description,
            JSON.stringify(shortcutData.meta_data),
            shortcutData.id
        );

        if (current.icon !== shortcutData.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }

        this.notifyChange("shortcut-updated", shortcutData);
        return shortcutData;
    }

    deleteShortcut(id: string) {
        const current = this.findShortcut(id);
        const db = this.getShortcutDataBase();
        const result = db.prepare('DELETE FROM shortcuts WHERE id = ?').run(id);
        if (current?.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        this.notifyChange('shortcut-deleted', id);
        return result;
    }

    findShortcut(id: string) {
        const db = this.getShortcutDataBase();
        const row = db.prepare('SELECT * FROM shortcuts WHERE id = ?').get(id) as any;
        if (!row) return null;
        return {
            id: row.id,
            type: row.type,
            name: row.name,
            icon: row.icon,
            banner: row.banner,
            description: row.description,
            meta_data: JSON.parse(row.meta_data)
        };
    }

}
