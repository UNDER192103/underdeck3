import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { EventEmitter } from "node:events";
import convert from "xml-js";
import electron from "electron";
import { Settings } from "./settings.js";
const { app: electronApp } = electron;
export class SoundPadService extends EventEmitter {
    watcher = null;
    watcherRetryTimer = null;
    watcherDebounceTimer = null;
    constructor() {
        super();
        this.ensureLeppsoftWatcher();
    }
    getSettings() {
        return Settings.get("soundpad") ?? {};
    }
    getLeppsoftDirectory() {
        return path.join(process.env.APPDATA || electronApp.getPath("appData"), "Leppsoft");
    }
    getSoundListFilePath() {
        return path.join(this.getLeppsoftDirectory(), "soundlist.spl");
    }
    isSoundPadExePath(filePath) {
        return path.basename(filePath || "").toLowerCase() === "soundpad.exe";
    }
    emitAudiosChangedDebounced() {
        if (this.watcherDebounceTimer) {
            clearTimeout(this.watcherDebounceTimer);
        }
        this.watcherDebounceTimer = setTimeout(() => {
            this.emit("audios-changed");
        }, 250);
    }
    scheduleWatcherRetry() {
        if (this.watcherRetryTimer)
            return;
        this.watcherRetryTimer = setTimeout(() => {
            this.watcherRetryTimer = null;
            this.ensureLeppsoftWatcher();
        }, 5000);
    }
    ensureLeppsoftWatcher() {
        if (this.watcher)
            return;
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
            });
        }
        catch {
            this.disposeWatcher();
            this.scheduleWatcherRetry();
        }
    }
    disposeWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.watcherDebounceTimer) {
            clearTimeout(this.watcherDebounceTimer);
            this.watcherDebounceTimer = null;
        }
    }
    getPath() {
        return (this.getSettings().path ?? "").trim();
    }
    setPath(filePath) {
        const normalized = (filePath ?? "").trim();
        if (!this.isSoundPadExePath(normalized))
            return false;
        Settings.set("soundpad", { ...this.getSettings(), path: normalized });
        return true;
    }
    verify() {
        const savedPath = this.getPath();
        if (!savedPath || !this.isSoundPadExePath(savedPath)) {
            return Promise.resolve({ ok: false, message: "Caminho invalido do SoundPad." });
        }
        return new Promise((resolve) => {
            exec(`"${savedPath}" -v`, (error) => {
                if (error == null) {
                    resolve({ ok: true, message: "SoundPad validado com sucesso." });
                    return;
                }
                resolve({ ok: false, message: "Falha ao validar SoundPad com -v." });
            });
        });
    }
    async listAudios() {
        this.ensureLeppsoftWatcher();
        const filePath = this.getSoundListFilePath();
        try {
            if (!fs.existsSync(filePath))
                return [];
            const xml = fs.readFileSync(filePath, "utf8");
            const jsonText = convert.xml2json(xml, { compact: true, spaces: 0 });
            const parsed = JSON.parse(jsonText);
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
        }
        catch {
            return [];
        }
    }
    executeRawCommand(command) {
        const savedPath = this.getPath();
        if (!savedPath || !this.isSoundPadExePath(savedPath)) {
            return Promise.resolve({ ok: false, message: "Caminho invalido do SoundPad." });
        }
        return new Promise((resolve) => {
            exec(`"${savedPath}" -rc ${command}`, (error) => {
                if (error == null) {
                    resolve({ ok: true, message: "Comando executado com sucesso." });
                    return;
                }
                resolve({ ok: false, message: "Falha ao executar comando do SoundPad." });
            });
        });
    }
    executeCommand(command) {
        const normalized = (command ?? "").trim();
        if (!normalized) {
            return Promise.resolve({ ok: false, message: "Comando invalido." });
        }
        return this.executeRawCommand(normalized);
    }
    repeatCurrentSound() {
        return this.executeRawCommand("DoPlayCurrentSoundAgain()");
    }
    stopSound() {
        return this.executeRawCommand("DoStopSound()");
    }
    togglePause() {
        return this.executeRawCommand("DoTogglePause()");
    }
    playSound(index) {
        if (!Number.isFinite(index) || index <= 0) {
            return Promise.resolve({ ok: false, message: "Indice de audio invalido." });
        }
        return this.executeRawCommand(`DoPlaySound(${Math.trunc(index)})`);
    }
    stop() {
        this.disposeWatcher();
        if (this.watcherRetryTimer) {
            clearTimeout(this.watcherRetryTimer);
            this.watcherRetryTimer = null;
        }
    }
}
