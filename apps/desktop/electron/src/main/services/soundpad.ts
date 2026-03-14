import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { EventEmitter } from "node:events";
import convert from "xml-js";
import electron from "electron";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";

const { app: electronApp } = electron;

type SoundPadSettings = {
    path?: string;
};

export type SoundPadAudio = {
    index: number;
    addedOn: string;
    artist: string;
    name: string;
    duration: string;
    hash: string;
    path: string;
};

export type SoundPadVerifyResult = {
    ok: boolean;
    message: string;
};

export type SoundPadExecResult = {
    ok: boolean;
    message: string;
};

export class SoundPadService extends EventEmitter {
    private watcher: fs.FSWatcher | null = null;
    private watcherRetryTimer: NodeJS.Timeout | null = null;
    private watcherDebounceTimer: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.ensureLeppsoftWatcher();
    }

    private getSettings() {
        return (Settings.get("soundpad") as SoundPadSettings | undefined) ?? {};
    }

    private getLeppsoftDirectory() {
        return path.join(process.env.APPDATA || electronApp.getPath("appData"), "Leppsoft");
    }

    private getSoundListFilePath() {
        return path.join(this.getLeppsoftDirectory(), "soundlist.spl");
    }

    private isSoundPadExePath(filePath: string) {
        return path.basename(filePath || "").toLowerCase() === "soundpad.exe";
    }

    private emitAudiosChangedDebounced() {
        if (this.watcherDebounceTimer) {
            clearTimeout(this.watcherDebounceTimer);
        }
        this.watcherDebounceTimer = setTimeout(() => {
            this.emit("audios-changed");
        }, 250);
    }

    private scheduleWatcherRetry() {
        if (this.watcherRetryTimer) return;
        this.watcherRetryTimer = setTimeout(() => {
            this.watcherRetryTimer = null;
            this.ensureLeppsoftWatcher();
        }, 5000);
    }

    private ensureLeppsoftWatcher() {
        if (this.watcher) return;

        const targetDir = this.getLeppsoftDirectory();
        if (!fs.existsSync(targetDir)) {
            this.scheduleWatcherRetry();
            return;
        }

        try {
            this.watcher = fs.watch(targetDir, (_event, fileName) => {
                const name = String(fileName ?? "").toLowerCase();
                if (name === "soundlist.spl" || name.length === 0) {
                    this.emitAudiosChangedDebounced();
                }
            });

            this.watcher.on("error", () => {
                this.disposeWatcher();
                this.scheduleWatcherRetry();
                logsService.log("soundpad", "watcher.error", { dir: targetDir }, "error");
            });
        } catch {
            this.disposeWatcher();
            this.scheduleWatcherRetry();
            logsService.log("soundpad", "watcher.error", { dir: targetDir }, "error");
        }
    }

    private disposeWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.watcherDebounceTimer) {
            clearTimeout(this.watcherDebounceTimer);
            this.watcherDebounceTimer = null;
        }
    }

    public getPath() {
        return (this.getSettings().path ?? "").trim();
    }

    public setPath(filePath: string) {
        const normalized = (filePath ?? "").trim();
        if (!this.isSoundPadExePath(normalized)) return false;
        Settings.set("soundpad", { ...this.getSettings(), path: normalized });
        return true;
    }

    public verify(): Promise<SoundPadVerifyResult> {
        const savedPath = this.getPath();
        if (!savedPath || !this.isSoundPadExePath(savedPath)) {
            logsService.log("soundpad", "verify.invalid_path", { path: savedPath }, "warn");
            return Promise.resolve({ ok: false, message: "Caminho invalido do SoundPad." });
        }
        return new Promise((resolve) => {
            exec(`"${savedPath}" -v`, (error) => {
                if (error == null) {
                    logsService.log("soundpad", "verify.success", { path: savedPath });
                    resolve({ ok: true, message: "SoundPad validado com sucesso." });
                    return;
                }
                logsService.log("soundpad", "verify.error", { path: savedPath }, "error");
                resolve({ ok: false, message: "Falha ao validar SoundPad com -v." });
            });
        });
    }

    public async listAudios(): Promise<SoundPadAudio[]> {
        this.ensureLeppsoftWatcher();
        const filePath = this.getSoundListFilePath();
        try {
            if (!fs.existsSync(filePath)) return [];

            const xml = fs.readFileSync(filePath, "utf8");
            const jsonText = convert.xml2json(xml, { compact: true, spaces: 0 });
            const parsed = JSON.parse(jsonText) as {
                Soundlist?: {
                    Sound?: Array<{ _attributes?: Record<string, string> }> | { _attributes?: Record<string, string> };
                };
            };

            const rawList = parsed?.Soundlist?.Sound;
            const items = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];

            return items.map((sound, idx) => {
                const attrs = sound?._attributes ?? {};
                return {
                    index: idx + 1,
                    addedOn: attrs.addedOn ?? "",
                    artist: attrs.artist ?? "",
                    name: attrs.title ?? "",
                    duration: attrs.duration ?? "",
                    hash: attrs.hash ?? "",
                    path: attrs.url ?? "",
                };
            });
        } catch {
            return [];
        }
    }

    private executeRawCommand(command: string): Promise<SoundPadExecResult> {
        const savedPath = this.getPath();
        if (!savedPath || !this.isSoundPadExePath(savedPath)) {
            logsService.log("soundpad", "command.invalid_path", { path: savedPath }, "warn");
            return Promise.resolve({ ok: false, message: "Caminho invalido do SoundPad." });
        }
        return new Promise((resolve) => {
            exec(`"${savedPath}" -rc ${command}`, (error) => {
                if (error == null) {
                    logsService.log("soundpad", "command.success", { command });
                    resolve({ ok: true, message: "Comando executado com sucesso." });
                    return;
                }
                logsService.log("soundpad", "command.error", { command }, "error");
                resolve({ ok: false, message: "Falha ao executar comando do SoundPad." });
            });
        });
    }

    public executeCommand(command: string) {
        const normalized = (command ?? "").trim();
        if (!normalized) {
            return Promise.resolve({ ok: false, message: "Comando invalido." });
        }
        return this.executeRawCommand(normalized);
    }

    public repeatCurrentSound() {
        return this.executeRawCommand("DoPlayCurrentSoundAgain()");
    }

    public stopSound() {
        return this.executeRawCommand("DoStopSound()");
    }

    public togglePause() {
        return this.executeRawCommand("DoTogglePause()");
    }

    public playSound(index: number) {
        if (!Number.isFinite(index) || index <= 0) {
            return Promise.resolve({ ok: false, message: "Indice de audio invalido." });
        }
        return this.executeRawCommand(`DoPlaySound(${Math.trunc(index)})`);
    }

    public stop() {
        this.disposeWatcher();
        if (this.watcherRetryTimer) {
            clearTimeout(this.watcherRetryTimer);
            this.watcherRetryTimer = null;
        }
    }
}
