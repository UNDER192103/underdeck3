import { App } from "./apps";
import { Shortcut } from "./shortcuts";

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

export interface SavedThemeWallpaper {
  key: string;
  itemId: string;
  name: string;
  source: "local" | "store";
  remoteUrl: string;
  mediaUrl: string;
  relativePath: string;
  mediaType: string | null;
  createdAt: number;
  exists: boolean;
}

export type StoredThemeName = "ligth" | "dark" | "black" | "transparent";

export type StoredThemeBackground =
  | { variant: "neural" }
  | { variant: "image"; imageSrc: string }
  | { variant: "video"; videoSrc: string };

export interface ThemePreferences {
  theme: StoredThemeName;
  background: StoredThemeBackground;
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

export type WebDeckItemType = "back" | "page" | "app" | "soundpad" | "obs";

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
}

export interface UpdateLoadingState {
  phase: "checking" | "downloading" | "installing" | "loading-app";
  message: string;
  progressPercent?: number;
  version?: string | null;
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
}

export interface AppDevToolsChangedPayload {
  enabled: boolean;
  timestamp: number;
}

declare global {
  interface Window {
    underdeck: {
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
        onLoadingStateChanged: (listener: (payload: UpdateLoadingState) => void) => () => void;
      };
      appSettings: {
        getWindows: () => Promise<AppWindowsSettings>;
        setWindows: (patch: Partial<AppWindowsSettings>) => Promise<AppWindowsSettings>;
        getElectron: () => Promise<AppElectronSettings>;
        setElectron: (patch: Partial<AppElectronSettings>) => Promise<AppElectronSettings>;
        onDevToolsChanged: (listener: (payload: AppDevToolsChangedPayload) => void) => () => void;
      };
      dialog: {
        selectFile: (options?: SelectFileOptions) => Promise<string | string[] | null>;
        selectSaveFile: (options?: SaveFileOptions) => Promise<string | null>;
        readFileAsDataUrl: (filePath: string) => Promise<string | null>;
      };
      media: {
        importFileToMediaUrl: (sourcePath: string, folderName: string, targetFileName?: string) => Promise<string | null>;
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
        onDownloadProgress: (listener: (payload: ThemeDownloadProgress) => void) => () => void;
        onPreferencesChanged: (listener: (payload: ThemePreferencesChangedPayload) => void) => () => void;
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
      webdeck: {
        listPages: () => Promise<WebDeckPage[]>;
        findPage: (id: string) => Promise<WebDeckPage | null>;
        createPage: (payload: { name: string; iconSource?: string | null; gridCols?: number; gridRows?: number }, sourceId?: string) => Promise<WebDeckPage | null>;
        updatePage: (payload: { id: string; name?: string; iconSource?: string | null }, sourceId?: string) => Promise<WebDeckPage | null>;
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
    };
  }
}

export {};
