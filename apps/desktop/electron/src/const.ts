export type RendererSourceMode = "auto" | "local" | "url";

export const RendererTargetConfig = {
    sourceMode: "local" as RendererSourceMode,
    devBaseUrl: "http://localhost:5173",
};

export const BaseConfig = {
    express: {
        enabled: true,
        port: 59231
    },
    windows: {
        autoStart: true,
        enableNotifications: true
    },
    updates: {
        autoDownloadWhenAvailable: true,
    },
    electron: {
        startMinimized: false,
        closeToTray: true,
        devTools: false,
        startOpenDevTools: false,
        openLinksInBrowser: true,
    },
    assets: {
        tryIcon: ['img', 'icon.ico'],
        windowIcon: ['img', 'icon.ico']
    },
    storage: {
        baseFolder: 'underdeck',
        appIconsFolder: 'apps-icons',
        shortcutIconsFolder: 'shortcuts-icons',
        categoryIconsFolder: 'categories-icons',
        webPagesIconsFolder: 'webpages-icons'
    },
    shortcuts: {
        enalbed: false,
    },
    i18n: {
        locale: "en-US",
        fallbackLocale: "en-US",
    },
    soundpad: {
        path: "",
    },
    obs: {
        connectOnStartup: false,
        autoDetect: true,
        host: "127.0.0.1",
        port: 4455,
        password: "",
    },
    discord: {
        connectOnStartup: false,
        clientId: "",
        clientSecretEncrypted: "",
        accessTokenEncrypted: "",
    },
    liveChat: {
        enabled: false,
        twitch: {
            enabled: false,
            anonymous: true,
            username: "",
            passwordEncrypted: "",
            channels: [] as string[],
            channelOverrides: {} as Record<string, { label: string; icon: string | null; eventsEnabled: boolean }>,
            reconnect: true,
            display: {
                showSelfMessages: false,
                showTimestamp: true,
                showAvatar: true,
                showBadges: true,
                showProvider: true,
                showChannel: true,
                showJoinEvents: true,
                showFollowEvents: true,
            },
        },
        tiktok: {
            enabled: false,
            accounts: [] as string[],
            accountOverrides: {} as Record<string, { label: string; icon: string | null; eventsEnabled: boolean; waitForLive: boolean }>,
            autoConnectAccounts: true,
            reconnect: true,
            offlineCheckIntervalSeconds: 30,
            display: {
                showTimestamp: true,
                showAvatar: true,
                showBadges: true,
                showProvider: true,
                showChannel: true,
                showJoinEvents: true,
                showFollowEvents: true,
                showLikeEvents: true,
                showGiftEvents: true,
            },
        },
        overlay: {
            mode: "combined" as "combined" | "separate",
            paused: false,
            locked: false,
            alwaysOnTop: true,
            scopeStates: {
                combined: { paused: false, locked: false, alwaysOnTop: true },
                twitch: { paused: false, locked: false, alwaysOnTop: true },
                tiktok: { paused: false, locked: false, alwaysOnTop: true },
            },
            maxMessages: 200,
            background: { variant: "color", backgroundColor: "#000000" } as const,
            backgroundPresets: {
                color: { variant: "color", backgroundColor: "#000000" } as const,
                neural: {
                    variant: "neural",
                    neuralColors: {
                        center: "#151964",
                        middle: "#021A4B",
                        edge: "#03091D",
                        link: "#7DD3FC",
                        dot: "#93C5FD",
                    },
                } as const,
                nebula: {
                    variant: "nebula",
                    nebulaColor: "#712CF9",
                    nebulaExplosionColor: "#8B5CF6",
                    nebulaBackgroundStart: "#0B0716",
                    nebulaBackgroundEnd: "#1A0D35",
                } as const,
                particles: {
                    variant: "particles",
                    particleColor: "#60A5FA",
                    particleBackgroundColor: "#020617",
                    particleCount: 36,
                } as const,
            },
            openScopes: [] as Array<"combined" | "twitch" | "tiktok">,
            bounds: {},
        },
    },
    logs: {
        enabled: false,
        app: false,
        shortcuts: false,
        obs: false,
        soundpad: false,
        webdeck: false,
        webpages: false,
        discord: false,
        liveChat: false,
        socket: false,
        updates: false,
    },
    overlay: {
        enabled: true,
        keys: ["LEFT CTRL", "LEFT SHIFT", "SECTION"] as string[],
        closeOnBlur: true,
    },
    device: {
        hwid: "",
    },
    webPages: {
        useAdblock: true,
        blockNewWindows: true,
    },
}
