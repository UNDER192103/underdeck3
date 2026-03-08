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

export type ObsSettings = {
    connectOnStartup: boolean;
    autoDetect: boolean;
    host: string;
    port: number;
    password: string;
};

export type ObsScene = {
    sceneName: string;
    sceneIndex: number;
    isCurrentProgram: boolean;
};

export type ObsAudioInput = {
    inputName: string;
    inputUuid: string;
    inputKind: string;
    inputMuted: boolean;
};

export type ObsResolvedConfig = {
    host: string;
    port: number;
    password: string;
    source: "manual" | "auto";
};

export type ObsState = {
    connected: boolean;
    connecting: boolean;
    streamActive: boolean;
    recordActive: boolean;
    recordPaused: boolean;
    currentProgramSceneName: string;
    scenes: ObsScene[];
    audioInputs: ObsAudioInput[];
    lastError: string | null;
    settings: ObsSettings;
    resolvedConfig: ObsResolvedConfig;
};

export type ObsCommandResult = {
    ok: boolean;
    message: string;
};

export class ObsService extends EventEmitter {
    private socket: OBSWebSocket;
    private connected = false;
    private connecting = false;
    private streamActive = false;
    private recordActive = false;
    private recordPaused = false;
    private currentProgramSceneName = "";
    private scenes: ObsScene[] = [];
    private audioInputs: ObsAudioInput[] = [];
    private lastError: string | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.socket = new OBSWebSocket();
        this.bindSocketEvents();
    }

    private normalizePort(value: unknown) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return OBS_DEFAULT_SETTINGS.port;
        const asInt = Math.trunc(numeric);
        if (asInt < 1 || asInt > 65535) return OBS_DEFAULT_SETTINGS.port;
        return asInt;
    }

    private normalizeHost(value: unknown) {
        const host = String(value ?? "").trim();
        return host || OBS_DEFAULT_SETTINGS.host;
    }

    private getSettingsFromStorage() {
        const fromDb = (Settings.get("obs") as Partial<ObsSettings> | undefined) ?? {};
        return {
            connectOnStartup: Boolean(fromDb.connectOnStartup ?? OBS_DEFAULT_SETTINGS.connectOnStartup),
            autoDetect: Boolean(fromDb.autoDetect ?? OBS_DEFAULT_SETTINGS.autoDetect),
            host: this.normalizeHost(fromDb.host),
            port: this.normalizePort(fromDb.port),
            password: String(fromDb.password ?? ""),
        };
    }

    private saveSettings(next: ObsSettings) {
        Settings.set("obs", next);
    }

    public getSettings() {
        return this.getSettingsFromStorage();
    }

    private getLocalIpAddress() {
        const interfaces = os.networkInterfaces();
        for (const net of Object.values(interfaces)) {
            if (!net) continue;
            for (const details of net) {
                if (details.family !== "IPv4") continue;
                if (details.internal) continue;
                return details.address;
            }
        }
        return OBS_DEFAULT_SETTINGS.host;
    }

    private readAutoDetectedConfig() {
        try {
            const appDataPath = process.env.APPDATA || electronApp.getPath("appData");
            const configPath = path.join(appDataPath, "obs-studio", "plugin_config", "obs-websocket", "config.json");
            if (!fs.existsSync(configPath)) return null;

            const raw = fs.readFileSync(configPath, "utf8");
            const config = JSON.parse(raw) as {
                server_port?: number;
                server_password?: string;
                bind_address?: string;
            };

            const bindAddress = String(config.bind_address ?? "").trim();
            const host = bindAddress && bindAddress !== "0.0.0.0"
                ? bindAddress
                : this.getLocalIpAddress();

            return {
                host: this.normalizeHost(host),
                port: this.normalizePort(config.server_port),
                password: String(config.server_password ?? ""),
                source: "auto" as const,
            };
        } catch {
            return null;
        }
    }

    private resolveConfig(settings: ObsSettings): ObsResolvedConfig {
        if (settings.autoDetect) {
            const detected = this.readAutoDetectedConfig();
            if (detected) return detected;
        }
        return {
            host: this.normalizeHost(settings.host),
            port: this.normalizePort(settings.port),
            password: String(settings.password ?? ""),
            source: "manual",
        };
    }

    private bindSocketEvents() {
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

        this.socket.on("StreamStateChanged", (event: any) => {
            this.streamActive = Boolean(event?.outputActive);
            this.schedulesEmit();
        });

        this.socket.on("RecordStateChanged", (event: any) => {
            this.recordActive = Boolean(event?.outputActive);
            this.recordPaused = Boolean(event?.outputPaused);
            this.schedulesEmit();
        });

        this.socket.on("CurrentProgramSceneChanged", (event: any) => {
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
        this.socket.on("InputMuteStateChanged", (event: any) => {
            const inputName = String(event?.inputName ?? "");
            const inputMuted = Boolean(event?.inputMuted);
            let found = false;
            this.audioInputs = this.audioInputs.map((input) => {
                if (input.inputName !== inputName) return input;
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

    private normalizeError(error: unknown) {
        if (error instanceof Error) return error.message;
        return "Falha desconhecida ao comunicar com o OBS.";
    }

    private scheduleRefreshState() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshState();
        }, 180);
    }

    private schedulesEmit() {
        this.scheduleRefreshState();
    }

    private async getStreamStatus() {
        if (!this.connected) return;
        try {
            const result = await this.socket.call("GetStreamStatus");
            this.streamActive = Boolean((result as any)?.outputActive);
        } catch {
            this.streamActive = false;
        }
    }

    private async getRecordStatus() {
        if (!this.connected) return;
        try {
            const result = await this.socket.call("GetRecordStatus");
            this.recordActive = Boolean((result as any)?.outputActive);
            this.recordPaused = Boolean((result as any)?.outputPaused);
        } catch {
            this.recordActive = false;
            this.recordPaused = false;
        }
    }

    private async getSceneList() {
        if (!this.connected) return;
        try {
            const result = await this.socket.call("GetSceneList");
            const currentProgramSceneName = String((result as any)?.currentProgramSceneName ?? "");
            const rawScenes = Array.isArray((result as any)?.scenes) ? (result as any).scenes : [];
            this.currentProgramSceneName = currentProgramSceneName;
            this.scenes = rawScenes.map((scene: any) => ({
                sceneName: String(scene.sceneName ?? ""),
                sceneIndex: Number(scene.sceneIndex ?? 0),
                isCurrentProgram: String(scene.sceneName ?? "") === currentProgramSceneName,
            }));
        } catch {
            this.scenes = [];
        }
    }

    private async getAudioInputs() {
        if (!this.connected) return;
        try {
            const result = await this.socket.call("GetInputList");
            const rawInputs = Array.isArray((result as any)?.inputs) ? (result as any).inputs : [];
            const mapped: ObsAudioInput[] = rawInputs.map((input: any) => ({
                inputName: String(input.inputName ?? ""),
                inputUuid: String(input.inputUuid ?? ""),
                inputKind: String(input.inputKind ?? ""),
                inputMuted: false,
            }));

            const mutedStates = await Promise.all(
                mapped.map(async (input) => {
                    try {
                        const mute = await this.socket.call("GetInputMute", { inputName: input.inputName });
                        return { key: input.inputName, muted: Boolean((mute as any)?.inputMuted) };
                    } catch {
                        return { key: input.inputName, muted: false };
                    }
                })
            );

            const muteMap = new Map(mutedStates.map((item) => [item.key, item.muted]));
            this.audioInputs = mapped.map((item) => ({
                ...item,
                inputMuted: Boolean(muteMap.get(item.inputName)),
            }));
        } catch {
            this.audioInputs = [];
        }
    }

    private async emitStateChanged() {
        const snapshot = this.getStateSnapshot();
        this.emit("state-changed", snapshot);
    }

    private getStateSnapshot(): ObsState {
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

    public async getState() {
        await this.refreshState(false);
        return this.getStateSnapshot();
    }

    public async refreshState(emit = true) {
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

    public async updateSettings(
        patch: Partial<ObsSettings>,
        options?: { reconnectIfConnected?: boolean; requireValidManual?: boolean }
    ) {
        const current = this.getSettingsFromStorage();
        const next: ObsSettings = {
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
            if (!reconnect.ok) return reconnect;
        }

        await this.emitStateChanged();
        return { ok: true, message: "Configuracao OBS atualizada." };
    }

    public async connect(config?: Partial<ObsResolvedConfig>): Promise<ObsCommandResult> {
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

            await this.socket.connect(
                `ws://${finalConfig.host}:${finalConfig.port}`,
                finalConfig.password || undefined
            );
            this.connected = true;
            this.connecting = false;
            this.lastError = null;
            await this.refreshState();
            return { ok: true, message: "Conectado ao OBS com sucesso." };
        } catch (error) {
            this.connected = false;
            this.connecting = false;
            this.lastError = this.normalizeError(error);
            await this.emitStateChanged();
            return { ok: false, message: this.lastError };
        }
    }

    public async ensureConnected() {
        if (this.connected) return true;
        const result = await this.connect();
        return result.ok;
    }

    public async disconnect(): Promise<ObsCommandResult> {
        try {
            await this.socket.disconnect();
        } catch {
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

    public async reconnect() {
        await this.disconnect();
        return this.connect();
    }

    private async callWhenConnected(
        callback: () => Promise<void>,
        successMessage: string
    ): Promise<ObsCommandResult> {
        const connected = await this.ensureConnected();
        if (!connected) {
            return { ok: false, message: this.lastError ?? "Nao foi possivel conectar ao OBS." };
        }
        try {
            await callback();
            await this.refreshState();
            return { ok: true, message: successMessage };
        } catch (error) {
            this.lastError = this.normalizeError(error);
            await this.emitStateChanged();
            return { ok: false, message: this.lastError };
        }
    }

    public async startStream() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StartStream");
        }, "Stream iniciada.");
    }

    public async stopStream() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StopStream");
        }, "Stream encerrada.");
    }

    public async toggleStream() {
        return this.callWhenConnected(async () => {
            await this.socket.call("ToggleStream");
        }, "Stream alternada.");
    }

    public async startRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StartRecord");
        }, "Gravacao iniciada.");
    }

    public async stopRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("StopRecord");
        }, "Gravacao encerrada.");
    }

    public async toggleRecordPause() {
        return this.callWhenConnected(async () => {
            await this.socket.call("ToggleRecordPause");
        }, "Pausa da gravacao alternada.");
    }

    public async pauseRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("PauseRecord");
        }, "Gravacao pausada.");
    }

    public async resumeRecord() {
        return this.callWhenConnected(async () => {
            await this.socket.call("ResumeRecord");
        }, "Gravacao retomada.");
    }

    public async listScenes() {
        await this.refreshState(false);
        return this.scenes;
    }

    public async listAudioInputs() {
        await this.refreshState(false);
        return this.audioInputs;
    }

    public async setCurrentScene(sceneName: string) {
        const normalized = String(sceneName ?? "").trim();
        if (!normalized) {
            return { ok: false, message: "Nome da cena invalido." };
        }
        return this.callWhenConnected(async () => {
            await this.socket.call("SetCurrentProgramScene", { sceneName: normalized });
        }, "Cena alterada.");
    }

    private findInput(inputNameOrUuid: string) {
        const normalized = String(inputNameOrUuid ?? "").trim();
        if (!normalized) return null;
        return this.audioInputs.find((input) => input.inputName === normalized || input.inputUuid === normalized) ?? null;
    }

    public async setInputMute(inputNameOrUuid: string, muted: boolean) {
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

    public async toggleInputMute(inputNameOrUuid: string) {
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
                currentlyMuted = Boolean((current as any)?.inputMuted);
            } catch {
                currentlyMuted = false;
            }
            await this.socket.call("SetInputMute", { inputName, inputMuted: !currentlyMuted });
        }, "Estado do audio alternado.");
    }

    public async connectOnStartupIfNeeded() {
        const settings = this.getSettingsFromStorage();
        if (!settings.connectOnStartup) return;
        await this.connect();
    }
}
