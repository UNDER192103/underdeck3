import type { StoredThemeBackground, ThemeEffectBackgrounds } from "./theme.js";

export type LiveChatProvider = "twitch" | "tiktok";
export type LiveChatOverlayScope = "combined" | LiveChatProvider;
export type LiveChatOverlayMode = "combined" | "separate";

export type LiveChatWindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

export type LiveChatChannelAppearance = {
  label: string;
  icon: string | null;
  eventsEnabled: boolean;
};

export type LiveChatProviderDisplaySettings = {
  showTimestamp: boolean;
  showAvatar: boolean;
  showBadges: boolean;
  showProvider: boolean;
  showChannel: boolean;
  showJoinEvents: boolean;
  showFollowEvents: boolean;
};

export type TwitchLiveChatDisplaySettings = LiveChatProviderDisplaySettings & {
  showSelfMessages: boolean;
};

export type TikTokLiveChatAccountAppearance = LiveChatChannelAppearance & {
  waitForLive: boolean;
};

export type TikTokLiveChatDisplaySettings = LiveChatProviderDisplaySettings & {
  showLikeEvents: boolean;
  showGiftEvents: boolean;
};

export type TwitchLiveChatSettings = {
  enabled: boolean;
  anonymous: boolean;
  username: string;
  hasPassword: boolean;
  channels: string[];
  channelOverrides: Record<string, LiveChatChannelAppearance>;
  reconnect: boolean;
  display: TwitchLiveChatDisplaySettings;
};

export type TikTokLiveChatSettings = {
  enabled: boolean;
  available: true;
  accounts: string[];
  accountOverrides: Record<string, TikTokLiveChatAccountAppearance>;
  reconnect: boolean;
  offlineCheckIntervalSeconds: number;
  display: TikTokLiveChatDisplaySettings;
};

export type LiveChatOverlaySettings = {
  mode: LiveChatOverlayMode;
  paused: boolean;
  locked: boolean;
  alwaysOnTop: boolean;
  maxMessages: number;
  background: StoredThemeBackground;
  backgroundPresets: ThemeEffectBackgrounds;
  openScopes: LiveChatOverlayScope[];
  bounds: Partial<Record<LiveChatOverlayScope, LiveChatWindowBounds>>;
};

export type LiveChatSettings = {
  enabled: boolean;
  twitch: TwitchLiveChatSettings;
  tiktok: TikTokLiveChatSettings;
  overlay: LiveChatOverlaySettings;
};

export type LiveChatSettingsPatch = {
  enabled?: boolean;
  twitch?: Partial<Omit<TwitchLiveChatSettings, "hasPassword" | "display">> & {
    display?: Partial<TwitchLiveChatDisplaySettings>;
    password?: string;
    clearPassword?: boolean;
  };
  tiktok?: Partial<Omit<TikTokLiveChatSettings, "display">> & {
    display?: Partial<TikTokLiveChatDisplaySettings>;
  };
  overlay?: Partial<Omit<LiveChatOverlaySettings, "bounds">> & {
    bounds?: Partial<Record<LiveChatOverlayScope, LiveChatWindowBounds>>;
  };
};

export type LiveChatProviderState = {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  waitingForLive: boolean;
  joinedChannels: string[];
  lastError: string | null;
};

export type TikTokLiveChatAccountState = LiveChatProviderState & {
  account: string;
};

export type LiveChatState = {
  enabled: boolean;
  settings: LiveChatSettings;
  providers: {
    twitch: LiveChatProviderState;
    tiktok: LiveChatProviderState & {
      available: true;
      accounts: Record<string, TikTokLiveChatAccountState>;
    };
  };
};

export type TwitchChatTags = Record<string, unknown> & {
  id?: string;
  color?: string;
  badges?: Record<string, string>;
  emotes?: Record<string, string[]>;
  username?: string;
  "display-name"?: string;
  "room-id"?: string;
  "message-type"?: string;
  "user-id"?: string;
};

export type LiveChatEvent = {
  id: string;
  provider: LiveChatProvider;
  event: string;
  timestamp: number;
  channel?: string;
  message?: string;
  self?: boolean;
  author?: {
    id?: string;
    username: string;
    displayName: string;
    color?: string;
    avatarUrl?: string | null;
    badges?: unknown[];
  };
  channelAvatarUrl?: string | null;
  tags?: TwitchChatTags;
  args?: unknown[];
};

export type LiveChatCommandResult = {
  ok: boolean;
  message: string;
  code?: string;
};

export type LiveChatOverlayWindowState = {
  open: boolean;
  scope: LiveChatOverlayScope;
  paused: boolean;
  locked: boolean;
  alwaysOnTop: boolean;
};
