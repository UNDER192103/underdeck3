import type { App, AppShortcutRequest, AppShortcutResult } from "./apps";
import type { AppCategory } from "./categories";
import type { WebPage, WebPageShortcutRequest, WebPageShortcutResult, WebPagesSettings } from "./webpages";
import type { Shortcut } from "./shortcuts";

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface SelectFileOptions {
  title?: string;
  buttonLabel?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
  includeDirectories?: boolean;
  allowMultiple?: boolean;
  showHiddenFiles?: boolean;
}

export interface SaveFileOptions {
  title?: string;
  buttonLabel?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
  nameFieldLabel?: string;
  message?: string;
}

export type SavedThemeSource = "local" | "store";
export type StoredThemeName = "ligth" | "dark" | "black" | "transparent";
export type StoredThemeBackground =
  | { variant: "transparent" }
  | {
      variant: "neural";
      neuralColors?: { center?: string; middle?: string; edge?: string; link?: string; dot?: string };
    }
  | { variant: "image"; imageSrc: string }
  | { variant: "video"; videoSrc: string }
  | {
      variant: "nebula";
      nebulaColor?: string;
      nebulaExplosionColor?: string;
      nebulaBackgroundStart?: string;
      nebulaBackgroundEnd?: string;
    }
  | { variant: "particles"; particleColor?: string; particleBackgroundColor?: string; particleCount?: number }
  | { variant: "color"; backgroundColor?: string; colorMode?: "fixed" | "gradient" | "loop"; backgroundColors?: string[]; gradientAngle?: number; loopTransitionDurationMs?: number };

export type ThemeEffectBackgrounds = Partial<{
  neural: Extract<StoredThemeBackground, { variant: "neural" }>;
  nebula: Extract<StoredThemeBackground, { variant: "nebula" }>;
  particles: Extract<StoredThemeBackground, { variant: "particles" }>;
  color: Extract<StoredThemeBackground, { variant: "color" }>;
}>;

export interface ThemePreferences {
  theme: StoredThemeName;
  background: StoredThemeBackground;
  effectBackgrounds: ThemeEffectBackgrounds;
}

export interface SavedThemeWallpaper {
  key: string;
  itemId: string;
  name: string;
  source: SavedThemeSource;
  remoteUrl: string;
  mediaUrl: string;
  relativePath: string;
  mediaType: string | null;
  createdAt: number;
  exists: boolean;
}

export interface ThemeDownloadRequest {
  itemId: string;
  name: string;
  remoteUrl: string;
  mediaType?: string | null;
}

export interface ThemeDownloadProgress {
  jobId: string;
  itemId: string;
  name: string;
  status: "queued" | "downloading" | "completed" | "failed";
  progress: number;
  bytesReceived: number;
  totalBytes: number | null;
  mediaUrl?: string;
  error?: string;
}

export interface ThemePreferencesChangedPayload {
  sourceId: string;
  timestamp: number;
}

export interface ObserverEventPayload {
  id: string;
  channel: string;
  origin?: string;
  data?: unknown;
  sourceId: string;
  timestamp: number;
}

export interface SoundPadAudio {
  index: number;
  addedOn: string;
  artist: string;
  name: string;
  duration: string;
  hash: string;
  path: string;
}

export interface SoundPadExecResult {
  ok: boolean;
  message: string;
}

export interface SoundPadVerifyResult {
  ok: boolean;
  message: string;
}

export interface ObsSettings {
  connectOnStartup: boolean;
  autoDetect: boolean;
  host: string;
  port: number;
  password: string;
}

export interface ObsResolvedConfig {
  host: string;
  port: number;
  password: string;
  source: "manual" | "auto";
}

export interface ObsScene {
  sceneName: string;
  sceneIndex: number;
  isCurrentProgram: boolean;
}

export interface ObsAudioInput {
  inputName: string;
  inputUuid: string;
  inputKind: string;
  inputMuted: boolean;
  inputVolumeDb: number;
  inputVolumeMul: number;
  canSetVolume: boolean;
}

export interface ObsState {
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
}

export interface ObsCommandResult {
  ok: boolean;
  message: string;
}

export interface DiscordSettings {
  connectOnStartup: boolean;
  clientId: string;
  hasClientSecret: boolean;
  hasAccessToken: boolean;
}

