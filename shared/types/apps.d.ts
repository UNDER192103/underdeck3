export type AppTypes = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AppMetaDataExe {
  path: string;
  env?: { [key: string]: string };
  cwd?: string;
  args?: string[];
}

export interface AppMetaDataSystem {
  os: "windows" | "linux" | "macos";
  cmd:
    | "media-next"
    | "media-previous"
    | "media-play-pause"
    | "media-pause"
    | "media-mute-unmute"
    | "media-volume-up"
    | "media-volume-down";
  args?: string[];
}

export interface AppMetaDataSoundPad {
  action: "play-sound" | "play-current-again" | "stop" | "toggle-pause";
  soundIndex?: number;
}

export interface AppMetaDataWebUrl {
  url: string;
  args?: string[];
  openInApp?: boolean;
}

export interface AppMetaDataCmd {
  command: string;
  args?: string[];
}

export interface AppMetaDataObsStudio {
  target?: "stream" | "record" | "scene" | "audio";
  action?: "start" | "stop" | "toggle" | "pause" | "resume" | "switch" | "mute" | "unmute";
  sceneName?: string;
  inputName?: string;
  inputUuid?: string;
  type?: "action" | "scene" | "input";
  path?: string;
  args?: string[];
}

export interface AppMetaDataDiscord {
  action: "toggle-mute" | "mute" | "unmute" | "toggle-deafen" | "deafen" | "undeafen";
}

export interface App {
  id: string;
  position: number;
  type: AppTypes;
  name: string;
  icon: string | null;
  banner?: string | null;
  description: string;
  meta_data:
    | AppMetaDataExe
    | AppMetaDataSystem
    | AppMetaDataSoundPad
  | AppMetaDataWebUrl
  | AppMetaDataCmd
  | AppMetaDataObsStudio
  | AppMetaDataDiscord;
  updatedAt?: number;
}

export type AppShortcutDestination = "desktop" | "startMenu" | "custom";

export interface AppShortcutRequest {
  appId: string;
  name: string;
  iconPath?: string | null;
  destination: AppShortcutDestination;
  customDirectory?: string | null;
}

export interface AppShortcutResult {
  ok: boolean;
  path?: string;
  error?: string;
}
