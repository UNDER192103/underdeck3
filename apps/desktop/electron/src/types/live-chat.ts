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

export type TwitchLiveChatSettings = {
  enabled: boolean;
  anonymous: boolean;
  username: string;
  hasPassword: boolean;
  channels: string[];
  channelOverrides: Record<string, LiveChatChannelAppearance>;
  reconnect: boolean;
};

export type TikTokLiveChatSettings = {
  enabled: boolean;
  available: false;
};

export type LiveChatOverlaySettings = {
  mode: LiveChatOverlayMode;
  paused: boolean;
  locked: boolean;
  alwaysOnTop: boolean;
  maxMessages: number;
  showSelfMessages: boolean;
  showTimestamp: boolean;
  showBadges: boolean;
  showProvider: boolean;
  showChannel: boolean;
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
  twitch?: Partial<Omit<TwitchLiveChatSettings, "hasPassword">> & {
    password?: string;
    clearPassword?: boolean;
  };
  tiktok?: Partial<TikTokLiveChatSettings>;
  overlay?: Partial<Omit<LiveChatOverlaySettings, "bounds">> & {
    bounds?: Partial<Record<LiveChatOverlayScope, LiveChatWindowBounds>>;
  };
};

export type LiveChatProviderState = {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  joinedChannels: string[];
  lastError: string | null;
};

export type LiveChatState = {
  enabled: boolean;
  settings: LiveChatSettings;
  providers: {
    twitch: LiveChatProviderState;
    tiktok: LiveChatProviderState & { available: false };
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