export interface DiscordProfile {
  id: string;
  username: string;
  globalName: string;
  avatarUrl: string | null;
}

export interface DiscordApplication {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface DiscordState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  user: DiscordProfile | null;
  application: DiscordApplication | null;
  voice: { mute: boolean; deaf: boolean };
  lastError: string | null;
  settings: DiscordSettings;
}

export interface DiscordCommandResult {
  ok: boolean;
  message: string;
}

export type LiveChatProvider = "twitch" | "tiktok";
export type LiveChatOverlayScope = "combined" | LiveChatProvider;
export type LiveChatOverlayMode = "combined" | "separate";
export interface LiveChatWindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}
export interface LiveChatChannelAppearance {
  label: string;
  icon: string | null;
  eventsEnabled: boolean;
}
export interface LiveChatProviderDisplaySettings {
  showTimestamp: boolean;
  showAvatar: boolean;
  showBadges: boolean;
  showProvider: boolean;
  showChannel: boolean;
  showJoinEvents: boolean;
  showFollowEvents: boolean;
}
export interface TikTokLiveChatAccountAppearance extends LiveChatChannelAppearance {
  waitForLive: boolean;
}
export interface TikTokLiveChatDisplaySettings extends LiveChatProviderDisplaySettings {
  showLikeEvents: boolean;
  showGiftEvents: boolean;
}
export interface TwitchLiveChatSettings {
  enabled: boolean;
  anonymous: boolean;
  username: string;
  hasPassword: boolean;
  channels: string[];
  channelOverrides: Record<string, LiveChatChannelAppearance>;
  reconnect: boolean;
  display: LiveChatProviderDisplaySettings & { showSelfMessages: boolean };
}
export interface TikTokLiveChatSettings {
  enabled: boolean;
  available: true;
  accounts: string[];
  accountOverrides: Record<string, TikTokLiveChatAccountAppearance>;
  autoConnectAccounts: boolean;
  reconnect: boolean;
  offlineCheckIntervalSeconds: number;
  display: TikTokLiveChatDisplaySettings;
}
export interface LiveChatSettings {
  enabled: boolean;
  twitch: TwitchLiveChatSettings;
  tiktok: TikTokLiveChatSettings;
  overlay: {
    mode: LiveChatOverlayMode;
    paused: boolean;
    locked: boolean;
    alwaysOnTop: boolean;
    scopeStates: Record<LiveChatOverlayScope, LiveChatOverlayScopeState>;
    maxMessages: number;
    background: StoredThemeBackground;
    backgroundPresets: ThemeEffectBackgrounds;
    openScopes: LiveChatOverlayScope[];
    bounds: Partial<Record<LiveChatOverlayScope, LiveChatWindowBounds>>;
  };
}
export interface LiveChatSettingsPatch {
  enabled?: boolean;
  twitch?: Partial<Omit<TwitchLiveChatSettings, "hasPassword" | "display">> & {
    display?: Partial<LiveChatProviderDisplaySettings & { showSelfMessages: boolean }>;
    password?: string;
    clearPassword?: boolean;
  };
  tiktok?: Partial<Omit<TikTokLiveChatSettings, "display">> & {
    display?: Partial<TikTokLiveChatDisplaySettings>;
  };
  overlay?: Partial<Omit<LiveChatSettings["overlay"], "bounds" | "scopeStates">> & {
    scopeStates?: Partial<Record<LiveChatOverlayScope, Partial<LiveChatOverlayScopeState>>>;
    bounds?: Partial<Record<LiveChatOverlayScope, LiveChatWindowBounds>>;
  };
}
export interface LiveChatProviderState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  waitingForLive: boolean;
  joinedChannels: string[];
  lastError: string | null;
}
export interface LiveChatState {
  enabled: boolean;
  settings: LiveChatSettings;
  providers: {
    twitch: LiveChatProviderState;
    tiktok: LiveChatProviderState & { available: true; accounts: Record<string, LiveChatProviderState & { account: string }> };
  };
}
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
export interface LiveChatEvent {
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
}
export interface LiveChatCommandResult {
  ok: boolean;
  message: string;
  code?: string;
}
export interface LiveChatOverlayWindowState {
  open: boolean;
  scope: LiveChatOverlayScope;
  paused: boolean;
  locked: boolean;
  alwaysOnTop: boolean;
}

