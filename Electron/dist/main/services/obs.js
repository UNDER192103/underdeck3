import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import electron from "electron";
import OBSWebSocket from "obs-websocket-js";
import { Settings } from "./settings.js";
const { app: electronApp } = electron;
const OBS_DEFAULT_SETTINGS = {
    connectOnStartup: false,
    autoDetect: true,
    host: "127.0.0.1",
    port: 4455,
    password: "",
};
export class ObsService extends EventEmitter {
    socket;
    connected = false;
    connecting = false;
    streamActive = false;
    recordActive = false;
    recordPaused = false;
    currentProgramSceneName = "";
    scenes = [];
    audioInputs = [];
    lastError = null;
    refreshTimer = null;
    constructor() {
        super();
        this.socket = new OBSWebSocket();
        this.bindSocketEvents();
    }
    normalizePort(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric))
            return OBS_DEFAULT_SETTINGS.port;
        const asInt = Math.trunc(numeric);
        if (asInt < 1 || asInt > 65535)
            return OBS_DEFAULT_SETTINGS.port;
        return asInt;
    }
    normalizeHost(value) {
        const host = String(value ?? "").trim();
        return host || OBS_DEFAULT_SETTINGS.host;
    }
    getSettingsFromStorage() {
        const fromDb = Settings.get("obs") ?? {};
        return {
            connectOnStartup: Boolean(fromDb.connectOnStartup ?? OBS_DEFAULT_SETTINGS.connectOnStartup),
            autoDetect: Boolean(fromDb.autoDetect ?? OBS_DEFAULT_SETTINGS.autoDetect),
            host: this.normalizeHost(fromDb.host),
            port: this.normalizePort(fromDb.port),
            password: String(fromDb.password ?? ""),
        };
    }
    saveSettings(next) {
        Settings.set("obs", next);
    }
    getSettings() {
        return this.getSettingsFromStorage();
    }
    getLocalIpAddress() {
        const interfaces = os.networkInterfaces();
        for (const net of Object.values(interfaces)) {
            if (!net)
                continue;
            for (const details of net) {
                if (details.family !== "IPv4")
                    continue;
                if (details.internal)
                    continue;
                return details.address;
            }
        }
        return OBS_DEFAULT_SETTINGS.host;
    }
    readAutoDetectedConfig() {
        try {
            const appDataPath = process.env.APPDATA || electronApp.getPath("appData");
            const configPath = path.join(appDataPath, "obs-studio", "plugin_config", "obs-websocket", "config.json");
            if (!fs.existsSync(configPath))
                return null;
            const raw = fs.readFileSync(configPath, "utf8");
            const config = JSON.parse(raw);
            const bindAddress = String(config.bind_address ?? "").trim();
            const host = bindAddress && bindAddress !== "0.0.0.0"
                ? bindAddress
                : this.getLocalIpAddress();
            return {
                host: this.normalizeHost(host),
                port: this.normalizePort(config.server_port),
                password: String(config.server_password ?? ""),
                source: "auto",
            };
        }
        catch {
            return null;
        }
    }
    resolveConfig(settings) {
        if (settings.autoDetect) {
            const detected = this.readAutoDetectedConfig();
            if (detected)
                return detected;
        }
        return {
            host: this.normalizeHost(settings.host),
            port: this.normalizePort(settings.port),
            password: String(settings.password ?? ""),
            source: "manual",
        };
    }
    bindSocketEvents() {
        this.socket.on("ConnectionClosed", () => {
            this.connected = false;
            this.connecting = false;
            this.streamActive = false;
            this.recordActive = false;
            this.recordPaused = false;
            this.currentProgramSceneName = "";
            this.schedulesEmit();
        });
        this.socket.on("ConnectionOpened", () => {
            this.connected = true;
            this.connecting = false;
            this.lastError = null;
            this.scheduleRefreshState();
        });
        this.socket.on("StreamStateChanged", (event) => {
            this.streamActive = Boolean(event?.outputActive);
            this.schedulesEmit();
        });
        this.socket.on("RecordStateChanged", (event) => {
            this.recordActive = Boolean(event?.outputActive);
            this.recordPaused = Boolean(event?.outputPaused);
            this.schedulesEmit();
        });
        this.socket.on("CurrentProgramSceneChanged", (event) => {
            this.currentProgramSceneName = String(event?.sceneName ?? "");
            this.scenes = this.scenes.map((scene) => ({
                ...scene,
                isCurrentProgram: scene.sceneName === this.currentProgramSceneName,
            }));
            this.schedulesEmit();
        });
        this.socket.on("SceneListChanged", () => this.scheduleRefreshState());
        this.socket.on("InputCreated", () => this.scheduleRefreshState());
        this.socket.on("InputRemoved", () => this.scheduleRefreshState());
        this.socket.on("InputNameChanged", () => this.scheduleRefreshState());
        this.socket.on("InputMuteStateChanged", (event) => {
            const inputName = String(event?.inputName ?? "");
            const inputMuted = Boolean(event?.inputMuted);
            let found = false;
            this.audioInputs = this.audioInputs.map((input) => {
                if (input.inputName !== inputName)
                    return input;
                found = true;
                return { ...input, inputMuted };
            });
            if (!found) {
                this.scheduleRefreshState();
                return;
            }
            this.schedulesEmit();
        });
    }
    normalizeError(error) {
        if (error instanceof Error)
            return error.message;
        return "Falha desconhecida ao comunicar com o OBS.";
    }
    scheduleRefreshState() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshState();
        }, 180);
    }
    schedulesEmit() {
        this.scheduleRefreshState();
    }
    async getStreamStatus() {
        if (!this.connected)
            return;
        try {
            const result = await this.socket.call("GetStreamStatus");
            this.streamActive = Boolean(result?.outputActive);
        }
        catch {
            this.streamActive = false;
        }
    }
    async getRecordStatus() {
        if (!this.connected)
            return;
        try {
            const result = await this.socket.call("GetRecordStatus");
            this.recordActive = Boolean(result?.outputActive);
            this.recordPaused = Boolean(result?.outputPaused);
        }
        catch {
            this.recordActive = false;
            this.recordPaused = false;
        }
    }
    async getSceneList() {
        if (!this.connected)
            return;
        try {
            const result = await this.socket.call("GetSceneList");
            const currentProgramSceneName = String(result?.currentProgramSceneName ?? "");
            const rawScenes = Array.isArray(result?.scenes) ? result.scenes : [];
            this.currentProgramSceneName = currentProgramSceneName;
            this.scenes = rawScenes.map((scene) => ({
                sceneName: String(scene.sceneName ?? ""),
                sceneIndex: Number(scene.sceneIndex ?? 0),
                isCurrentProgram: String(scene.sceneName ?? "") === currentProgramSceneName,
            }));
        }
        catch {
            this.scenes = [];
        }
    }
    async getAudioInputs() {
        if (!this.connected)
            return;
        try {
            const result = await this.socket.call("GetInputList");
            const rawInputs = Array.isArray(result?.inputs) ? result.inputs : [];
            const mapped = rawInputs.map((input) => ({
                inputName: String(input.inputName ?? ""),
                inputUuid: String(input.inputUuid ?? ""),
                inputKind: String(input.inputKind ?? ""),
                inputMuted: false,
            }));
            const mutedStates = await Promise.all(mapped.map(async (input) => {
                try {
                    const mute = await this.socket.call("GetInputMute", { inputName: input.inputName });
                    return { key: input.inputName, muted: Boolean(mute?.inputMuted) };
                }
                catch {
                    return { key: input.inputName, muted: false };
                }
            }));
            const muteMap = new Map(mutedStates.map((item) => [item.key, item.muted]));
            this.audioInputs = mapped.map((item) => ({
                ...item,
                inputMuted: Boolean(muteMap.get(item.inputName)),
            }));
        }
        catch {
            this.audioInputs = [];
        }
    }
    async emitStateChanged() {
        const snapshot = this.getStateSnapshot();
        this.emit("state-changed", snapshot);
    }
    getStateSnapshot() {
        const settings = this.getSettingsFromStorage();
        const resolvedConfig = this.resolveConfig(settings);
        return {
            connected: this.connected,
            connecting: this.connecting,
            streamActive: this.streamActive,
            recordActive: this.recordActive,
            recordPaused: this.recordPaused,
            currentProgramSceneName: this.currentProgramSceneName,
            scenes: this.scenes,
            audioInputs: this.audioInputs,
            lastError: this.lastError,
            settings,
            resolvedConfig,
        };
    }
    async getState() {
        await this.refreshState(false);
        return this.getStateSnapshot();
    }
    async refreshState(emit = true) {
        if (this.connected) {
            await Promise.all([
                this.getStreamStatus(),
                this.getRecordStatus(),
                this.getSceneList(),
                this.getAudioInputs(),
            ]);
        }
        if (emit) {
            await this.emitStateChanged();
        }
    }
    async updateSettings(patch, options) {
        const current = this.getSettingsFromStorage();
        const next = {
            ...current,
            ...patch,
            host: this.normalizeHost(patch.host ?? current.host),
            port: this.normalizePort(patch.port ?? current.port),
            password: String(patch.password ?? current.password ?? ""),
            connectOnStartup: Boolean(patch.connectOnStartup ?? current.connectOnStartup),
            autoDetect: Boolean(patch.autoDetect ?? current.autoDetect),
        };
        this.saveSettings(next);
        if (options?.reconnectIfConnected && this.connected) {
            const resolved = this.resolveConfig(next);
            if (options.requireValidManual && resolved.source === "manual") {
                if (!resolved.host || !resolved.password || !resolved.port) {
                    await this.emitStateChanged();
                    return { ok: false, message: "Host, porta ou senha invalidos para conexao manual." };
                }
            }
            const reconnect = await this.reconnect();
            if (!reconnect.ok)
                return reconnect;
        }
        await this.emitStateChanged();
        return { ok: true, message: "Configuracao OBS atualizada." };
    }
    async connect(config) {
        if (this.connected) {
            await this.refreshState();
            return { ok: true, message: "OBS ja conectado." };
        }
        if (this.connecting) {
            return { ok: false, message: "Conexao com OBS em andamento." };
        }
        this.connecting = true;
        await this.emitStateChanged();
        try {
            const settings = this.getSettingsFromStorage();
            const base = this.resolveConfig(settings);
            const finalConfig = {
                host: this.normalizeHost(config?.host ?? base.host),
                port: this.normalizePort(config?.port ?? base.port),
                password: String(config?.password ?? base.password ?? ""),
            };
            await this.socket.connect(`ws://${finalConfig.host}:${finalConfig.port}`, finalConfig.password || undefined);
            this.connected = true;
            this.connecting = false;
            this.lastError = null;
            await this.refreshState();
            return { ok: true, message: "Conectado ao OBS com sucesso." };
        }
        catch (error) {
            this.connected = false;
            this.connecting = false;
            this.lastError = this.normalizeError(error);
            await this.emitStateChanged();
            return { ok: false, message: this.lastError };
        }
    }
    async ensureConnected() {
        if (this.connected)
            return true;
        const result = await this.connect();
        return result.ok;
    }
    async disconnect() {
        try {
            await this.socket.disconnect();
        }
        catch {
            // ignore disconnect errors
        }
        this.connected = false;
        this.connecting = false;
        this.streamActive = false;
        this.recordActive = false;
        this.recordPaused = false;
        this.currentProgramSceneName = "";
        await this.emitStateChanged();
        return { ok: true, message: "Desconectado do OBS." };
    }
    async reconnect() {
        await this.disconnect();
        return this.connect();
    }
    async callWhenConnected(callback, successMessage) {
        const connected = await this.ensureConnected();
        if (!connected) {
            return { ok: false, message: this.lastError ?? "Nao foi possivel conectar ao OBS." };
        }
        try {
            await callback();
            await this.refreshState();
            return { ok: true, message: successMessage };
        }
        catch (error) {
            this.lastError = this.normalizeError(error);
            await this.emitStateChanged();
            return { ok: false, message: this.lastError };
        }
    }
    async startStream() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StartStream");
        }, "Stream iniciada.");
    }
    async stopStream() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StopStream");
        }, "Stream encerrada.");
    }
    async toggleStream() {
        return this.callWhenConnected(async () => {
            await this.socket.call("ToggleStream");
        }, "Stream alternada.");
    }
    async startRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StartRecord");
        }, "Gravacao iniciada.");
    }
    async stopRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StopRecord");
        }, "Gravacao encerrada.");
    }
    async toggleRecordPause() {
        return this.callWhenConnected(async () => {
            await this.socket.call("ToggleRecordPause");
        }, "Pausa da gravacao alternada.");
    }
    async pauseRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("PauseRecord");
        }, "Gravacao pausada.");
    }
    async resumeRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("ResumeRecord");
        }, "Gravacao retomada.");
    }
    async listScenes() {
        await this.refreshState(false);
        return this.scenes;
    }
    async listAudioInputs() {
        await this.refreshState(false);
        return this.audioInputs;
    }
    async setCurrentScene(sceneName) {
        const normalized = String(sceneName ?? "").trim();
        if (!normalized) {
            return { ok: false, message: "Nome da cena invalido." };
        }
        return this.callWhenConnected(async () => {
            await this.socket.call("SetCurrentProgramScene", { sceneName: normalized });
        }, "Cena alterada.");
    }
    findInput(inputNameOrUuid) {
        const normalized = String(inputNameOrUuid ?? "").trim();
        if (!normalized)
            return null;
        return this.audioInputs.find((input) => input.inputName === normalized || input.inputUuid === normalized) ?? null;
    }
    async setInputMute(inputNameOrUuid, muted) {
        const normalized = String(inputNameOrUuid ?? "").trim();
        if (!normalized) {
            return { ok: false, message: "Input de audio invalido." };
        }
        const input = this.findInput(normalized);
        const inputName = input?.inputName || normalized;
        return this.callWhenConnected(async () => {
            await this.socket.call("SetInputMute", { inputName, inputMuted: Boolean(muted) });
        }, Boolean(muted) ? "Audio mutado." : "Audio desmutado.");
    }
    async toggleInputMute(inputNameOrUuid) {
        const normalized = String(inputNameOrUuid ?? "").trim();
        if (!normalized) {
            return { ok: false, message: "Input de audio invalido." };
        }
        const input = this.findInput(normalized);
        const inputName = input?.inputName || normalized;
        return this.callWhenConnected(async () => {
            let currentlyMuted = false;
            try {
                const current = await this.socket.call("GetInputMute", { inputName });
                currentlyMuted = Boolean(current?.inputMuted);
            }
            catch {
                currentlyMuted = false;
            }
            await this.socket.call("SetInputMute", { inputName, inputMuted: !currentlyMuted });
        }, "Estado do audio alternado.");
    }
    async connectOnStartupIfNeeded() {
        const settings = this.getSettingsFromStorage();
        if (!settings.connectOnStartup)
            return;
        await this.connect();
    }
}
