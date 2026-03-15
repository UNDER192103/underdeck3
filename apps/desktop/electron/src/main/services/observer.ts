import { EventEmitter } from "events";
import type { ShortcutKey } from "../../types/shortcuts.js";

// Standardized channel names for the observer system
export const ObserverChannels = {
    // Global channel - all events are also broadcast here
    GLOBAL: "GLOBAL",

    // WebDeck related channels
    WEBDECK_PAGES_CHANGED: "webdeck:pages-changed",
    WEBDECK_ITEMS_CHANGED: "webdeck:items-changed",

    // Apps related channels
    APPS_CHANGED: "apps:changed",
    APP_ADDED: "app:added",
    APP_UPDATED: "app:updated",
    APP_DELETED: "app:deleted",

    // OBS related channels
    OBS_STATE_CHANGED: "obs:state-changed",
    OBS_SCENE_CHANGED: "obs:scene-changed",
    OBS_STREAM_CHANGED: "obs:stream-changed",
    OBS_RECORD_CHANGED: "obs:record-changed",

    // SoundPad related channels
    SOUNDPAD_AUDIOS_CHANGED: "soundpad:audios-changed",

    // Theme related channels
    THEME_CHANGED: "theme:changed",
    THEME_PREFERENCES_CHANGED: "theme:preferences-changed",
    THEME_BACKGROUND_CHANGED: "theme:background-changed",

    // Settings related channels
    SETTINGS_CHANGED: "settings:changed",
    SETTINGS_WINDOWS_CHANGED: "settings:windows-changed",
    SETTINGS_ELECTRON_CHANGED: "settings:electron-changed",
    SETTINGS_OVERLAY_CHANGED: "settings:overlay-changed",

    // Express/WebDeck server related
    EXPRESS_STATUS_CHANGED: "express:status-changed",

    // Internal IPC bridge channel
    _IPCMAIN_PUBLISH_EVENT_: "_IPCMAIN_PUBLISH_EVENT_",
} as const;

export type ObserverChannel = typeof ObserverChannels[keyof typeof ObserverChannels];

export type ObserverPayload = {
    id: string;
    channel: ObserverChannel | string;
    origin?: string;
    data?: unknown;
    sourceId: string;
    timestamp: number;
};

// Event data type mapping for type-safe publishing/subscribing
export interface ObserverEventDataMap {
    // WebDeck events
    "webdeck:pages-changed": { pages: unknown[]; autoIcons?: unknown };
    "webdeck:items-changed": { pageId: string; items: unknown[] };

    // Apps events
    "apps:changed": { type: "added" | "updated" | "deleted" | "repositioned"; app?: unknown; apps?: unknown[] };
    "app:added": { app: unknown };
    "app:updated": { app: unknown };
    "app:deleted": { appId: string };

    // OBS events
    "obs:state-changed": { state: unknown };
    "obs:scene-changed": { sceneName: string; scenes: unknown[] };
    "obs:stream-changed": { active: boolean };
    "obs:record-changed": { active: boolean; paused: boolean };

    // SoundPad events
    "soundpad:audios-changed": { audios: unknown[] };

    // Theme events
    "theme:changed": { theme: string };
    "theme:preferences-changed": { theme?: string; background?: unknown };
    "theme:background-changed": { background: unknown };

    // Settings events
    "settings:changed": { category: string; settings: unknown };
    "settings:windows-changed": { autoStart?: boolean; enableNotifications?: boolean };
    "settings:electron-changed": { startMinimized?: boolean; closeToTray?: boolean; devTools?: boolean };
    "settings:overlay-changed": { enabled?: boolean; keys?: ShortcutKey[]; closeOnBlur?: boolean };

    // Express events
    "express:status-changed": { enabled: boolean; port: number };

    // Global catch-all
    "GLOBAL": ObserverPayload;
    "_IPCMAIN_PUBLISH_EVENT_": ObserverPayload;
}

// Helper type to get data for a channel
export type ObserverEventData<T extends ObserverChannel> = T extends keyof ObserverEventDataMap ? ObserverEventDataMap[T] : unknown;

export class ObserverService extends EventEmitter {
    constructor() {
        super();
    }

    /**
     * Subscribe to a specific channel
     */
    subscribe<T extends ObserverChannel>(
        channel: T | '_IPCMAIN_PUBLISH_ENVENT_',
        listener: (payload: ObserverPayload & { data?: ObserverEventDataMap[T] }) => void
    ): () => void {
        this.on(channel, listener as (payload: ObserverPayload) => void);
        return () => {
            this.off(channel, listener as (payload: ObserverPayload) => void);
        };
    }

    /**
     * Subscribe to multiple channels at once
     */
    subscribeMany<T extends ObserverChannel>(
        channels: T[],
        listener: (payload: ObserverPayload & { data?: ObserverEventDataMap[T] }) => void
    ): () => void {
        channels.forEach((channel) => {
            this.on(channel, listener as (payload: ObserverPayload) => void);
        });
        return () => {
            channels.forEach((channel) => {
                this.off(channel, listener as (payload: ObserverPayload) => void);
            });
        };
    }

    /**
     * Subscribe to GLOBAL channel (receives all events)
     */
    subscribeGlobal(
        listener: (payload: ObserverPayload) => void
    ): () => void {
        return this.subscribe(ObserverChannels.GLOBAL, listener);
    }

    /**
     * Publish an event to a specific channel
     */
    publish<T extends ObserverChannel>(
        channel: T,
        data: ObserverEventDataMap[T],
        sourceId?: string
    ): ObserverPayload {
        const normalizedPayload: ObserverPayload = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            channel,
            data,
            sourceId: sourceId || "SYSTEM",
            timestamp: Date.now(),
        };

        // Emit to specific channel
        this.emit(channel, normalizedPayload);

        // Emit to GLOBAL channel
        this.emit(ObserverChannels.GLOBAL, normalizedPayload);

        // Emit to internal IPC bridge channel
        this.emit(ObserverChannels._IPCMAIN_PUBLISH_EVENT_, normalizedPayload);

        return normalizedPayload;
    }

    /**
     * Publish with explicit payload (for IPC bridge from renderer)
     */
    publishRaw(payload: Partial<ObserverPayload>): ObserverPayload {
        const normalizedPayload: ObserverPayload = {
            id: String(payload.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
            channel: String(payload.channel || ObserverChannels.GLOBAL) as ObserverChannel,
            data: payload.data,
            sourceId: String(payload.sourceId || "UNKNOWN"),
            timestamp: Number(payload.timestamp || Date.now()),
        };

        this.emit(normalizedPayload.channel, normalizedPayload);
        this.emit(ObserverChannels.GLOBAL, normalizedPayload);
        this.emit(ObserverChannels._IPCMAIN_PUBLISH_EVENT_, normalizedPayload);

        return normalizedPayload;
    }

    // Legacy method for backward compatibility
    emitEvent(eventName: string | symbol, payload: Partial<ObserverPayload>): boolean {
        return super.emit(eventName, payload);
    }
}

export const observerService = new ObserverService();
