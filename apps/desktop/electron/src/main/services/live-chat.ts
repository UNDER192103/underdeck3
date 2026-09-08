import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import tmi from "tmi.js";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";
import { observerService, ObserverChannels } from "./observer.js";
import type {
  LiveChatCommandResult,
  LiveChatChannelAppearance,
  LiveChatEvent,
  LiveChatProvider,
  LiveChatProviderState,
  LiveChatSettings,
  LiveChatSettingsPatch,
  TwitchChatTags,
} from "../../types/live-chat.js";
import type {
  StoredThemeBackground,
  ThemeEffectBackgrounds,
} from "../../types/theme.js";

const { app, safeStorage } = electron;

const DEFAULT_BACKGROUND_PRESETS: Required<ThemeEffectBackgrounds> = {
  color: { variant: "color", backgroundColor: "#000000" },
  neural: {
    variant: "neural",
    neuralColors: {
      center: "#151964",
      middle: "#021A4B",
      edge: "#03091D",
      link: "#7DD3FC",
      dot: "#93C5FD",
    },
  },
  nebula: {
    variant: "nebula",
    nebulaColor: "#712CF9",
    nebulaExplosionColor: "#8B5CF6",
    nebulaBackgroundStart: "#0B0716",
    nebulaBackgroundEnd: "#1A0D35",
  },
  particles: {
    variant: "particles",
    particleColor: "#60A5FA",
    particleBackgroundColor: "#020617",
    particleCount: 36,
  },
};

type StoredLiveChatSettings = {
  enabled?: boolean;
  twitch?: {
    enabled?: boolean;
    anonymous?: boolean;
    username?: string;
    passwordEncrypted?: string;
    channels?: string[];
    channelOverrides?: Record<string, Partial<LiveChatChannelAppearance>>;
    reconnect?: boolean;
  };
  tiktok?: { enabled?: boolean };
  overlay?: LiveChatSettings["overlay"];
};

const TWITCH_EVENTS = [
  "action",
  "automod",
  "anongiftpaidupgrade",
  "anonsubgift",
  "anonsubmysterygift",
  "ban",
  "bits",
  "chat",
  "cheer",
  "clearchat",
  "connected",
  "connecting",
  "disconnected",
  "emoteonly",
  "emotesets",
  "followersonly",
  "followersmode",
  "giftpaidupgrade",
  "globaluserstate",
  "hosted",
  "hosting",
  "join",
  "logon",
  "maxreconnect",
  "messagedeleted",
  "mod",
  "mods",
  "names",
  "newchatter",
  "notice",
  "part",
  "ping",
  "pong",
  "primepaidupgrade",
  "r9kbeta",
  "r9kmode",
  "raided",
  "raw_message",
  "reconnect",
  "redeem",
  "resub",
  "ritual",
  "roomstate",
  "serverchange",
  "slow",
  "slowmode",
  "sub",
  "subanniversary",
  "subgift",
  "submysterygift",
  "subscriber",
  "subscribers",
  "subscription",
  "timeout",
  "unhost",
  "unmod",
  "usernotice",
  "vips",
  "whisper",
] as const;

// These are raw protocol events or tmi.js aliases for an event that is already
// normalized above. Keep them available through service.on("twitch"/"all"),
// but do not duplicate them over renderer IPC.
const NOISY_OR_ALIAS_EVENTS = new Set([
  "action",
  "chat",
  "ping",
  "pong",
  "raw_message",
  "sub",
  "subanniversary",
  "subscriber",
]);

const defaultProviderState = (): LiveChatProviderState => ({
  connected: false,
  connecting: false,
  reconnecting: false,
  joinedChannels: [],
  lastError: null,
});

export class LiveChatService extends EventEmitter {
  private twitchClient: InstanceType<typeof tmi.Client> | null = null;
  private twitchState: LiveChatProviderState = defaultProviderState();
  private manualDisconnect = false;
  private disabledEventChannels = new Set<string>();

  private readStoredSettings(): StoredLiveChatSettings {
    return (
      (Settings.get("liveChat") as StoredLiveChatSettings | undefined) ?? {}
    );
  }

