
export type AppTypes = 1 | 2 | 3 | 4 | 5 | 6;

export interface AppMetaDataExe {
    path: string;
    env?: { [key: string]: string };
    cwd?: string;
    args?: string[];
}

export interface AppMetaDataSystem {
    os: "windows" | "linux" | "macos";
    cmd: "media-next" | "media-previous" | "media-play-pause" | "media-pause" | "media-mute-unmute" | "media-volume-up" | "media-volume-down";
    args?: string[];
}

export interface AppMetaDataSoundPad {
    action: "play-sound" | "play-current-again" | "stop" | "toggle-pause";
    soundIndex?: number;
}

export interface AppMetaDataWebUrl {
    url: string;
    args?: string[];
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

export interface App {
    id: string;
    position: number;
    type: AppTypes;
    name: string;
    icon: string | null;
    banner?: string | null;
    description: string;
    meta_data: AppMetaDataExe | AppMetaDataSystem | AppMetaDataSoundPad | AppMetaDataWebUrl | AppMetaDataCmd | AppMetaDataObsStudio;
}
