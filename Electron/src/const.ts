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
        autoDownloadWhenAvailable: false,
    },
    electron: {
        startMinimized: true,      // Inicia sem mostrar a janela principal
        minimizeToTray: true,      // Minimiza para a bandeja em vez da barra de tarefas
        closeToTray: true,         // Se fechar a janela, o app continua rodando no ícone
        showOnStartup: false,      // Se deve focar a janela ao abrir
        devTools: false,
        startOpenDevTools: false,
    },
    assets: {
        tryIcon: ['img', 'UDIx256.ico'],
        windowIcon: ['img', 'UDIx256.ico']
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
        enabled: false,
        keys: [] as string[],
        closeOnBlur: true,
    }
}
