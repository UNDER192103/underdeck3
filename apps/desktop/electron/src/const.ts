export type RendererSourceMode = "auto" | "local" | "url";

export const RendererTargetConfig = {
    sourceMode: "url" as RendererSourceMode,
    devBaseUrl: "http://localhost:3404",
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
    logs: {
        enabled: false,
        app: false,
        shortcuts: false,
        obs: false,
        soundpad: false,
        webdeck: false,
        webpages: false,
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
