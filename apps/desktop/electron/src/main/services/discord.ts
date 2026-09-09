import { EventEmitter } from "node:events";
import electron from "electron";
import RPC from "discord-rpc";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";
import { observerService, ObserverChannels } from "./observer.js";

const { safeStorage } = electron;

const RECONNECT_DELAY_MS = 5_000;

type StoredDiscordSettings = {
    connectOnStartup?: boolean;
    clientId?: string;
    clientSecretEncrypted?: string;
    accessTokenEncrypted?: string;
};

export type DiscordSettings = {
    connectOnStartup: boolean;
    clientId: string;
    hasClientSecret: boolean;
    hasAccessToken: boolean;
};

export type DiscordProfile = {
    id: string;
    username: string;
    globalName: string;
    avatarUrl: string | null;
};

export type DiscordApplication = {
    id: string;
    name: string;
    iconUrl: string | null;
};

export type DiscordVoiceState = {
    mute: boolean;
    deaf: boolean;
};

export type DiscordState = {
    connected: boolean;
    connecting: boolean;
    reconnecting: boolean;
    user: DiscordProfile | null;
    application: DiscordApplication | null;
    voice: DiscordVoiceState;
    lastError: string | null;
    settings: DiscordSettings;
};

export type DiscordCommandResult = {
    ok: boolean;
    message: string;
};

type DiscordClient = InstanceType<typeof RPC.Client>;

export class DiscordService extends EventEmitter {
    private client: DiscordClient | null = null;
    private connected = false;
    private connecting = false;
    private reconnecting = false;
    private user: DiscordProfile | null = null;
    private application: DiscordApplication | null = null;
    private voice: DiscordVoiceState = { mute: false, deaf: false };
    private lastError: string | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private manualDisconnect = false;
    // Once the user has connected in this application session, keep the RPC
    // connection alive even when "connect on startup" is disabled. That setting
    // controls startup only; it should not disable recovery after Discord restarts.
    private shouldReconnect = false;

    private readStoredSettings(): StoredDiscordSettings {
        return (Settings.get("discord") as StoredDiscordSettings | undefined) ?? {};
    }

