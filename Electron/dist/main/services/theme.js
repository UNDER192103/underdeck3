import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import electron from "electron";
import axios from "axios";
import { getDb } from "./database.js";
import { Settings } from "./settings.js";
const { app: electronApp } = electron;
export class ThemeService {
    appService;
    jobs = new Map();
    constructor(appService) {
        this.appService = appService;
    }
    getStorageRootPath() {
        return path.join(electronApp.getPath("userData"), Settings.get("storage").baseFolder);
    }
    toRelativeStoragePath(absolutePath) {
        const root = this.getStorageRootPath();
        return path.relative(root, absolutePath).split(path.sep).join("/");
    }
    toMediaUrlFromRelativePath(relativePath) {
        return `underdeck-media://${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }
    sanitizeBaseName(value) {
        const normalized = value
            .normalize("NFKD")
            .replace(/[^\w\- ]+/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .toLowerCase();
        return normalized || "wallpaper";
    }
    ensureThemeTable() {
        const db = getDb("theme");
        db.prepare(`
      CREATE TABLE IF NOT EXISTS theme_wallpapers (
        key TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        remote_url TEXT NOT NULL,
        media_url TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        media_type TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
        return db;
    }
    ensurePreferencesTable() {
        const db = getDb("theme");
        db.prepare(`
      CREATE TABLE IF NOT EXISTS theme_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `).run();
        return db;
    }
    setPreference(key, value) {
        const db = this.ensurePreferencesTable();
        db.prepare(`
      INSERT OR REPLACE INTO theme_preferences (key, value) VALUES (?, ?)
    `).run(key, JSON.stringify(value));
    }
    getPreference(key) {
        const db = this.ensurePreferencesTable();
        const row = db.prepare("SELECT value FROM theme_preferences WHERE key = ? LIMIT 1").get(key);
        if (!row)
            return null;
        try {
            return JSON.parse(row.value);
        }
        catch {
            return null;
        }
    }
    extensionFromRequest(request) {
        try {
            const fromUrl = path.extname(new URL(request.remoteUrl).pathname || "").toLowerCase();
            if (fromUrl)
                return fromUrl;
        }
        catch {
            // fallback to media type
        }
        const mediaType = (request.mediaType ?? "").toLowerCase();
        if (mediaType.startsWith("video/"))
            return ".mp4";
        if (mediaType.startsWith("image/"))
            return ".png";
        return ".bin";
    }
    makeStoreKey(request) {
        return `${request.itemId}:${request.remoteUrl}`;
    }
    resolveRelativePathToAbsolute(relativePath) {
        return path.normalize(path.join(this.getStorageRootPath(), relativePath.replace(/\//g, path.sep)));
    }
    upsertWallpaper(record) {
        const db = this.ensureThemeTable();
        db.prepare(`
      INSERT OR REPLACE INTO theme_wallpapers (
        key, item_id, name, source, remote_url, media_url, relative_path, media_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.key, record.itemId, record.name, record.source, record.remoteUrl, record.mediaUrl, record.relativePath, record.mediaType, record.createdAt);
    }
    clearLocalBackgroundsInternal() {
        const localFolder = this.appService.getStorageDirectoryPath("backgrounds-local");
        if (fs.existsSync(localFolder)) {
            for (const fileName of fs.readdirSync(localFolder)) {
                const absoluteFilePath = path.join(localFolder, fileName);
                try {
                    fs.rmSync(absoluteFilePath, { recursive: true, force: true });
                }
                catch {
                    // ignore best-effort cleanup
                }
            }
        }
        const db = this.ensureThemeTable();
        db.prepare(`DELETE FROM theme_wallpapers WHERE source = 'local'`).run();
    }
    saveLocalBackground(sourcePath, mediaType) {
        this.clearLocalBackgroundsInternal();
        const ext = path.extname(sourcePath) || (mediaType?.startsWith("video/") ? ".mp4" : ".png");
        const targetFileName = `active-local-${Date.now()}${ext.toLowerCase()}`;
        const imported = this.appService.importFileToStorage(sourcePath, "backgrounds-local", targetFileName);
        if (!imported)
            return null;
        const record = {
            key: "local:active",
            itemId: "local:active",
            name: "Local background",
            source: "local",
            remoteUrl: sourcePath,
            mediaUrl: imported.mediaUrl,
            relativePath: imported.relativePath,
            mediaType: mediaType ?? null,
            createdAt: Date.now(),
        };
        this.upsertWallpaper(record);
        return { ...record, exists: true };
    }
    getLocalWallpaper() {
        const db = this.ensureThemeTable();
        const row = db
            .prepare("SELECT * FROM theme_wallpapers WHERE source = 'local' ORDER BY created_at DESC LIMIT 1")
            .get();
        if (!row)
            return null;
        const absolutePath = this.resolveRelativePathToAbsolute(row.relative_path);
        const exists = fs.existsSync(absolutePath);
        const result = {
            key: row.key,
            itemId: row.item_id,
            name: row.name,
            source: row.source,
            remoteUrl: row.remote_url,
            mediaUrl: row.media_url,
            relativePath: row.relative_path,
            mediaType: row.media_type,
            createdAt: row.created_at,
            exists,
        };
        return result;
    }
    uninstallLocalWallpaper() {
        const localFolder = this.appService.getStorageDirectoryPath("backgrounds-local");
        const hasAnyFile = fs.existsSync(localFolder) && fs.readdirSync(localFolder).length > 0;
        const localRow = this.getLocalWallpaper();
        this.clearLocalBackgroundsInternal();
        return !!localRow || hasAnyFile;
    }
    getPreferences(defaultTheme, defaultBackground) {
        const savedTheme = this.getPreference("theme");
        const savedBackground = this.getPreference("background");
        return {
            theme: savedTheme ?? defaultTheme,
            background: savedBackground ?? defaultBackground,
        };
    }
    setTheme(theme) {
        this.setPreference("theme", theme);
        return true;
    }
    setBackground(background) {
        this.setPreference("background", background);
        return true;
    }
    async downloadStoreWallpaperInternal(request, jobId, emitProgress) {
        const safeBaseName = this.sanitizeBaseName(request.name || request.itemId);
        const ext = this.extensionFromRequest(request);
        const storeFolder = this.appService.getStorageDirectoryPath("backgrounds-store");
        const fileName = `${safeBaseName}-${Date.now()}${ext}`;
        const absoluteTargetPath = path.join(storeFolder, fileName);
        const tempPath = `${absoluteTargetPath}.part`;
        const emit = (partial) => {
            emitProgress({
                jobId,
                itemId: request.itemId,
                name: request.name,
                ...partial,
            });
        };
        emit({
            status: "queued",
            progress: 0,
            bytesReceived: 0,
            totalBytes: null,
        });
        try {
            const response = await axios.get(request.remoteUrl, { responseType: "stream", timeout: 120000 });
            const totalBytesHeader = response.headers["content-length"];
            const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
            let bytesReceived = 0;
            response.data.on("data", (chunk) => {
                bytesReceived += chunk.length;
                const progress = totalBytes ? Math.max(0, Math.min(100, Math.round((bytesReceived / totalBytes) * 100))) : 0;
                emit({
                    status: "downloading",
                    progress,
                    bytesReceived,
                    totalBytes,
                });
            });
            await pipeline(response.data, fs.createWriteStream(tempPath));
            fs.renameSync(tempPath, absoluteTargetPath);
            const relativePath = this.toRelativeStoragePath(absoluteTargetPath);
            const mediaUrl = this.toMediaUrlFromRelativePath(relativePath);
            const key = this.makeStoreKey(request);
            this.upsertWallpaper({
                key,
                itemId: request.itemId,
                name: request.name,
                source: "store",
                remoteUrl: request.remoteUrl,
                mediaUrl,
                relativePath,
                mediaType: request.mediaType ?? null,
                createdAt: Date.now(),
            });
            emit({
                status: "completed",
                progress: 100,
                bytesReceived: totalBytes ?? bytesReceived,
                totalBytes,
                mediaUrl,
            });
            return { ok: true, mediaUrl };
        }
        catch (error) {
            try {
                if (fs.existsSync(tempPath))
                    fs.unlinkSync(tempPath);
            }
            catch {
                // ignore cleanup failure
            }
            emit({
                status: "failed",
                progress: 0,
                bytesReceived: 0,
                totalBytes: null,
                error: error?.message ?? "Download failed",
            });
            return { ok: false, error: error?.message ?? "Download failed" };
        }
    }
    startStoreDownload(request, emitProgress) {
        const jobId = randomUUID();
        const promise = this.downloadStoreWallpaperInternal(request, jobId, emitProgress);
        const cleanupTimer = setTimeout(() => {
            this.jobs.delete(jobId);
        }, 10 * 60 * 1000);
        this.jobs.set(jobId, { promise, cleanupTimer });
        return { jobId };
    }
    async waitDownload(jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
            return null;
        try {
            return await job.promise;
        }
        finally {
            clearTimeout(job.cleanupTimer);
            this.jobs.delete(jobId);
        }
    }
    listSavedStoreWallpapers() {
        const db = this.ensureThemeTable();
        const rows = db
            .prepare("SELECT * FROM theme_wallpapers WHERE source = 'store' ORDER BY created_at DESC")
            .all();
        return rows.map((row) => {
            const absolutePath = this.resolveRelativePathToAbsolute(row.relative_path);
            const exists = fs.existsSync(absolutePath);
            return {
                key: row.key,
                itemId: row.item_id,
                name: row.name,
                source: row.source,
                remoteUrl: row.remote_url,
                mediaUrl: row.media_url,
                relativePath: row.relative_path,
                mediaType: row.media_type,
                createdAt: row.created_at,
                exists,
            };
        });
    }
    uninstallStoreWallpaper(key) {
        const db = this.ensureThemeTable();
        const row = db
            .prepare("SELECT relative_path FROM theme_wallpapers WHERE key = ? AND source = 'store' LIMIT 1")
            .get(key);
        if (!row)
            return false;
        const absolutePath = this.resolveRelativePathToAbsolute(row.relative_path);
        try {
            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
            }
        }
        catch {
            // ignore file deletion errors and still cleanup DB row
        }
        db.prepare("DELETE FROM theme_wallpapers WHERE key = ? AND source = 'store'").run(key);
        return true;
    }
}
