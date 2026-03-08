import logger from "../../communs/logger.js";
import { getDb } from "./database.js";
import { Settings } from './settings.js';
import { App } from "../../types/apps.js";
import { Shortcut } from "../../types/shortcuts.js";
import EventEmitter from "events";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import electron from "electron";
import { exec, spawn } from "node:child_process";
import rebotjs from "robotjs";
import { SoundPadService } from "./soundpad.js";
import { ObsService } from "./obs.js";
const { app: electronApp, protocol } = electron;


export class MainAppService extends EventEmitter {
    private protocolRegistered = false;
    private robot: any | null = null;
    private soundPadService: SoundPadService;
    private obsService: ObsService;

    constructor(soundPadService: SoundPadService, obsService: ObsService) {
        super();
        this.soundPadService = soundPadService;
        this.obsService = obsService;
        try {
            this.robot = rebotjs;
        } catch {
            this.robot = null;
        }
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
        return !!shortcutRef;
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
        db.prepare(`CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, position INTEGER DEFAULT 0, type INTEGER, name TEXT, icon TEXT, banner TEXT, description TEXT, meta_data TEXT)`).run();
        const columns = db.prepare("PRAGMA table_info(apps)").all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "position")) {
            db.prepare("ALTER TABLE apps ADD COLUMN position INTEGER DEFAULT 0").run();
            const rows = db.prepare("SELECT id FROM apps ORDER BY rowid ASC").all() as Array<{ id: string }>;
            rows.forEach((row, index) => {
                db.prepare("UPDATE apps SET position = ? WHERE id = ?").run(index, row.id);
            });
        }
        return db;
    }

    private getShortcutDataBase() {
        const db = getDb('shortcuts');
        db.prepare(`CREATE TABLE IF NOT EXISTS shortcuts (id TEXT PRIMARY KEY, type INTEGER, name TEXT, icon TEXT, banner TEXT, description TEXT, meta_data TEXT)`).run();
        return db;
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
                meta_data: JSON.parse(row.meta_data)
            }));
            resolve(apps);
        });
    }

    addApp(app: App) {
        const db = this.getAppDataBase();
        const maxPositionRow = db.prepare("SELECT MAX(position) as maxPosition FROM apps").get() as { maxPosition: number | null };
        const appData: App = {
            ...app,
            position: typeof app.position === "number" ? app.position : (maxPositionRow.maxPosition ?? -1) + 1,
            icon: this.persistEntityIcon(app.icon, app.id, Settings.get("storage").appIconsFolder),
        };
        db.prepare('INSERT INTO apps (id, position, type, name, icon, banner, description, meta_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            appData.id,
            appData.position,
            appData.type,
            appData.name,
            appData.icon,
            appData.banner,
            appData.description,
            JSON.stringify(appData.meta_data)
        );
        this.emit('app-added', appData);
        return appData;
    }

    updateApp(app: App) {
        const current = this.findApp(app.id);
        if (!current) return null;

        const nextIcon = this.persistEntityIcon(app.icon, app.id, Settings.get("storage").appIconsFolder);
        const appData: App = {
            ...current,
            ...app,
            position: typeof app.position === "number" ? app.position : current.position,
            icon: nextIcon,
        };

        const db = this.getAppDataBase();
        db.prepare(
            'UPDATE apps SET position = ?, type = ?, name = ?, icon = ?, banner = ?, description = ?, meta_data = ? WHERE id = ?'
        ).run(
            appData.position,
            appData.type,
            appData.name,
            appData.icon,
            appData.banner,
            appData.description,
            JSON.stringify(appData.meta_data),
            appData.id
        );

        if (current.icon !== appData.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }

        this.emit('app-updated', appData);
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
                this.emit('shortcut-deleted', row.id);
            } catch {
                // ignore invalid shortcut metadata rows
            }
        });

        if (current?.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        this.emit('app-deleted', id);
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
            meta_data: JSON.parse(row.meta_data)
        }
    }

    async executeApp(id: string) {
        const app = this.findApp(id);
        if (!app) return null;
        switch (app.type) {
            case 1: {
                if (!("path" in app.meta_data) || !app.meta_data.path) return false;
                const args = Array.isArray(app.meta_data.args) ? app.meta_data.args : [];
                const fallbackCwd = path.dirname(app.meta_data.path);
                spawn(app.meta_data.path, args, {
                    detached: true,
                    stdio: "ignore",
                    cwd: app.meta_data.cwd || fallbackCwd,
                    env: app.meta_data.env ? { ...process.env, ...app.meta_data.env } : process.env,
                }).unref();
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
                        return true;
                    } catch {
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
                if (!("url" in app.meta_data) || !app.meta_data.url) return false;
                const url = app.meta_data.url;
                try {
                    const _url = new URL(url);
                    exec(`start "" "${url}"`, () => { });
                    return true;
                } catch (error) {
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
                if (!("command" in app.meta_data) || !app.meta_data.command) return false;
                if (process.platform !== "win32") return false;
                const args = Array.isArray(app.meta_data.args) ? app.meta_data.args : [];
                const baseArgs = args.length > 0 ? args : ["/c"];
                spawn("cmd.exe", [...baseArgs, app.meta_data.command], {
                    detached: true,
                    stdio: "ignore",
                    env: process.env,
                }).unref();
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
        this.emit('shortcut-added', shortcutData);
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

        this.emit("shortcut-updated", shortcutData);
        return shortcutData;
    }

    deleteShortcut(id: string) {
        const current = this.findShortcut(id);
        const db = this.getShortcutDataBase();
        const result = db.prepare('DELETE FROM shortcuts WHERE id = ?').run(id);
        if (current?.icon) {
            this.deleteIconFileIfUnreferenced(current.icon);
        }
        this.emit('shortcut-deleted', id);
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
