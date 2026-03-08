export type RendererSourceMode = "auto" | "local" | "url";

export const RendererTargetConfig = {
    sourceMode: "local" as RendererSourceMode,
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
    },
    assets: {
        tryIcon: ['img', 'icon.ico'],
        windowIcon: ['img', 'icon.ico']
    },
    storage: {
        baseFolder: 'underdeck',
        appIconsFolder: 'apps-icons',
        shortcutIconsFolder: 'shortcuts-icons'
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
    overlay: {
        enabled: true,
        keys: ["LEFT CTRL", "LEFT SHIFT", "SECTION"] as string[],
        closeOnBlur: true,
    }
}