  private encodeSecret(value: string) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure storage is not available on this system.");
    }
    return safeStorage.encryptString(value).toString("base64");
  }

  private decodeSecret(value: unknown) {
    const encoded = String(value ?? "").trim();
    if (!encoded || !safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      return "";
    }
  }

  private normalizeChannels(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [];
    return [
      ...new Set(
        values
          .map((item) =>
            String(item ?? "")
              .trim()
              .replace(/^#/, "")
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
  }

  private normalizeChannelOverrides(
    value: unknown,
    channels: string[],
  ): Record<string, LiveChatChannelAppearance> {
    const source =
      value && typeof value === "object"
        ? (value as Record<string, Partial<LiveChatChannelAppearance>>)
        : {};
    return Object.fromEntries(
      channels.flatMap((channel) => {
        const appearance = source[channel];
        if (!appearance || typeof appearance !== "object") return [];
        const label = String(appearance.label ?? "")
          .trim()
          .slice(0, 80);
        const icon =
          String(appearance.icon ?? "")
            .trim()
            .slice(0, 2048) || null;
        const eventsEnabled = appearance.eventsEnabled !== false;
        if (!label && !icon && eventsEnabled) return [];
        return [[channel, { label, icon, eventsEnabled }]];
      }),
    );
  }

  private normalizeBackground(value: unknown): StoredThemeBackground {
    if (!value || typeof value !== "object") {
      return { variant: "color", backgroundColor: "#000000" };
    }
    const candidate = value as StoredThemeBackground;
    if (
      candidate.variant === "image" &&
      !String(candidate.imageSrc || "").trim()
    ) {
      return { variant: "color", backgroundColor: "#000000" };
    }
    if (
      candidate.variant === "video" &&
      !String(candidate.videoSrc || "").trim()
    ) {
      return { variant: "color", backgroundColor: "#000000" };
    }
    if (
      ["color", "image", "video", "neural", "nebula", "particles"].includes(
        candidate.variant,
      )
    ) {
      return candidate;
    }
    return { variant: "color", backgroundColor: "#000000" };
  }

  private normalizeBackgroundPresets(value: unknown): ThemeEffectBackgrounds {
    const source =
      value && typeof value === "object"
        ? (value as ThemeEffectBackgrounds)
        : {};
    const presets: ThemeEffectBackgrounds = {};
    for (const variant of [
      "color",
      "neural",
      "nebula",
      "particles",
    ] as const) {
      const candidate = this.normalizeBackground(
        source[variant] ?? DEFAULT_BACKGROUND_PRESETS[variant],
      );
      presets[variant] =
        candidate.variant === variant
          ? (candidate as never)
          : (structuredClone(DEFAULT_BACKGROUND_PRESETS[variant]) as never);
    }
    return presets;
  }

  private getBackgroundMediaUrl(background: StoredThemeBackground) {
    if (background.variant === "image") return background.imageSrc;
    if (background.variant === "video") return background.videoSrc;
    return "";
  }

  private deleteReplacedBackground(
    previous: StoredThemeBackground,
    current: StoredThemeBackground,
  ) {
    const previousUrl = this.getBackgroundMediaUrl(previous);
    const currentUrl = this.getBackgroundMediaUrl(current);
    if (!previousUrl || previousUrl === currentUrl) return;
    if (!previousUrl.startsWith("underdeck-media://live-chat-backgrounds/"))
      return;
    try {
      const url = new URL(previousUrl);
      const relativeMediaPath = decodeURIComponent(
        `${url.hostname}${url.pathname}`,
      ).replace(/^\/+/, "");
      const storageRoot = path.resolve(
        app.getPath("userData"),
        String(Settings.get("storage")?.baseFolder || "underdeck"),
      );
      const allowedFolder = path.resolve(storageRoot, "live-chat-backgrounds");
      const absolutePath = path.resolve(storageRoot, relativeMediaPath);
      const relativeToAllowed = path.relative(allowedFolder, absolutePath);
      if (
        !relativeToAllowed ||
        relativeToAllowed.startsWith("..") ||
        path.isAbsolute(relativeToAllowed)
      )
        return;
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch (error) {
      logsService.log(
        "app",
        "live-chat.background.cleanup.error",
        { error: this.normalizeError(error), previousUrl },
        "warn",
      );
    }
  }

  private syncChannelEventFilters(settings: LiveChatSettings) {
    this.disabledEventChannels = new Set(
      settings.twitch.channels.filter(
        (channel) =>
          settings.twitch.channelOverrides[channel]?.eventsEnabled === false,
      ),
    );
  }

  private normalizeMaxMessages(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? Math.min(1000, Math.max(10, Math.round(parsed)))
      : 200;
  }

  public getSettings(): LiveChatSettings {
    const stored = this.readStoredSettings();
    const password = this.decodeSecret(stored.twitch?.passwordEncrypted);
    const storedBounds = stored.overlay?.bounds ?? {};
    const channels = this.normalizeChannels(stored.twitch?.channels);
    return {
      enabled: Boolean(stored.enabled),
      twitch: {
        enabled: Boolean(stored.twitch?.enabled),
        anonymous: stored.twitch?.anonymous !== false,
        username: String(stored.twitch?.username ?? "").trim(),
        hasPassword: Boolean(password),
        channels,
        channelOverrides: this.normalizeChannelOverrides(
          stored.twitch?.channelOverrides,
          channels,
        ),
        reconnect: stored.twitch?.reconnect !== false,
      },
      tiktok: { enabled: false, available: false },
      overlay: {
        mode: stored.overlay?.mode === "separate" ? "separate" : "combined",
        paused: Boolean(stored.overlay?.paused),
        locked: Boolean(stored.overlay?.locked),
        alwaysOnTop: stored.overlay?.alwaysOnTop !== false,
        maxMessages: this.normalizeMaxMessages(
          stored.overlay?.maxMessages ?? 200,
        ),
        showSelfMessages: Boolean(stored.overlay?.showSelfMessages),
        showTimestamp: stored.overlay?.showTimestamp !== false,
        showBadges: stored.overlay?.showBadges !== false,
        showProvider: stored.overlay?.showProvider !== false,
        showChannel: stored.overlay?.showChannel !== false,
        background: this.normalizeBackground(stored.overlay?.background),
        backgroundPresets: this.normalizeBackgroundPresets(
          stored.overlay?.backgroundPresets,
        ),
        openScopes: Array.isArray(stored.overlay?.openScopes)
          ? [
              ...new Set(
                stored.overlay.openScopes.filter(
                  (scope) =>
                    scope === "combined" ||
                    scope === "twitch" ||
                    scope === "tiktok",
                ),
              ),
            ]
          : [],
        bounds: storedBounds,
      },
    };
  }

  private getPassword() {
    return this.decodeSecret(
      this.readStoredSettings().twitch?.passwordEncrypted,
    );
  }

  public getState(): LiveChatState {
    const settings = this.getSettings();
    return {
      enabled: settings.enabled,
      settings,
      providers: {
        twitch: {
          ...this.twitchState,
          joinedChannels: [...this.twitchState.joinedChannels],
        },
        tiktok: { ...defaultProviderState(), available: false },
      },
    };
  }

  private emitStateChanged() {
    const state = this.getState();
    this.emit("state-changed", state);
    observerService.publish(
      ObserverChannels.LIVE_CHAT_STATE_CHANGED,
      { state },
      "LIVE_CHAT_SERVICE",
    );
  }

  private emitSettingsChanged() {
    observerService.publish(
      ObserverChannels.LIVE_CHAT_SETTINGS_CHANGED,
      { settings: this.getSettings() },
      "LIVE_CHAT_SERVICE",
    );
  }

  private normalizeError(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : String(error || "Live chat connection failed.");
  }

  private toSerializable(value: unknown): unknown {
    if (
      value == null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  private emitProviderEvent(
    provider: LiveChatProvider,
    event: string,
    args: unknown[],
    extra?: Partial<LiveChatEvent>,
  ) {
    const payload: LiveChatEvent = {
      id: String(extra?.tags?.id || randomUUID()),
      provider,
      event,
      timestamp: Date.now(),
      args: args.map((value) => this.toSerializable(value)),
      ...extra,
    };
    this.emit(provider, payload);
    this.emit("all", payload);
    const normalizedChannel = String(payload.channel || "")
      .replace(/^#/, "")
      .toLowerCase();
    if (
      !NOISY_OR_ALIAS_EVENTS.has(event) &&
      !this.disabledEventChannels.has(normalizedChannel)
    ) {
      this.emit("event", payload);
    }
  }

  private attachTwitchEvents(client: InstanceType<typeof tmi.Client>) {
    client.on(
      "message",
      (
        channel: string,
        tags: TwitchChatTags,
        message: string,
        self: boolean,
      ) => {
        this.emitProviderEvent(
          "twitch",
          "message",
          [channel, tags, message, self],
          {
            channel: String(channel || "").replace(/^#/, ""),
            tags: { ...tags },
            message: String(message ?? ""),
            self: Boolean(self),
          },
        );
      },
    );

    TWITCH_EVENTS.forEach((eventName) => {
      client.on(eventName, (...args: unknown[]) => {
        if (client !== this.twitchClient) return;
        if (eventName === "connected") {
          this.twitchState = {
            connected: true,
            connecting: false,
            reconnecting: false,
            joinedChannels: client
              .getChannels()
              .map((channel) => channel.replace(/^#/, "")),
            lastError: null,
          };
          this.emitStateChanged();
        } else if (eventName === "connecting" || eventName === "reconnect") {
          this.twitchState = {
            ...this.twitchState,
            connecting: true,
            reconnecting: eventName === "reconnect",
          };
          this.emitStateChanged();
        } else if (eventName === "disconnected") {
          this.twitchState = {
            ...defaultProviderState(),
            reconnecting:
              !this.manualDisconnect && this.getSettings().twitch.reconnect,
            lastError: typeof args[0] === "string" ? args[0] : null,
          };
          this.emitStateChanged();
        } else if (eventName === "join" || eventName === "part") {
          this.twitchState = {
            ...this.twitchState,
            joinedChannels: client
              .getChannels()
              .map((channel) => channel.replace(/^#/, "")),
          };
          this.emitStateChanged();
        }
        const first =
          typeof args[0] === "string"
            ? String(args[0]).replace(/^#/, "")
            : undefined;
        this.emitProviderEvent("twitch", eventName, args, {
          ...(first ? { channel: first } : {}),
        });
      });
    });
  }

  public async updateSettings(
    patch: LiveChatSettingsPatch,
  ): Promise<LiveChatCommandResult> {
    const stored = this.readStoredSettings();
    const current = this.getSettings();
    const next: StoredLiveChatSettings = {
      ...stored,
      enabled: patch.enabled ?? current.enabled,
      twitch: { ...stored.twitch },
      tiktok: { ...stored.tiktok, enabled: false },
      overlay: {
        ...current.overlay,
        ...patch.overlay,
        backgroundPresets: this.normalizeBackgroundPresets({
          ...current.overlay.backgroundPresets,
          ...patch.overlay?.backgroundPresets,
        }),
        bounds: { ...current.overlay.bounds, ...patch.overlay?.bounds },
        maxMessages: this.normalizeMaxMessages(
          patch.overlay?.maxMessages ?? current.overlay.maxMessages,
        ),
      },
    };

    if (patch.twitch) {
      const channels = this.normalizeChannels(
        patch.twitch.channels ?? current.twitch.channels,
      );
      next.twitch = {
        ...stored.twitch,
        enabled: patch.twitch.enabled ?? current.twitch.enabled,
        anonymous: patch.twitch.anonymous ?? current.twitch.anonymous,
        username: String(
          patch.twitch.username ?? current.twitch.username,
        ).trim(),
        channels,
        channelOverrides: this.normalizeChannelOverrides(
          patch.twitch.channelOverrides ?? current.twitch.channelOverrides,
          channels,
        ),
        reconnect: patch.twitch.reconnect ?? current.twitch.reconnect,
      };
      if (patch.twitch.clearPassword) next.twitch.passwordEncrypted = "";
      if (
        typeof patch.twitch.password === "string" &&
        patch.twitch.password.trim()
      ) {
        next.twitch.passwordEncrypted = this.encodeSecret(
          patch.twitch.password.trim(),
        );
      }
    }

    Settings.set("liveChat", next);
    this.emitSettingsChanged();

    const updated = this.getSettings();
    this.syncChannelEventFilters(updated);
    this.deleteReplacedBackground(
      current.overlay.background,
      updated.overlay.background,
    );
    const connectionChanged =
      updated.twitch.enabled !== current.twitch.enabled ||
      updated.twitch.anonymous !== current.twitch.anonymous ||
      updated.twitch.username !== current.twitch.username ||
      updated.twitch.reconnect !== current.twitch.reconnect ||
      updated.twitch.channels.join("|") !== current.twitch.channels.join("|") ||
      Boolean(patch.twitch?.clearPassword) ||
      Boolean(patch.twitch?.password?.trim());
    if (!updated.enabled || !updated.twitch.enabled) {
      await this.disconnect("twitch");
    } else if (this.twitchClient && connectionChanged) {
      await this.disconnect("twitch");
      await this.connect("twitch");
    } else {
      this.emitStateChanged();
    }

    return {
      ok: true,
      message: "Live chat settings updated.",
      code: "live_chat.result.settings_updated",
    };
  }

  public async connect(
    provider: LiveChatProvider = "twitch",
  ): Promise<LiveChatCommandResult> {
    if (provider !== "twitch")
      return {
        ok: false,
        message: "This provider is not available yet.",
        code: "live_chat.result.provider_unavailable",
      };
    const settings = this.getSettings();
    this.syncChannelEventFilters(settings);
    if (!settings.enabled)
      return {
        ok: false,
        message: "Enable live chat before connecting.",
        code: "live_chat.result.enable_service",
      };
    if (!settings.twitch.enabled)
      return {
        ok: false,
        message: "Enable Twitch before connecting.",
        code: "live_chat.result.enable_twitch",
      };
    if (settings.twitch.channels.length === 0)
      return {
        ok: false,
        message: "Add at least one Twitch channel.",
        code: "live_chat.result.add_channel",
      };
    if (this.twitchState.connected)
      return {
        ok: true,
        message: "Twitch is already connected.",
        code: "live_chat.result.already_connected",
      };
    if (this.twitchState.connecting)
      return {
        ok: false,
        message: "Twitch connection is already in progress.",
        code: "live_chat.result.connection_in_progress",
      };

    const password = this.getPassword();
    if (
      !settings.twitch.anonymous &&
      (!settings.twitch.username || !password)
    ) {
      return {
        ok: false,
        message:
          "Username and password are required when anonymous mode is disabled.",
        code: "live_chat.result.credentials_required",
      };
    }

    this.manualDisconnect = false;
    this.twitchState = { ...defaultProviderState(), connecting: true };
    this.emitStateChanged();

    const client = new tmi.Client({
      connection: { secure: true, reconnect: settings.twitch.reconnect },
      channels: settings.twitch.channels,
      ...(settings.twitch.anonymous
        ? {}
        : {
            identity: { username: settings.twitch.username, password },
          }),
    });
    this.twitchClient = client;
    this.attachTwitchEvents(client);

    try {
      await client.connect();
      logsService.log("app", "live-chat.twitch.connect.success", {
        channels: settings.twitch.channels,
      });
      return {
        ok: true,
        message: "Connected to Twitch chat.",
        code: "live_chat.result.connected",
      };
    } catch (error) {
      const message = this.normalizeError(error);
      if (this.twitchClient === client) this.twitchClient = null;
      client.removeAllListeners();
      this.twitchState = { ...defaultProviderState(), lastError: message };
      this.emitStateChanged();
      logsService.log(
        "app",
        "live-chat.twitch.connect.error",
        { error: message },
        "error",
      );
      return { ok: false, message };
    }
  }

  public async disconnect(
    provider: LiveChatProvider = "twitch",
  ): Promise<LiveChatCommandResult> {
    if (provider !== "twitch")
      return {
        ok: true,
        message: "Provider disconnected.",
        code: "live_chat.result.provider_disconnected",
      };
    this.manualDisconnect = true;
    const client = this.twitchClient;
    this.twitchClient = null;
    if (client) {
      try {
        await client.disconnect();
      } catch {
        /* already disconnected */
      }
      client.removeAllListeners();
    }
    this.twitchState = defaultProviderState();
    this.emitStateChanged();
    return {
      ok: true,
      message: "Disconnected from Twitch chat.",
      code: "live_chat.result.disconnected",
    };
  }

  public async connectOnStartupIfNeeded() {
    const settings = this.getSettings();
    if (!settings.enabled || !settings.twitch.enabled)
      return {
        ok: true,
        message: "Live chat is disabled.",
        code: "live_chat.result.service_disabled",
      };
    return this.connect("twitch");
  }
}