export interface LiveChatOverlayScopeState {
  paused: boolean;
  locked: boolean;
  alwaysOnTop: boolean;
}

export type WebDeckItemType = "back" | "page" | "app" | "soundpad" | "obs" | "discord";

export interface WebDeckItem {
  id: string;
  type: WebDeckItemType;
  refId: string;
  label?: string;
  icon?: string | null;
}

export interface WebDeckPage {
  id: string;
  name: string;
  icon: string | null;
  gridCols: number;
  gridRows: number;
  items: Array<WebDeckItem | null>;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface WebDeckAutoIcons {
  pages: Record<string, string>;
  items: Record<string, string>;
}

export interface WebDeckChangedPayload {
  sourceId: string;
  timestamp: number;
}

export interface ExpressStatusChangedPayload {
  sourceId: string;
  enabled: boolean;
  port: number;
  timestamp: number;
}

export interface UpdateState {
  currentVersion: string;
  checking: boolean;
  updateAvailable: boolean;
  downloading: boolean;
  installing: boolean;
  downloaded: boolean;
  autoDownloadEnabled: boolean;
  availableVersion: string | null;
  downloadPercent: number;
  lastError: string | null;
  lastCheckedAt: number | null;
  lastAvailableReleaseDate: string | null;
  lastUpdatedAt: number | null;
  downloadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number | null;
}

export interface UpdateLoadingState {
  phase: "checking" | "downloading" | "installing" | "loading-app";
  message: string;
  step?: number;
  totalSteps?: number;
  progressPercent?: number;
  version?: string | null;
  bytesDownloaded?: number;
  totalBytes?: number;
  bytesPerSecond?: number | null;
  detail?: string | null;
}

export interface OverlaySettings {
  enabled: boolean;
  keys: string[];
  closeOnBlur: boolean;
}

export interface AppWindowsSettings {
  autoStart: boolean;
  enableNotifications: boolean;
}

export interface AppElectronSettings {
  startMinimized: boolean;
  closeToTray: boolean;
  devTools: boolean;
  openLinksInBrowser: boolean;
}

export interface LogsSettings {
  enabled: boolean;
  app: boolean;
  shortcuts: boolean;
  obs: boolean;
  soundpad: boolean;
  webdeck: boolean;
  webpages: boolean;
  discord: boolean;
  liveChat: boolean;
  socket: boolean;
  updates: boolean;
}

export interface AppDevToolsChangedPayload {
  enabled: boolean;
  timestamp: number;
}

export interface WindowControlState {
  maximized: boolean;
  minimized: boolean;
  fullscreen: boolean;
}

export interface UnderDeckApi {
  system: {
    getDeviceInfo: () => Promise<{ hwid: string; name: string }>;
    makeQrCodeDataUrl: (text: string) => Promise<string | null>;
  };
  i18n: {
    getCurrentLocale: () => Promise<string>;
    setCurrentLocale: (locale: string) => Promise<string>;
    listExternalLocales: () => Promise<Array<{ locale: string; name: string }>>;
    getExternalMessages: (locale: string) => Promise<Record<string, string>>;
    importLocaleFile: (sourcePath: string) => Promise<{ locale: string; name: string }>;
    deleteExternalLocale: (locale: string) => Promise<boolean>;
  };
  apps: {
    list: () => Promise<App[]>;
    add: (app: App) => Promise<App>;
    update: (app: App) => Promise<App | null>;
    find: (id: string) => Promise<App | null>;
    delete: (id: string) => Promise<unknown>;
    execute: (id: string) => Promise<unknown>;
    reposition: (id: string, toPosition: number) => Promise<App[]>;
    createShortcut: (request: AppShortcutRequest) => Promise<AppShortcutResult>;
    onChanged: (listener: (payload: { type: string; data?: unknown; timestamp: number }) => void) => () => void;
  };
  categories: {
    list: () => Promise<AppCategory[]>;
    add: (category: AppCategory) => Promise<AppCategory>;
    update: (category: AppCategory) => Promise<AppCategory | null>;
    find: (id: string) => Promise<AppCategory | null>;
    delete: (id: string) => Promise<unknown>;
    setApp: (appId: string, categoryId: string | null) => Promise<AppCategory[]>;
  };
  webPages: {
    list: () => Promise<WebPage[]>;
    add: (page: WebPage) => Promise<WebPage>;
    update: (page: WebPage) => Promise<WebPage | null>;
    find: (id: string) => Promise<WebPage | null>;
    delete: (id: string) => Promise<unknown>;
    open: (id: string) => Promise<unknown>;
    openUrl: (url: string, title?: string) => Promise<unknown>;
    createShortcut: (request: WebPageShortcutRequest) => Promise<WebPageShortcutResult>;
    closeAll: () => Promise<void>;
    getSettings: () => Promise<WebPagesSettings>;
    updateSettings: (patch: Partial<WebPagesSettings>) => Promise<WebPagesSettings>;
  };
  shortcuts: {
    getComboKeys: () => Promise<string[]>;
    list: () => Promise<Shortcut[]>;
    add: (shortcut: Shortcut) => Promise<Shortcut>;
    update: (shortcut: Shortcut) => Promise<Shortcut | null>;
    find: (id: string) => Promise<Shortcut | null>;
    delete: (id: string) => Promise<unknown>;
    updateAll: (shortcuts: Shortcut[]) => Promise<boolean>;
    isStarted: () => Promise<boolean>;
    setEnabled: (enabled: boolean) => Promise<boolean>;
  };
  observer: {
    publish: (payload: Partial<ObserverEventPayload>) => void;
    subscribe: (listener: (payload: ObserverEventPayload) => void) => () => void;
  };
  globalObserver: {
    publish: (payload: Partial<ObserverEventPayload>) => void;
    subscribe: (listener: (payload: ObserverEventPayload) => void) => () => void;
    removeListener: (listener: (payload: ObserverEventPayload) => void) => void;
  };
  overlay: {
    getSettings: () => Promise<OverlaySettings>;
    updateSettings: (patch: Partial<OverlaySettings>) => Promise<OverlaySettings>;
    closeWindow: () => Promise<boolean>;
  };
  express: {
    status: () => Promise<boolean>;
    start: (port?: number | null, sourceId?: string) => Promise<boolean>;
    stop: (sourceId?: string) => Promise<void>;
    notifyWebDeckChanged: () => Promise<boolean>;
    openExternal: (url: string) => Promise<boolean>;
    getWebDeckAccessInfo: () => Promise<{
      localhostUrl: string;
      localIp: string;
      localIpUrl: string;
      inviteUrl: string;
      qrCodeDataUrl: string;
    }>;
    onStatusChanged: (listener: (payload: ExpressStatusChangedPayload) => void) => () => void;
  };
  updates: {
    getState: () => Promise<UpdateState>;
    getLoadingState: () => Promise<UpdateLoadingState>;
    setAutoDownload: (enabled: boolean) => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    downloadInstall: () => Promise<boolean>;
    onStateChanged: (listener: (payload: UpdateState) => void) => () => void;
    onLoadingStateChanged: (listener: (payload: UpdateLoadingState) => void) => () => void;
  };
  appSettings: {
    getWindows: () => Promise<AppWindowsSettings>;
    setWindows: (patch: Partial<AppWindowsSettings>) => Promise<AppWindowsSettings>;
    getElectron: () => Promise<AppElectronSettings>;
    setElectron: (patch: Partial<AppElectronSettings>) => Promise<AppElectronSettings>;
    onDevToolsChanged: (listener: (payload: AppDevToolsChangedPayload) => void) => () => void;
  };
  logs: {
    getSettings: () => Promise<LogsSettings>;
    setSettings: (patch: Partial<LogsSettings>) => Promise<LogsSettings>;
    openLogFile: (category: keyof Omit<LogsSettings, "enabled">) => Promise<boolean>;
    clearLogFile: (category: keyof Omit<LogsSettings, "enabled">) => Promise<boolean>;
    clearLogs: () => Promise<boolean>;
  };
  windowControls: {
    getState: () => Promise<WindowControlState>;
    minimize: () => Promise<WindowControlState>;
    toggleMaximize: () => Promise<WindowControlState>;
    close: () => Promise<boolean>;
    onStateChanged: (listener: (payload: WindowControlState) => void) => () => void;
  };
  dialog: {
    selectFile: (options?: SelectFileOptions) => Promise<string | string[] | null>;
    selectSaveFile: (options?: SaveFileOptions) => Promise<string | null>;
    readFileAsDataUrl: (filePath: string) => Promise<string | null>;
    writeTextFile: (filePath: string, content: string) => Promise<boolean>;
  };
  media: {
    importFileToMediaUrl: (sourcePath: string, folderName: string, targetFileName?: string) => Promise<string | null>;
    readAsDataUrl: (source: string) => Promise<string | null>;
    getFileSize: (source: string) => Promise<number | null>;
  };
  theme: {
    saveLocalBackground: (sourcePath: string, mediaType?: string | null) => Promise<SavedThemeWallpaper | null>;
    getLocalWallpaper: () => Promise<SavedThemeWallpaper | null>;
    listSavedStoreWallpapers: () => Promise<SavedThemeWallpaper[]>;
    downloadStoreWallpaper: (request: ThemeDownloadRequest) => Promise<{ jobId: string }>;
    waitDownload: (jobId: string) => Promise<{ ok: boolean; mediaUrl?: string; error?: string } | null>;
    uninstallStoreWallpaper: (key: string) => Promise<boolean>;
    uninstallLocalWallpaper: () => Promise<boolean>;
    getPreferences: (defaultTheme: StoredThemeName, defaultBackground: StoredThemeBackground) => Promise<ThemePreferences>;
    setTheme: (theme: StoredThemeName) => Promise<boolean>;
    setBackground: (background: StoredThemeBackground) => Promise<boolean>;
    setEffectBackgrounds: (backgrounds: ThemeEffectBackgrounds) => Promise<boolean>;
    onDownloadProgress: (listener: (payload: ThemeDownloadProgress) => void) => () => void;
    onPreferencesChanged: (listener: (payload: ThemePreferencesChangedPayload) => void) => () => void;
  };
  notifications: {
    send: (title: string, body: string) => Promise<boolean>;
  };
  soundpad: {
    getPath: () => Promise<string>;
    setPath: (filePath: string) => Promise<boolean>;
    verify: () => Promise<SoundPadVerifyResult>;
    listAudios: () => Promise<SoundPadAudio[]>;
    executeCommand: (command: string) => Promise<SoundPadExecResult>;
    playSound: (index: number) => Promise<SoundPadExecResult>;
    repeatCurrent: () => Promise<SoundPadExecResult>;
    stopSound: () => Promise<SoundPadExecResult>;
    togglePause: () => Promise<SoundPadExecResult>;
    onAudiosChanged: (listener: (audios: SoundPadAudio[]) => void) => () => void;
  };
  obs: {
    getSettings: () => Promise<ObsSettings>;
    getState: () => Promise<ObsState>;
    refreshState: () => Promise<ObsState>;
    updateSettings: (
      patch: Partial<ObsSettings>,
      options?: { reconnectIfConnected?: boolean; requireValidManual?: boolean }
    ) => Promise<ObsCommandResult>;
    connect: (config?: { host?: string; port?: number; password?: string }) => Promise<ObsCommandResult>;
    disconnect: () => Promise<ObsCommandResult>;
    listScenes: () => Promise<ObsScene[]>;
    listAudioInputs: () => Promise<ObsAudioInput[]>;
    setCurrentScene: (sceneName: string) => Promise<ObsCommandResult>;
    setInputMute: (inputNameOrUuid: string, muted: boolean) => Promise<ObsCommandResult>;
    setInputVolume: (inputNameOrUuid: string, inputVolumeMul: number) => Promise<ObsCommandResult>;
    toggleInputMute: (inputNameOrUuid: string) => Promise<ObsCommandResult>;
    startStream: () => Promise<ObsCommandResult>;
    stopStream: () => Promise<ObsCommandResult>;
    toggleStream: () => Promise<ObsCommandResult>;
    startRecord: () => Promise<ObsCommandResult>;
    stopRecord: () => Promise<ObsCommandResult>;
    toggleRecordPause: () => Promise<ObsCommandResult>;
    pauseRecord: () => Promise<ObsCommandResult>;
    resumeRecord: () => Promise<ObsCommandResult>;
    onStateChanged: (listener: (state: ObsState) => void) => () => void;
  };
  discord: {
    getSettings: () => Promise<DiscordSettings>;
    getState: () => Promise<DiscordState>;
    refreshState: () => Promise<DiscordState>;
    updateSettings: (patch: Partial<{ connectOnStartup: boolean; clientId: string; clientSecret: string; clearClientSecret: boolean }>) => Promise<DiscordCommandResult>;
    connect: () => Promise<DiscordCommandResult>;
    disconnect: () => Promise<DiscordCommandResult>;
    setMute: (mute: boolean) => Promise<DiscordCommandResult>;
    toggleMute: () => Promise<DiscordCommandResult>;
    setDeafen: (deaf: boolean) => Promise<DiscordCommandResult>;
    toggleDeafen: () => Promise<DiscordCommandResult>;
    onStateChanged: (listener: (state: DiscordState) => void) => () => void;
  };
  liveChat: {
    getSettings: () => Promise<LiveChatSettings>;
    getState: () => Promise<LiveChatState>;
    updateSettings: (
      patch: LiveChatSettingsPatch,
    ) => Promise<LiveChatCommandResult>;
    connect: (provider?: LiveChatProvider, source?: string) => Promise<LiveChatCommandResult>;
    disconnect: (provider?: LiveChatProvider, source?: string) => Promise<LiveChatCommandResult>;
    openOverlay: (
      scope?: LiveChatOverlayScope,
    ) => Promise<LiveChatOverlayWindowState>;
    closeOverlay: (
      scope?: LiveChatOverlayScope,
    ) => Promise<LiveChatOverlayWindowState>;
    getOverlayState: (
      scope?: LiveChatOverlayScope,
    ) => Promise<LiveChatOverlayWindowState>;
    setOverlayPaused: (paused: boolean, scope?: LiveChatOverlayScope) => Promise<LiveChatOverlayWindowState>;
    setOverlayLocked: (locked: boolean, scope?: LiveChatOverlayScope) => Promise<LiveChatOverlayWindowState>;
    setOverlayAlwaysOnTop: (
      alwaysOnTop: boolean,
      scope?: LiveChatOverlayScope,
    ) => Promise<LiveChatOverlayWindowState>;
    clear: (scope?: LiveChatOverlayScope) => Promise<boolean>;
    onStateChanged: (listener: (state: LiveChatState) => void) => () => void;
    onEvent: (listener: (event: LiveChatEvent) => void) => () => void;
  };
  webdeck: {
    listPages: () => Promise<WebDeckPage[]>;
    findPage: (id: string) => Promise<WebDeckPage | null>;
    createPage: (
      payload: { name: string; iconSource?: string | null; gridCols?: number; gridRows?: number },
      sourceId?: string
    ) => Promise<WebDeckPage | null>;
    updatePage: (
      payload: { id: string; name?: string; iconSource?: string | null },
      sourceId?: string
    ) => Promise<WebDeckPage | null>;
    deletePage: (id: string, sourceId?: string) => Promise<boolean>;
    setGrid: (pageId: string, gridCols: number, gridRows: number, sourceId?: string) => Promise<WebDeckPage | null>;
    upsertItem: (
      pageId: string,
      index: number,
      item: { id?: string; type: WebDeckItemType; refId: string; label?: string; icon?: string | null },
      sourceId?: string
    ) => Promise<WebDeckPage | null>;
    removeItem: (pageId: string, index: number, sourceId?: string) => Promise<WebDeckPage | null>;
    moveItem: (pageId: string, fromIndex: number, toIndex: number, sourceId?: string) => Promise<WebDeckPage | null>;
    listAutoIcons: () => Promise<WebDeckAutoIcons>;
    setAutoPageIcon: (rootId: string, iconSource?: string | null, sourceId?: string) => Promise<WebDeckAutoIcons>;
    setAutoItemIcon: (itemKey: string, iconSource?: string | null, sourceId?: string) => Promise<WebDeckAutoIcons>;
    onChanged: (listener: (payload: WebDeckChangedPayload) => void) => () => void;
  };
}
