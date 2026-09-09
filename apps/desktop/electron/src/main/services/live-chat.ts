import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import tmi from "tmi.js";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";
import { observerService, ObserverChannels } from "./observer.js";
import { TikTokLiveChatProvider } from "./live-chat/tiktok-provider.js";
import type {
  LiveChatCommandResult,
  LiveChatChannelAppearance,
  LiveChatEvent,
  LiveChatProvider,
  LiveChatOverlayScope,
  LiveChatOverlayScopeState,
  LiveChatProviderState,
  LiveChatSettings,
  LiveChatSettingsPatch,
  LiveChatProviderDisplaySettings,
  TikTokLiveChatDisplaySettings,
  TikTokLiveChatAccountAppearance,
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
    display?: Partial<LiveChatSettings["twitch"]["display"]>;
  };
  tiktok?: {
    enabled?: boolean;
    accounts?: string[];
    accountOverrides?: Record<string, Partial<TikTokLiveChatAccountAppearance>>;
    autoConnectAccounts?: boolean;
    reconnect?: boolean;
    offlineCheckIntervalSeconds?: number;
    display?: Partial<TikTokLiveChatDisplaySettings>;
  };
  overlay?: LiveChatSettings["overlay"] & {
    showSelfMessages?: boolean;
    showTimestamp?: boolean;
    showAvatar?: boolean;
    showBadges?: boolean;
    showProvider?: boolean;
    showChannel?: boolean;
  };
};

const OVERLAY_SCOPES: LiveChatOverlayScope[] = ["combined", "twitch", "tiktok"];

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
  "follow",
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
  waitingForLive: false,
  joinedChannels: [],
  lastError: null,
});

export class LiveChatService extends EventEmitter {
  private twitchClient: InstanceType<typeof tmi.Client> | null = null;
  private twitchState: LiveChatProviderState = defaultProviderState();
  private manualDisconnect = false;
  private disabledEventChannels = new Set<string>();
  private readonly tiktokProvider: TikTokLiveChatProvider;

  constructor() {
    super();
    this.tiktokProvider = new TikTokLiveChatProvider({
      getSettings: () => {
        const settings = this.getSettings();
        return { enabled: settings.enabled, tiktok: settings.tiktok };
      },
      emitEvent: (event, args, extra) =>
        this.emitProviderEvent("tiktok", event, args, extra),
      emitStateChanged: () => this.emitStateChanged(),
      log: (event, data, level = "info") =>
        logsService.log("liveChat", event, data, level),
    });
  }

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

