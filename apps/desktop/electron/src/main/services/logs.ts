import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import { Settings } from "./settings.js";

const { app, shell } = electron;

export type LogsSettings = {
    enabled: boolean;
    app: boolean;
    shortcuts: boolean;
    obs: boolean;
    soundpad: boolean;
    webdeck: boolean;
    webpages: boolean;
    socket: boolean;
    updates: boolean;
};

export type LogCategory = Exclude<keyof LogsSettings, "enabled">;
export type LogLevel = "info" | "warn" | "error";

const DEFAULT_SETTINGS: LogsSettings = {
    enabled: false,
    app: false,
    shortcuts: false,
    obs: false,
    soundpad: false,
    webdeck: false,
    webpages: false,
    socket: false,
    updates: false,
};

const resolveSettings = (value: unknown): LogsSettings => {
    if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
    const source = value as Partial<LogsSettings>;
    return {
        enabled: Boolean(source.enabled),
        app: Boolean(source.app),
        shortcuts: Boolean(source.shortcuts),
        obs: Boolean(source.obs),
        soundpad: Boolean(source.soundpad),
        webdeck: Boolean(source.webdeck),
        webpages: Boolean(source.webpages),
        socket: Boolean(source.socket),
        updates: Boolean(source.updates),
    };
};

const safeStringify = (value: unknown) => {
    if (value === undefined) return "";
    try {
        return JSON.stringify(value);
    } catch {
        try {
            return JSON.stringify(String(value));
        } catch {
            return "";
        }
    }
};

export class LogsService {
    getSettings(): LogsSettings {
        return resolveSettings(Settings.get("logs"));
    }

    updateSettings(patch: Partial<LogsSettings>): LogsSettings {
        const current = this.getSettings();
        const next = resolveSettings({ ...current, ...patch });
        Settings.set("logs", next);
        return next;
    }

    isEnabled(category: LogCategory) {
        const settings = this.getSettings();
        return settings.enabled && Boolean(settings[category]);
    }

    getLogsRoot() {
        const baseFolder = Settings.get("storage").baseFolder || "underdeck";
        return path.join(app.getPath("userData"), baseFolder, "logs");
    }

    getLogFilePath(category: LogCategory) {
        return path.join(this.getLogsRoot(), `${category}.log`);
    }

    log(category: LogCategory, message: string, data?: unknown, level: LogLevel = "info") {
        if (!this.isEnabled(category)) return;
        const targetDir = this.getLogsRoot();
        try {
            fs.mkdirSync(targetDir, { recursive: true });
            const entry = {
                ts: new Date().toISOString(),
                level,
                message: String(message || ""),
                data,
            };
            const line = `${entry.ts} [${entry.level}] ${entry.message}${data !== undefined ? ` ${safeStringify(data)}` : ""}\n`;
            fs.appendFileSync(this.getLogFilePath(category), line, "utf8");
        } catch {
            // ignore logging failures
        }
    }

    openLogFile(category: LogCategory) {
        const filePath = this.getLogFilePath(category);
        try {
            fs.mkdirSync(this.getLogsRoot(), { recursive: true });
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, "", "utf8");
            }
            shell.showItemInFolder(filePath);
            return true;
        } catch {
            return false;
        }
    }

    clearLogFile(category: LogCategory) {
        const filePath = this.getLogFilePath(category);
        try {
            fs.writeFileSync(filePath, "", "utf8");
            return true;
        } catch {
            return false;
        }
    }

    clearLogs() {
        try {
            fs.rmSync(this.getLogsRoot(), { recursive: true });
            return true;
        } catch {
            return false;
        }
    }
}

export const logsService = new LogsService();
