import electron from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import EventEmitter from "node:events";
import { getDb } from "./database.js";
import { Settings } from "./settings.js";
const { app: electronApp } = electron;
export class WebDeckService extends EventEmitter {
    static DEFAULT_COLS = 5;
    static DEFAULT_ROWS = 3;
    constructor() {
        super();
    }
    getDatabase() {
        const db = getDb("webdeck");
        db.prepare(`
            CREATE TABLE IF NOT EXISTS webdeck_pages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT,
                grid_cols INTEGER NOT NULL DEFAULT 5,
                grid_rows INTEGER NOT NULL DEFAULT 3,
                items_json TEXT NOT NULL DEFAULT '[]',
                position INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `).run();
        db.prepare(`
            CREATE TABLE IF NOT EXISTS webdeck_auto_icons (
                kind TEXT NOT NULL,
                icon_key TEXT NOT NULL,
                icon TEXT,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (kind, icon_key)
            )
        `).run();
        return db;
    }
    getStorageRootPath() {
        return path.join(electronApp.getPath("userData"), Settings.get("storage").baseFolder);
    }
    getIconFolder() {
        const folder = path.join(this.getStorageRootPath(), "webdeck-pages-icons");
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }
    getItemIconFolder() {
        const folder = path.join(this.getStorageRootPath(), "webdeck-items-icons");
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }
    getAutoPageIconFolder() {
        const folder = path.join(this.getStorageRootPath(), "webdeck-auto-pages-icons");
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }
    getAutoItemIconFolder() {
        const folder = path.join(this.getStorageRootPath(), "webdeck-auto-items-icons");
        fs.mkdirSync(folder, { recursive: true });
        return folder;
    }
    sanitizeKeyForFileName(value) {
        return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
    }
    toRelativeStoragePath(absolutePath) {
        const root = this.getStorageRootPath();
        return path.relative(root, absolutePath).split(path.sep).join("/");
    }
    toMediaUrlFromRelativePath(relativePath) {
        return `underdeck-media://${relativePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }
    resolveMediaUrlToAbsolutePath(mediaUrl) {
        try {
            const url = new URL(mediaUrl);
            if (url.protocol !== "underdeck-media:")
                return null;
            const rawPath = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/^\/+/, "");
            const absolute = path.normalize(path.join(this.getStorageRootPath(), rawPath));
            const root = path.normalize(this.getStorageRootPath());
            if (!absolute.startsWith(root))
                return null;
            return absolute;
        }
        catch {
            return null;
        }
    }
    normalizeIconSource(iconSource) {
        if (!iconSource)
            return null;
        const value = String(iconSource).trim();
        return value || null;
    }
    savePageIcon(pageId, iconSource) {
        const source = this.normalizeIconSource(iconSource);
        if (!source)
            return null;
        if (source.startsWith("underdeck-media://"))
            return source;
        const normalizedSource = source.replace(/^file:\/\//i, "");
        if (!fs.existsSync(normalizedSource))
            return null;
        const iconFolder = this.getIconFolder();
        const extension = path.extname(normalizedSource).toLowerCase() || ".png";
        const targetPath = path.join(iconFolder, `${pageId}${extension}`);
        // Remove stale icon files with different extensions.
        const staleCandidates = fs.readdirSync(iconFolder).filter((fileName) => fileName.startsWith(`${pageId}.`) && fileName !== `${pageId}${extension}`);
        staleCandidates.forEach((fileName) => {
            try {
                fs.unlinkSync(path.join(iconFolder, fileName));
            }
            catch {
                // ignore unlink errors
            }
        });
        fs.copyFileSync(normalizedSource, targetPath);
        const relativePath = this.toRelativeStoragePath(targetPath);
        return this.toMediaUrlFromRelativePath(relativePath);
    }
    saveItemIcon(itemId, iconSource) {
        const source = this.normalizeIconSource(iconSource);
        if (!source)
            return null;
        if (source.startsWith("underdeck-media://"))
            return source;
        const normalizedSource = source.replace(/^file:\/\//i, "");
        if (!fs.existsSync(normalizedSource))
            return null;
        const iconFolder = this.getItemIconFolder();
        const extension = path.extname(normalizedSource).toLowerCase() || ".png";
        const targetPath = path.join(iconFolder, `${itemId}${extension}`);
        // Remove stale icon files with different extensions for the same item id.
        const staleCandidates = fs
            .readdirSync(iconFolder)
            .filter((fileName) => fileName.startsWith(`${itemId}.`) && fileName !== `${itemId}${extension}`);
        staleCandidates.forEach((fileName) => {
            try {
                fs.unlinkSync(path.join(iconFolder, fileName));
            }
            catch {
                // ignore unlink errors
            }
        });
        fs.copyFileSync(normalizedSource, targetPath);
        const relativePath = this.toRelativeStoragePath(targetPath);
        return this.toMediaUrlFromRelativePath(relativePath);
    }
    deleteIconIfLocal(icon) {
        if (!icon)
            return;
        if (!icon.startsWith("underdeck-media://"))
            return;
        const absolutePath = this.resolveMediaUrlToAbsolutePath(icon);
        if (!absolutePath)
            return;
        if (!fs.existsSync(absolutePath))
            return;
        try {
            fs.unlinkSync(absolutePath);
        }
        catch {
            // ignore unlink errors
        }
    }
    hasItemIconReference(icon) {
        if (!icon)
            return false;
        const db = this.getDatabase();
        const rows = db.prepare("SELECT items_json FROM webdeck_pages").all();
        for (const row of rows) {
            let items = [];
            try {
                items = JSON.parse(row.items_json ?? "[]");
            }
            catch {
                items = [];
            }
            const found = items.some((item) => item?.icon === icon);
            if (found)
                return true;
        }
        return false;
    }
    deleteItemIconIfUnreferenced(icon) {
        if (!icon)
            return;
        if (this.hasItemIconReference(icon))
            return;
        this.deleteIconIfLocal(icon);
    }
    saveAutoIcon(kind, iconKey, iconSource) {
        const source = this.normalizeIconSource(iconSource);
        if (!source)
            return null;
        if (source.startsWith("underdeck-media://"))
            return source;
        const normalizedSource = source.replace(/^file:\/\//i, "");
        if (!fs.existsSync(normalizedSource))
            return null;
        const iconFolder = kind === "page" ? this.getAutoPageIconFolder() : this.getAutoItemIconFolder();
        const safeKey = this.sanitizeKeyForFileName(iconKey);
        const extension = path.extname(normalizedSource).toLowerCase() || ".png";
        const targetPath = path.join(iconFolder, `${safeKey}${extension}`);
        const staleCandidates = fs
            .readdirSync(iconFolder)
            .filter((fileName) => fileName.startsWith(`${safeKey}.`) && fileName !== `${safeKey}${extension}`);
        staleCandidates.forEach((fileName) => {
            try {
                fs.unlinkSync(path.join(iconFolder, fileName));
            }
            catch {
                // ignore unlink errors
            }
        });
        fs.copyFileSync(normalizedSource, targetPath);
        const relativePath = this.toRelativeStoragePath(targetPath);
        return this.toMediaUrlFromRelativePath(relativePath);
    }
    hasAutoIconReference(kind, icon) {
        if (!icon)
            return false;
        const db = this.getDatabase();
        const row = db
            .prepare("SELECT COUNT(*) as total FROM webdeck_auto_icons WHERE kind = ? AND icon = ?")
            .get(kind, icon);
        return Number(row?.total ?? 0) > 0;
    }
    deleteAutoIconIfUnreferenced(kind, icon) {
        if (!icon)
            return;
        if (this.hasAutoIconReference(kind, icon))
            return;
        this.deleteIconIfLocal(icon);
    }
    safeGridValue(value, fallback) {
        if (!Number.isFinite(value))
            return fallback;
        const safe = Math.trunc(value);
        if (safe < 2)
            return fallback;
        return Math.min(safe, 20);
    }
    normalizeItems(rawItems, slots) {
        const items = Array.isArray(rawItems) ? rawItems : [];
        const normalized = new Array(slots).fill(null);
        for (let i = 0; i < Math.min(items.length, slots); i += 1) {
            const item = items[i];
            if (!item || typeof item !== "object")
                continue;
            const type = String(item.type ?? "").toLowerCase();
            if (type !== "back" && type !== "page" && type !== "app" && type !== "soundpad" && type !== "obs")
                continue;
            const refId = String(item.refId ?? "").trim();
            if (type !== "back" && !refId)
                continue;
            normalized[i] = {
                id: String(item.id ?? randomUUID()),
                type,
                refId: type === "back" ? refId : refId,
                label: String(item.label ?? "").trim() || undefined,
                icon: item.icon ? String(item.icon) : null,
            };
        }
        return normalized;
    }
    mapRowToPage(row) {
        const gridCols = this.safeGridValue(Number(row.grid_cols), WebDeckService.DEFAULT_COLS);
        const gridRows = this.safeGridValue(Number(row.grid_rows), WebDeckService.DEFAULT_ROWS);
        const slots = gridCols * gridRows;
        const parsedItems = (() => {
            try {
                return JSON.parse(row.items_json ?? "[]");
            }
            catch {
                return [];
            }
        })();
        return {
            id: String(row.id),
            name: String(row.name ?? "Nova Pagina"),
            icon: row.icon ? String(row.icon) : null,
            gridCols,
            gridRows,
            items: this.normalizeItems(parsedItems, slots),
            position: Number.isFinite(row.position) ? Number(row.position) : 0,
            createdAt: Number(row.created_at ?? 0),
            updatedAt: Number(row.updated_at ?? 0),
        };
    }
    persistPage(page) {
        const db = this.getDatabase();
        db.prepare(`
            UPDATE webdeck_pages
            SET
                name = ?,
                icon = ?,
                grid_cols = ?,
                grid_rows = ?,
                items_json = ?,
                position = ?,
                updated_at = ?
            WHERE id = ?
        `).run(page.name, page.icon, page.gridCols, page.gridRows, JSON.stringify(page.items), page.position, Date.now(), page.id);
    }
    hasBackItem(page) {
        return page.items.some((item) => item?.type === "back");
    }
    removeBackItems(page) {
        const nextItems = page.items.map((item) => (item?.type === "back" ? null : item));
        return { ...page, items: nextItems };
    }
    ensureBackItem(page) {
        if (this.hasBackItem(page))
            return page;
        const nextItems = [...page.items];
        const emptyIndex = nextItems.findIndex((item) => item == null);
        const targetIndex = emptyIndex >= 0 ? emptyIndex : 0;
        nextItems[targetIndex] = {
            id: randomUUID(),
            type: "back",
            refId: "",
            label: "Voltar",
            icon: null,
        };
        return { ...page, items: nextItems };
    }
    normalizeBackReference(page, firstPageId, isFirstPage) {
        if (isFirstPage)
            return page;
        if (!firstPageId)
            return page;
        let changed = false;
        const nextItems = page.items.map((item) => {
            if (!item)
                return item;
            if (item.type !== "back")
                return item;
            if (item.refId && item.refId.trim())
                return item;
            changed = true;
            return { ...item, refId: firstPageId };
        });
        if (!changed)
            return page;
        return { ...page, items: nextItems };
    }
    getFirstPageId() {
        const db = this.getDatabase();
        const row = db
            .prepare("SELECT id FROM webdeck_pages ORDER BY position ASC, created_at ASC LIMIT 1")
            .get();
        return row?.id ?? null;
    }
    applyBackRulesForPage(page, firstPageId) {
        if (!firstPageId)
            return page;
        const isFirstPage = page.id === firstPageId;
        if (isFirstPage) {
            return this.removeBackItems(page);
        }
        let safePage = this.ensureBackItem(page);
        safePage = this.normalizeBackReference(safePage, firstPageId, false);
        return safePage;
    }
    ensureBootstrapPage() {
        const db = this.getDatabase();
        const countRow = db.prepare("SELECT COUNT(*) as total FROM webdeck_pages").get();
        if (countRow.total > 0)
            return;
        const now = Date.now();
        const pageId = randomUUID();
        const slots = WebDeckService.DEFAULT_COLS * WebDeckService.DEFAULT_ROWS;
        db.prepare(`
            INSERT INTO webdeck_pages (id, name, icon, grid_cols, grid_rows, items_json, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pageId, "Pagina Inicial", null, WebDeckService.DEFAULT_COLS, WebDeckService.DEFAULT_ROWS, JSON.stringify(new Array(slots).fill(null)), 0, now, now);
    }
    listPages() {
        this.ensureBootstrapPage();
        const db = this.getDatabase();
        const rows = db.prepare("SELECT * FROM webdeck_pages ORDER BY position ASC, created_at ASC").all();
        const pages = rows.map((row) => this.mapRowToPage(row));
        const firstPageId = pages[0]?.id ?? null;
        return pages.map((page, index) => {
            const safePage = this.applyBackRulesForPage(page, firstPageId);
            if (JSON.stringify(safePage.items) !== JSON.stringify(page.items)) {
                this.persistPage({ ...safePage, updatedAt: Date.now() });
            }
            return safePage;
        });
    }
    createPage(payload) {
        const db = this.getDatabase();
        const now = Date.now();
        const maxPositionRow = db.prepare("SELECT MAX(position) as max_position FROM webdeck_pages").get();
        const id = randomUUID();
        const name = String(payload.name ?? "").trim() || "Nova Pagina";
        const gridCols = this.safeGridValue(Number(payload.gridCols), WebDeckService.DEFAULT_COLS);
        const gridRows = this.safeGridValue(Number(payload.gridRows), WebDeckService.DEFAULT_ROWS);
        const icon = this.savePageIcon(id, payload.iconSource ?? null);
        const slots = gridCols * gridRows;
        const position = (maxPositionRow.max_position ?? -1) + 1;
        db.prepare(`
            INSERT INTO webdeck_pages (id, name, icon, grid_cols, grid_rows, items_json, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, icon, gridCols, gridRows, JSON.stringify(new Array(slots).fill(null)), position, now, now);
        const firstPageId = this.getFirstPageId();
        if (firstPageId && firstPageId !== id) {
            this.upsertItem(id, 0, { type: "back", refId: firstPageId, label: "Voltar" });
        }
        this.emit("pages-changed");
        return this.findPage(id);
    }
    findPage(id) {
        const db = this.getDatabase();
        const row = db.prepare("SELECT * FROM webdeck_pages WHERE id = ?").get(id);
        if (!row)
            return null;
        const page = this.mapRowToPage(row);
        const firstPageId = this.getFirstPageId();
        const safePage = this.applyBackRulesForPage(page, firstPageId);
        if (JSON.stringify(safePage.items) !== JSON.stringify(page.items)) {
            this.persistPage({ ...safePage, updatedAt: Date.now() });
        }
        return safePage;
    }
    updatePage(payload) {
        const current = this.findPage(payload.id);
        if (!current)
            return null;
        const nextName = payload.name !== undefined ? (String(payload.name).trim() || current.name) : current.name;
        let nextIcon = current.icon;
        if (payload.iconSource !== undefined) {
            if (payload.iconSource === null || String(payload.iconSource).trim() === "") {
                nextIcon = null;
            }
            else {
                const savedIcon = this.savePageIcon(current.id, payload.iconSource);
                nextIcon = savedIcon ?? current.icon;
            }
        }
        this.persistPage({
            ...current,
            name: nextName,
            icon: nextIcon,
            updatedAt: Date.now(),
        });
        if (payload.iconSource !== undefined && current.icon !== nextIcon) {
            this.deleteIconIfLocal(current.icon);
        }
        this.emit("pages-changed");
        return this.findPage(current.id);
    }
    deletePage(id) {
        const current = this.findPage(id);
        if (!current)
            return false;
        const db = this.getDatabase();
        db.prepare("DELETE FROM webdeck_pages WHERE id = ?").run(id);
        this.deleteIconIfLocal(current.icon);
        current.items.forEach((item) => {
            this.deleteItemIconIfUnreferenced(item?.icon ?? null);
        });
        // Remove links from other pages that referenced deleted page.
        const pages = this.listPages();
        pages.forEach((page) => {
            let changed = false;
            const nextItems = page.items.map((item) => {
                if (!item)
                    return item;
                if (item.type === "page" && item.refId === id) {
                    changed = true;
                    return null;
                }
                if (item.type === "back" && item.refId === id) {
                    changed = true;
                    return { ...item, refId: "" };
                }
                return item;
            });
            if (changed) {
                const safePage = this.ensureBackItem({ ...page, items: nextItems });
                this.persistPage({ ...safePage, updatedAt: Date.now() });
            }
        });
        const remaining = this.listPages();
        if (remaining.length === 0) {
            this.ensureBootstrapPage();
        }
        this.emit("pages-changed");
        return true;
    }
    setGrid(pageId, gridCols, gridRows) {
        const current = this.findPage(pageId);
        if (!current)
            return null;
        const nextCols = this.safeGridValue(gridCols, current.gridCols);
        const nextRows = this.safeGridValue(gridRows, current.gridRows);
        const nextSlots = nextCols * nextRows;
        const nextItems = new Array(nextSlots).fill(null).map((_, idx) => current.items[idx] ?? null);
        const overflowItems = current.items.slice(nextSlots).filter((item) => Boolean(item));
        // Try to keep overflow items by moving them into free slots in the resized grid.
        if (overflowItems.length > 0) {
            for (const overflowItem of overflowItems) {
                const freeIndex = nextItems.findIndex((item) => item == null);
                if (freeIndex < 0)
                    break;
                nextItems[freeIndex] = overflowItem;
            }
        }
        const removedItems = overflowItems.filter((item) => !nextItems.some((existing) => existing?.id === item.id));
        this.persistPage({
            ...current,
            gridCols: nextCols,
            gridRows: nextRows,
            items: nextItems,
            updatedAt: Date.now(),
        });
        removedItems.forEach((item) => {
            this.deleteItemIconIfUnreferenced(item?.icon ?? null);
        });
        this.emit("pages-changed");
        return this.findPage(pageId);
    }
    upsertItem(pageId, index, item) {
        const current = this.findPage(pageId);
        if (!current)
            return null;
        const safeIndex = Math.trunc(index);
        if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= current.items.length)
            return null;
        const type = String(item.type ?? "").toLowerCase();
        if (type !== "back" && type !== "page" && type !== "app" && type !== "soundpad" && type !== "obs")
            return null;
        const refId = String(item.refId ?? "").trim();
        if (type !== "back" && !refId)
            return null;
        const currentItem = current.items[safeIndex];
        const itemId = item.id ? String(item.id) : (current.items[safeIndex]?.id ?? randomUUID());
        const requestedIcon = this.normalizeIconSource(item.icon);
        const persistedIcon = requestedIcon === null
            ? null
            : this.saveItemIcon(itemId, requestedIcon);
        const nextItems = [...current.items];
        nextItems[safeIndex] = {
            id: itemId,
            type,
            refId: type === "back" ? refId : refId,
            label: item.label ? String(item.label).trim() : undefined,
            icon: persistedIcon ?? null,
        };
        const safePage = this.applyBackRulesForPage({ ...current, items: nextItems }, this.getFirstPageId());
        this.persistPage({ ...safePage, updatedAt: Date.now() });
        this.deleteItemIconIfUnreferenced(currentItem?.icon ?? null);
        this.emit("pages-changed");
        return this.findPage(pageId);
    }
    removeItem(pageId, index) {
        const current = this.findPage(pageId);
        if (!current)
            return null;
        const safeIndex = Math.trunc(index);
        if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= current.items.length)
            return null;
        const nextItems = [...current.items];
        const removingItem = nextItems[safeIndex];
        if (removingItem?.type === "back") {
            const totalBack = nextItems.filter((item) => item?.type === "back").length;
            if (totalBack <= 1)
                return null;
        }
        nextItems[safeIndex] = null;
        const safePage = this.applyBackRulesForPage({ ...current, items: nextItems }, this.getFirstPageId());
        this.persistPage({ ...safePage, updatedAt: Date.now() });
        this.deleteItemIconIfUnreferenced(removingItem?.icon ?? null);
        this.emit("pages-changed");
        return this.findPage(pageId);
    }
    moveItem(pageId, fromIndex, toIndex) {
        const current = this.findPage(pageId);
        if (!current)
            return null;
        const from = Math.trunc(fromIndex);
        const to = Math.trunc(toIndex);
        if (!Number.isFinite(from) || !Number.isFinite(to))
            return null;
        if (from < 0 || from >= current.items.length)
            return null;
        if (to < 0 || to >= current.items.length)
            return null;
        if (from === to)
            return current;
        const sourceItem = current.items[from];
        if (!sourceItem)
            return null;
        const nextItems = [...current.items];
        const targetItem = nextItems[to];
        nextItems[to] = sourceItem;
        nextItems[from] = targetItem ?? null;
        const safePage = this.applyBackRulesForPage({ ...current, items: nextItems }, this.getFirstPageId());
        this.persistPage({ ...safePage, updatedAt: Date.now() });
        this.emit("pages-changed");
        return this.findPage(pageId);
    }
    listAutoIcons() {
        const db = this.getDatabase();
        const rows = db
            .prepare("SELECT kind, icon_key, icon FROM webdeck_auto_icons")
            .all();
        const pages = {};
        const items = {};
        for (const row of rows) {
            const key = String(row.icon_key ?? "").trim();
            const icon = row.icon ? String(row.icon) : "";
            if (!key || !icon)
                continue;
            if (row.kind === "page") {
                pages[key] = icon;
            }
            else if (row.kind === "item") {
                items[key] = icon;
            }
        }
        return { pages, items };
    }
    setAutoPageIcon(rootId, iconSource) {
        const key = String(rootId ?? "").trim();
        if (!key)
            return this.listAutoIcons();
        const db = this.getDatabase();
        const current = db
            .prepare("SELECT icon FROM webdeck_auto_icons WHERE kind = ? AND icon_key = ? LIMIT 1")
            .get("page", key);
        const source = this.normalizeIconSource(iconSource);
        if (!source) {
            db.prepare("DELETE FROM webdeck_auto_icons WHERE kind = ? AND icon_key = ?").run("page", key);
            this.deleteAutoIconIfUnreferenced("page", current?.icon ?? null);
            this.emit("pages-changed");
            return this.listAutoIcons();
        }
        const nextIcon = this.saveAutoIcon("page", key, source) ?? source;
        db.prepare(`
            INSERT INTO webdeck_auto_icons (kind, icon_key, icon, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(kind, icon_key) DO UPDATE SET
                icon = excluded.icon,
                updated_at = excluded.updated_at
        `).run("page", key, nextIcon, Date.now());
        if (current?.icon && current.icon !== nextIcon) {
            this.deleteAutoIconIfUnreferenced("page", current.icon);
        }
        this.emit("pages-changed");
        return this.listAutoIcons();
    }
    setAutoItemIcon(itemKey, iconSource) {
        const key = String(itemKey ?? "").trim();
        if (!key)
            return this.listAutoIcons();
        const db = this.getDatabase();
        const current = db
            .prepare("SELECT icon FROM webdeck_auto_icons WHERE kind = ? AND icon_key = ? LIMIT 1")
            .get("item", key);
        const source = this.normalizeIconSource(iconSource);
        if (!source) {
            db.prepare("DELETE FROM webdeck_auto_icons WHERE kind = ? AND icon_key = ?").run("item", key);
            this.deleteAutoIconIfUnreferenced("item", current?.icon ?? null);
            this.emit("pages-changed");
            return this.listAutoIcons();
        }
        const nextIcon = this.saveAutoIcon("item", key, source) ?? source;
        db.prepare(`
            INSERT INTO webdeck_auto_icons (kind, icon_key, icon, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(kind, icon_key) DO UPDATE SET
                icon = excluded.icon,
                updated_at = excluded.updated_at
        `).run("item", key, nextIcon, Date.now());
        if (current?.icon && current.icon !== nextIcon) {
            this.deleteAutoIconIfUnreferenced("item", current.icon);
        }
        this.emit("pages-changed");
        return this.listAutoIcons();
    }
}