  private normalizeTikTokAccounts(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [];
    return [
      ...new Set(
        values
          .map((item) =>
            String(item ?? "")
              .trim()
              .replace(/^https?:\/\/(?:www\.)?tiktok\.com\/@/i, "")
              .replace(/\/live\/?$/i, "")
              .replace(/^@/, "")
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
  }

  private normalizeTikTokOverrides(
    value: unknown,
    accounts: string[],
  ): Record<string, TikTokLiveChatAccountAppearance> {
    const source =
      value && typeof value === "object"
        ? (value as Record<string, Partial<TikTokLiveChatAccountAppearance>>)
        : {};
    return Object.fromEntries(
      accounts.map((account) => {
        const current = source[account] ?? {};
        return [
          account,
          {
            label: String(current.label ?? "").trim().slice(0, 80),
            icon: String(current.icon ?? "").trim().slice(0, 2048) || null,
            eventsEnabled: current.eventsEnabled !== false,
            waitForLive: current.waitForLive !== false,
          },
        ];
      }),
    );
  }

  private normalizeDisplay(
    value: unknown,
    legacy: StoredLiveChatSettings["overlay"],
  ): LiveChatProviderDisplaySettings {
    const current =
      value && typeof value === "object"
        ? (value as Partial<LiveChatProviderDisplaySettings>)
        : {};
    return {
      showTimestamp: current.showTimestamp ?? legacy?.showTimestamp !== false,
      showAvatar: current.showAvatar ?? legacy?.showAvatar !== false,
      showBadges: current.showBadges ?? legacy?.showBadges !== false,
      showProvider: current.showProvider ?? legacy?.showProvider !== false,
      showChannel: current.showChannel ?? legacy?.showChannel !== false,
      showJoinEvents: current.showJoinEvents ?? true,
      showFollowEvents: current.showFollowEvents ?? true,
    };
  }

  private normalizeOverlayScopeStates(
    value: unknown,
    legacy?: {
      paused?: boolean;
      locked?: boolean;
      alwaysOnTop?: boolean;
    },
  ): Record<LiveChatOverlayScope, LiveChatOverlayScopeState> {
    const source =
      value && typeof value === "object"
        ? (value as Record<string, Partial<LiveChatOverlayScopeState>>)
        : {};
    const fallback = {
      paused: Boolean(legacy?.paused),
      locked: Boolean(legacy?.locked),
      alwaysOnTop: legacy?.alwaysOnTop !== false,
    };
    return Object.fromEntries(
      OVERLAY_SCOPES.map((scope) => {
        const current = source[scope] ?? {};
        return [
          scope,
          {
            paused: current.paused ?? fallback.paused,
            locked: current.locked ?? fallback.locked,
            alwaysOnTop: current.alwaysOnTop ?? fallback.alwaysOnTop,
          },
        ];
      }),
    ) as Record<LiveChatOverlayScope, LiveChatOverlayScopeState>;
  }

  private normalizeTikTokDisplay(
    value: unknown,
    legacy: StoredLiveChatSettings["overlay"],
  ): TikTokLiveChatDisplaySettings {
    const base = this.normalizeDisplay(value, legacy);
    const current =
      value && typeof value === "object"
        ? (value as Partial<TikTokLiveChatDisplaySettings>)
        : {};
    return {
      ...base,
      showLikeEvents: current.showLikeEvents ?? true,
      showGiftEvents: current.showGiftEvents ?? true,
    };
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
      [
        "transparent",
        "color",
        "image",
        "video",
        "neural",
        "nebula",
        "particles",
      ].includes(
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
    for (const variant of ["color", "neural", "nebula", "particles"] as const) {
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
        "liveChat",
        "live-chat.background.cleanup.error",
        { error: this.normalizeError(error), previousUrl },
        "warn",
      );
    }
  }

  private syncChannelEventFilters(settings: LiveChatSettings) {
    this.disabledEventChannels = new Set(
      [
        ...settings.twitch.channels
          .filter(
            (channel) =>
              settings.twitch.channelOverrides[channel]?.eventsEnabled === false,
          )
          .map((channel) => `twitch:${channel}`),
        ...settings.tiktok.accounts
          .filter(
            (account) =>
              settings.tiktok.accountOverrides[account]?.eventsEnabled === false,
          )
          .map((account) => `tiktok:${account}`),
      ],
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
    const accounts = this.normalizeTikTokAccounts(stored.tiktok?.accounts);
    const twitchDisplay = {
      ...this.normalizeDisplay(stored.twitch?.display, stored.overlay),
      showSelfMessages:
        stored.twitch?.display?.showSelfMessages ??
        Boolean(stored.overlay?.showSelfMessages),
    };
    const scopeStates = this.normalizeOverlayScopeStates(
      stored.overlay?.scopeStates,
      stored.overlay,
    );
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
        display: twitchDisplay,
      },
      tiktok: {
        enabled: Boolean(stored.tiktok?.enabled),
        available: true,
        accounts,
        accountOverrides: this.normalizeTikTokOverrides(
          stored.tiktok?.accountOverrides,
          accounts,
        ),
        autoConnectAccounts: stored.tiktok?.autoConnectAccounts !== false,
        reconnect: stored.tiktok?.reconnect !== false,
        offlineCheckIntervalSeconds: Math.max(
          30,
          Number(stored.tiktok?.offlineCheckIntervalSeconds) || 30,
        ),
        display: this.normalizeTikTokDisplay(stored.tiktok?.display, stored.overlay),
      },
      overlay: {
        mode: stored.overlay?.mode === "separate" ? "separate" : "combined",
        paused: scopeStates.combined.paused,
        locked: scopeStates.combined.locked,
        alwaysOnTop: scopeStates.combined.alwaysOnTop,
        scopeStates,
        maxMessages: this.normalizeMaxMessages(
          stored.overlay?.maxMessages ?? 200,
        ),
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
        tiktok: this.tiktokProvider.getState(),
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
      !this.disabledEventChannels.has(`${provider}:${normalizedChannel}`)
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
            author: {
              id: String(tags["user-id"] ?? "") || undefined,
              username: String(tags.username ?? tags["display-name"] ?? "unknown"),
              displayName: String(tags["display-name"] ?? tags.username ?? "unknown"),
              color: String(tags.color ?? "") || undefined,
              badges: Object.entries(tags.badges ?? {}).map(([name, version]) => ({
                name,
                version,
              })),
            },
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
            waitingForLive: false,
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
    const legacyOverlay = {
      paused: patch.overlay?.paused ?? current.overlay.paused,
      locked: patch.overlay?.locked ?? current.overlay.locked,
      alwaysOnTop:
        patch.overlay?.alwaysOnTop ?? current.overlay.alwaysOnTop,
    };
    const patchedScopeStates = Object.fromEntries(
      OVERLAY_SCOPES.map((scope) => [
        scope,
        {
          ...current.overlay.scopeStates[scope],
          ...(patch.overlay?.scopeStates?.[scope] ?? {}),
        },
      ]),
    ) as Record<LiveChatOverlayScope, Partial<LiveChatOverlayScopeState>>;
    if (patch.overlay?.paused !== undefined)
      patchedScopeStates.combined.paused = patch.overlay.paused;
    if (patch.overlay?.locked !== undefined)
      patchedScopeStates.combined.locked = patch.overlay.locked;
    if (patch.overlay?.alwaysOnTop !== undefined)
      patchedScopeStates.combined.alwaysOnTop = patch.overlay.alwaysOnTop;
    const scopeStates = this.normalizeOverlayScopeStates(
      patchedScopeStates,
      legacyOverlay,
    );
    const next: StoredLiveChatSettings = {
      ...stored,
      enabled: patch.enabled ?? current.enabled,
      twitch: { ...stored.twitch },
      tiktok: { ...stored.tiktok },
      overlay: {
        ...current.overlay,
        ...patch.overlay,
        paused: scopeStates.combined.paused,
        locked: scopeStates.combined.locked,
        alwaysOnTop: scopeStates.combined.alwaysOnTop,
        scopeStates,
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
        display: {
          ...current.twitch.display,
          ...patch.twitch.display,
        },
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

    if (patch.tiktok) {
      const accounts = this.normalizeTikTokAccounts(
        patch.tiktok.accounts ?? current.tiktok.accounts,
      );
      next.tiktok = {
        ...stored.tiktok,
        enabled: patch.tiktok.enabled ?? current.tiktok.enabled,
        accounts,
        accountOverrides: this.normalizeTikTokOverrides(
          patch.tiktok.accountOverrides ?? current.tiktok.accountOverrides,
          accounts,
        ),
        autoConnectAccounts:
          patch.tiktok.autoConnectAccounts ?? current.tiktok.autoConnectAccounts,
        reconnect: patch.tiktok.reconnect ?? current.tiktok.reconnect,
        offlineCheckIntervalSeconds: Math.max(
          30,
          Number(
            patch.tiktok.offlineCheckIntervalSeconds ??
              current.tiktok.offlineCheckIntervalSeconds,
          ) || 30,
        ),
        display: {
          ...current.tiktok.display,
          ...patch.tiktok.display,
        },
      };
    }

    Settings.set("liveChat", next);
    this.emitSettingsChanged();

    const updated = this.getSettings();
    const twitchWasActive = Boolean(
      this.twitchClient ||
      this.twitchState.connected ||
      this.twitchState.connecting ||
      this.twitchState.reconnecting,
    );
    const twitchPasswordChanged = Boolean(
      patch.twitch?.clearPassword ||
      (typeof patch.twitch?.password === "string" &&
        patch.twitch.password.trim()),
    );
    const twitchConnectionSettingsChanged = Boolean(
      patch.twitch &&
      (JSON.stringify(updated.twitch.channels) !==
        JSON.stringify(current.twitch.channels) ||
        updated.twitch.anonymous !== current.twitch.anonymous ||
        updated.twitch.username !== current.twitch.username ||
        updated.twitch.reconnect !== current.twitch.reconnect ||
        twitchPasswordChanged),
    );
    const shouldRestartTwitch = Boolean(
      twitchWasActive &&
      updated.enabled &&
      updated.twitch.enabled &&
      twitchConnectionSettingsChanged,
    );
    this.syncChannelEventFilters(updated);
    await this.tiktokProvider.reconcileAccounts(updated.tiktok.accounts);
    this.tiktokProvider.reconcileSettings();
    const serviceBecameEnabled = patch.enabled === true && !current.enabled;
    const providerBecameEnabled =
      patch.tiktok?.enabled === true && !current.tiktok.enabled;
    const autoConnectBecameEnabled =
      patch.tiktok?.autoConnectAccounts === true &&
      !current.tiktok.autoConnectAccounts;
    const shouldAutoConnectTiktok =
      updated.enabled &&
      updated.tiktok.enabled &&
      updated.tiktok.autoConnectAccounts;
    const shouldConnectAllTiktok =
      shouldAutoConnectTiktok &&
      (serviceBecameEnabled || providerBecameEnabled || autoConnectBecameEnabled);
    const addedTiktokAccounts = updated.tiktok.accounts.filter(
      (account) => !current.tiktok.accounts.includes(account),
    );
    this.deleteReplacedBackground(
      current.overlay.background,
      updated.overlay.background,
    );
    if (patch.enabled === false) {
      await Promise.all([
        this.disconnect("twitch"),
        this.tiktokProvider.disconnectAutomatically(),
      ]);
    } else if (patch.enabled === true && !current.enabled) {
      await Promise.all([
        updated.twitch.enabled ? this.connect("twitch") : Promise.resolve(null),
        shouldAutoConnectTiktok
          ? this.tiktokProvider.connectAutomatically()
          : Promise.resolve(null),
      ]);
    } else {
      if (patch.twitch?.enabled === false) await this.disconnect("twitch");
      if (patch.twitch?.enabled === true && !current.twitch.enabled)
        await this.connect("twitch");
      else if (shouldRestartTwitch) {
        logsService.log("liveChat", "live-chat.twitch.restart.settings", {
          previousChannels: current.twitch.channels,
          channels: updated.twitch.channels,
        });
        await this.disconnect("twitch");
        await this.connect("twitch");
      }
      if (patch.tiktok?.enabled === false)
        await this.tiktokProvider.disconnectAutomatically();
      if (shouldConnectAllTiktok)
        await this.tiktokProvider.connectAutomatically();
      else if (
        shouldAutoConnectTiktok &&
        patch.tiktok?.accounts !== undefined &&
        addedTiktokAccounts.length > 0
      ) {
        await Promise.all(
          addedTiktokAccounts.map((account) =>
            this.tiktokProvider.connectAutomatically(account),
          ),
        );
      }
      this.emitStateChanged();
    }

    return {
      ok: true,
      message: "Live chat settings updated.",
      code: "live_chat.result.settings_updated",
    };
  }

  private async syncConnectedTwitchChannels(channels: string[]) {
    const client = this.twitchClient;
    if (!client) return;

    const connected = new Set(
      client.getChannels().map((channel) => channel.replace(/^#/, "")),
    );
    const desired = new Set(channels);

    for (const channel of connected) {
      if (desired.has(channel)) continue;
      try {
        await client.part(channel);
      } catch (error) {
        logsService.log(
          "liveChat",
          "live-chat.twitch.channel.part.error",
          { channel, error: this.normalizeError(error) },
          "error",
        );
      }
    }

    for (const channel of desired) {
      if (connected.has(channel)) continue;
      try {
        await client.join(channel);
      } catch (error) {
        logsService.log(
          "liveChat",
          "live-chat.twitch.channel.join.error",
          { channel, error: this.normalizeError(error) },
          "error",
        );
      }
    }
  }

  public async connect(
    provider: LiveChatProvider = "twitch",
    source?: string,
  ): Promise<LiveChatCommandResult> {
    if (provider === "tiktok") return this.tiktokProvider.connect(source);
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
      logsService.log("liveChat", "live-chat.twitch.connect.success", {
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
        "liveChat",
        "live-chat.twitch.connect.error",
        { error: message },
        "error",
      );
      return { ok: false, message };
    }
  }

  public async disconnect(
    provider: LiveChatProvider = "twitch",
    source?: string,
  ): Promise<LiveChatCommandResult> {
    if (provider === "tiktok") return this.tiktokProvider.disconnect(source);
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
    if (!settings.enabled)
      return {
        ok: true,
        message: "Live chat is disabled.",
        code: "live_chat.result.service_disabled",
      };
    const results = await Promise.all([
      settings.twitch.enabled ? this.connect("twitch") : Promise.resolve(null),
      settings.tiktok.enabled && settings.tiktok.autoConnectAccounts
        ? this.tiktokProvider.connectAutomatically()
        : Promise.resolve(null),
    ]);
    return (
      results.find((result) => result && !result.ok) ??
      results.find((result) => result) ?? {
        ok: true,
        message: "Live chat providers are disabled.",
        code: "live_chat.result.service_disabled",
      }
    );
  }
}