    private encodeSecret(value: string) {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error("O armazenamento seguro do sistema não está disponível.");
        }
        return safeStorage.encryptString(value).toString("base64");
    }

    private decodeSecret(value: unknown) {
        const encoded = String(value ?? "").trim();
        if (!encoded) return "";
        if (!safeStorage.isEncryptionAvailable()) return "";
        try {
            return safeStorage.decryptString(Buffer.from(encoded, "base64"));
        } catch {
            return "";
        }
    }

    private getSecrets() {
        const stored = this.readStoredSettings();
        return {
            clientSecret: this.decodeSecret(stored.clientSecretEncrypted),
            accessToken: this.decodeSecret(stored.accessTokenEncrypted),
        };
    }

    public getSettings(): DiscordSettings {
        const stored = this.readStoredSettings();
        const { clientSecret, accessToken } = this.getSecrets();
        return {
            connectOnStartup: Boolean(stored.connectOnStartup),
            clientId: String(stored.clientId ?? "").trim(),
            hasClientSecret: Boolean(clientSecret),
            hasAccessToken: Boolean(accessToken),
        };
    }

    private saveStoredSettings(next: StoredDiscordSettings) {
        Settings.set("discord", next);
    }

    private normalizeError(error: unknown) {
        if (error instanceof Error && error.message) return error.message;
        return "Não foi possível comunicar com o Discord.";
    }

    private profileFrom(raw: any): DiscordProfile | null {
        if (!raw?.id) return null;
        const id = String(raw.id);
        const avatar = String(raw.avatar ?? "").trim();
        return {
            id,
            username: String(raw.username ?? ""),
            globalName: String(raw.global_name ?? raw.globalName ?? raw.username ?? ""),
            avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128` : null,
        };
    }

    private applicationFrom(raw: any): DiscordApplication | null {
        if (!raw?.id) return null;
        const id = String(raw.id);
        const icon = String(raw.icon ?? raw?.bot?.avatar ?? "").trim();
        return {
            id,
            name: String(raw.name ?? ""),
            iconUrl: icon ? `https://cdn.discordapp.com/app-icons/${id}/${icon}.png?size=128` : null,
        };
    }

    private getStateSnapshot(): DiscordState {
        return {
            connected: this.connected,
            connecting: this.connecting,
            reconnecting: this.reconnecting,
            user: this.user,
            application: this.application,
            voice: { ...this.voice },
            lastError: this.lastError,
            settings: this.getSettings(),
        };
    }

    private emitStateChanged() {
        const state = this.getStateSnapshot();
        this.emit("state-changed", state);
        observerService.publish(ObserverChannels.DISCORD_STATE_CHANGED, { state }, "DISCORD_SERVICE");
    }

    private clearReconnectTimer() {
        if (!this.reconnectTimer) return;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    private scheduleReconnect() {
        const settings = this.getSettings();
        const { accessToken } = this.getSecrets();
        if (this.manualDisconnect || !this.shouldReconnect || !settings.clientId || !accessToken || this.reconnectTimer) return;
        this.reconnecting = true;
        this.emitStateChanged();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect({ allowAuthorization: false, isReconnect: true });
        }, RECONNECT_DELAY_MS);
    }

    private resetConnectionState() {
        this.connected = false;
        this.connecting = false;
        this.user = null;
        this.application = null;
        this.voice = { mute: false, deaf: false };
    }

    private async readVoiceSettings() {
        if (!this.client || !this.connected) return;
        try {
            const voice = await this.client.getVoiceSettings() as any;
            this.voice = {
                mute: Boolean(voice?.mute),
                deaf: Boolean(voice?.deaf),
            };
        } catch (error) {
            this.lastError = this.normalizeError(error);
            logsService.log("discord", "discord.voice_settings.read.error", { error: this.lastError }, "error");
        }
    }

    private createClient() {
        const client = new RPC.Client({ transport: "ipc" });
        client.on("ready", async () => {
            if (client !== this.client) return;
            this.connected = true;
            this.connecting = false;
            this.reconnecting = false;
            this.lastError = null;
            this.user = this.profileFrom((client as any).user);
            this.application = this.applicationFrom((client as any).application);
            await this.readVoiceSettings();
            this.emitStateChanged();
            logsService.log("discord", "discord.connect.success", { clientId: this.getSettings().clientId });
        });
        client.on("disconnected", () => {
            if (client !== this.client) return;
            this.resetConnectionState();
            this.emitStateChanged();
            logsService.log("discord", "discord.disconnected");
            this.scheduleReconnect();
        });
        client.on("error", (error: unknown) => {
            if (client !== this.client) return;
            this.lastError = this.normalizeError(error);
            this.emitStateChanged();
            logsService.log("discord", "discord.error", { error: this.lastError }, "error");
        });
        return client;
    }

    public async getState() {
        await this.refreshState(false);
        return this.getStateSnapshot();
    }

    public async refreshState(emit = true) {
        await this.readVoiceSettings();
        if (emit) this.emitStateChanged();
        return this.getStateSnapshot();
    }

    public async updateSettings(patch: Partial<{ connectOnStartup: boolean; clientId: string; clientSecret: string; clearClientSecret: boolean }>) {
        const current = this.readStoredSettings();
        const nextClientId = String(patch.clientId ?? current.clientId ?? "").trim();
        const replacingSecret = typeof patch.clientSecret === "string" && Boolean(patch.clientSecret.trim());
        const credentialsChanged = nextClientId !== String(current.clientId ?? "").trim() || replacingSecret || Boolean(patch.clearClientSecret);
        const next: StoredDiscordSettings = {
            ...current,
            connectOnStartup: Boolean(patch.connectOnStartup ?? current.connectOnStartup),
            clientId: nextClientId,
        };

        if (patch.clearClientSecret) {
            next.clientSecretEncrypted = "";
            next.accessTokenEncrypted = "";
        } else if (typeof patch.clientSecret === "string" && patch.clientSecret.trim()) {
            next.clientSecretEncrypted = this.encodeSecret(patch.clientSecret.trim());
            next.accessTokenEncrypted = "";
        }

        this.saveStoredSettings(next);
        // A connection may still be authorizing when the user replaces the
        // credentials. Tear it down as well, otherwise the old authorization
        // could finish and overwrite the state after this update.
        if (credentialsChanged && this.client) {
            await this.disconnect();
        }
        this.emitStateChanged();
        return { ok: true, message: "Configuração do Discord atualizada." } satisfies DiscordCommandResult;
    }

    public async connect(options?: { allowAuthorization?: boolean; isReconnect?: boolean }): Promise<DiscordCommandResult> {
        if (this.connected) {
            await this.refreshState();
            return { ok: true, message: "Discord já conectado." };
        }
        if (this.connecting) return { ok: false, message: "Conexão com o Discord em andamento." };

        const settings = this.getSettings();
        const secrets = this.getSecrets();
        if (!settings.clientId || !secrets.clientSecret) {
            this.lastError = "Configure o Client ID e o Client Secret antes de conectar.";
            this.emitStateChanged();
            return { ok: false, message: this.lastError };
        }
        if (!options?.allowAuthorization && !secrets.accessToken) {
            this.lastError = "É necessária uma autorização manual do Discord.";
            this.emitStateChanged();
            return { ok: false, message: this.lastError };
        }

        this.clearReconnectTimer();
        this.manualDisconnect = false;
        this.shouldReconnect = true;
        this.connecting = true;
        this.reconnecting = Boolean(options?.isReconnect);
        this.lastError = null;
        this.emitStateChanged();

        const client = this.createClient();
        this.client = client;
        let activeClient = client;
        const login = async (targetClient: DiscordClient, accessToken?: string) => targetClient.login({
            clientId: settings.clientId,
            clientSecret: secrets.clientSecret,
            accessToken,
            scopes: ["rpc"],
            redirectUri: "http://127.0.0.1",
        });

        try {
            await login(activeClient, secrets.accessToken || undefined);
            const token = String((client as any).accessToken ?? "").trim();
            if (token) {
                const stored = this.readStoredSettings();
                this.saveStoredSettings({ ...stored, accessTokenEncrypted: this.encodeSecret(token) });
            }
            await this.refreshState();
            return { ok: true, message: "Conectado ao Discord com sucesso." };
        } catch (firstError) {
            const canRetryAuthorization = Boolean(options?.allowAuthorization && secrets.accessToken);
            if (canRetryAuthorization) {
                try {
                    const stored = this.readStoredSettings();
                    this.saveStoredSettings({ ...stored, accessTokenEncrypted: "" });
                    // Ignore the old client's `disconnected` event: a fresh
                    // authorization is about to replace it in the same flow.
                    if (this.client === client) this.client = null;
                    await client.destroy().catch(() => undefined);
                    const retryClient = this.createClient();
                    this.client = retryClient;
                    activeClient = retryClient;
                    await login(retryClient);
                    const token = String((retryClient as any).accessToken ?? "").trim();
                    if (token) this.saveStoredSettings({ ...this.readStoredSettings(), accessTokenEncrypted: this.encodeSecret(token) });
                    await this.refreshState();
                    return { ok: true, message: "Conectado ao Discord com sucesso." };
                } catch (retryError) {
                    firstError = retryError;
                }
            }
            this.resetConnectionState();
            this.reconnecting = false;
            this.lastError = this.normalizeError(firstError);
            if (this.client === activeClient) this.client = null;
            try { await activeClient.destroy(); } catch { /* ignore */ }
            this.emitStateChanged();
            logsService.log("discord", "discord.connect.error", { error: this.lastError }, "error");
            this.scheduleReconnect();
            return { ok: false, message: this.lastError };
        }
    }

    public async disconnect(): Promise<DiscordCommandResult> {
        this.manualDisconnect = true;
        this.shouldReconnect = false;
        this.clearReconnectTimer();
        const client = this.client;
        this.client = null;
        if (client) {
            try { await client.destroy(); } catch { /* ignore */ }
        }
        this.resetConnectionState();
        this.reconnecting = false;
        this.lastError = null;
        this.emitStateChanged();
        logsService.log("discord", "discord.disconnect");
        return { ok: true, message: "Desconectado do Discord." };
    }

    public async connectOnStartupIfNeeded() {
        const settings = this.getSettings();
        if (!settings.connectOnStartup) return { ok: true, message: "Conexão automática do Discord desativada." };
        return this.connect({ allowAuthorization: false });
    }

    private async runVoiceAction(action: () => Promise<void>, successMessage: string): Promise<DiscordCommandResult> {
        if (!this.connected || !this.client) {
            return { ok: false, message: "Discord não está conectado." };
        }
        try {
            await action();
            await this.refreshState();
            return { ok: true, message: successMessage };
        } catch (error) {
            this.lastError = this.normalizeError(error);
            this.emitStateChanged();
            logsService.log("discord", "discord.voice_action.error", { error: this.lastError }, "error");
            return { ok: false, message: this.lastError };
        }
    }

    public async setMute(mute: boolean) {
        return this.runVoiceAction(async () => {
            await this.client!.setVoiceSettings({ mute });
        }, mute ? "Microfone mutado." : "Microfone desmutado.");
    }

    public async toggleMute() {
        await this.refreshState(false);
        return this.setMute(!this.voice.mute);
    }

    public async setDeafen(deaf: boolean) {
        return this.runVoiceAction(async () => {
            await this.client!.setVoiceSettings(deaf ? { deaf: true, mute: true } : { deaf: false, mute: false });
        }, deaf ? "Áudio desativado." : "Áudio reativado.");
    }

    public async toggleDeafen() {
        await this.refreshState(false);
        return this.setDeafen(!this.voice.deaf);
    }
}
