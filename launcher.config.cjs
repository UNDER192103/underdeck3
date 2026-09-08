const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const ROOT_DIR = __dirname;
const VENV_SCRIPT = path.join(
    ROOT_DIR,
    "scripts",
    "windows",
    "Venv.bat",
);

/*
Tipos:
- same: executa no terminal atual e usa "after".
- new: abre uma nova janela CMD.
- newsame: abre uma nova aba no Windows Terminal.
- terminal: fecha o menu e devolve o terminal com o venv ativo.
- exit: fecha completamente o terminal.
- submenu: abre outro menu; pode conter submenus sem limite.

Ações em "after":
- "menu", "wait", "terminal" ou "exit".
- { action: "command", command: "...", next: "menu" }

Em qualquer menu/submenu:
- showOpenAll: true  -> mostra "0 - Abrir todos".
- showOpenAll: false -> oculta "0 - Abrir todos".

No launcher:
- showBackButton: false -> oculta a opcao visual "Voltar" nos submenus.
  Esc, seta esquerda e Backspace continuam voltando normalmente.

Em apps:
- all: true inclui o app em "Abrir todos".

Comandos de apps:
- command: string unica, mantida por compatibilidade.
- commands: cada item inicia uma execucao independente.
  - string: comando completo para uma execucao.
  - string[]: comandos sequenciais na mesma execucao, unidos por " && ".
- commands + new: cada item abre uma nova janela CMD.
- commands + newsame: cada item abre uma nova aba do Windows Terminal.
- commands + same: o primeiro item usa o terminal atual e os demais abrem
  novas abas do Windows Terminal antes da execucao local iniciar.
*/
const launcherConfig = {
    title: "Under Deck Launcher",

    // Exibe "Abrir todos" no menu principal.
    showOpenAll: false,
    showFooter: false,
    showBackButton: false,

    apps: [

        {
            name: "Abrir no VS Code",
            command: "code .",
            type: "same",
            after: "menu",
            all: false,
        },

        {
            name: "Dependências",
            type: "submenu",
            showOpenAll: false,
            apps: [
                {
                    name: "Instalar todas as dependências",
                    commands: [
                        [
                            "cls",
                            "pnpm run install:all",
                        ]
                    ],
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Atualizar dependências interativamente",
                    commands: [
                        [
                            "cls",
                            "pnpm run hasupdate",
                        ],
                    ],
                    type: "newsame",
                    all: true,
                },
            ],
        },

        {
            name: "Build",
            type: "submenu",
            showOpenAll: false,
            apps: [
                {
                    name: "Buildar tudo",
                    commands: [
                        [
                            "cls",
                            "pnpm run build:all",
                        ],
                    ],
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Buildar Desktop",
                    commands: [
                        [
                            "cls",
                            "pnpm run build:desktop",
                        ],
                    ],
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Buildar Remote",
                    command: "pnpm run build:remote",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Gerar estrutura do projeto",
                    command: "pnpm run generate:structure",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Velopack",
                    type: "submenu",
                    showOpenAll: false,
                    apps: [
                        {
                            name: "Criar pacote local (sem GitHub)",
                            command: "pnpm run velopack:local",
                            type: "newsame",
                            all: false,
                        },
                        {
                            name: "Criar pacote local e testar instalador",
                            command: "pnpm run velopack:local:test",
                            type: "newsame",
                            all: false,
                        },
                        {
                            name: "Abrir menu de publicacao no GitHub",
                            command: "scripts\\build.bat",
                            type: "newsame",
                            all: false,
                        },
                    ],
                },
            ],
        },

        {
            name: "Desenvolvimento",
            type: "submenu",
            showOpenAll: false,
            apps: [
                {
                    name: "Iniciar tudo",
                    command: "pnpm run dev:all",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Desktop (Client + Electron)",
                    command: "pnpm run dev:desktop",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Desktop Client",
                    command: "pnpm run dev:desktop:client",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Electron",
                    command: "pnpm run dev:desktop:electron",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Remote (Vite)",
                    command: "pnpm run dev:remote",
                    type: "newsame",
                    all: true,
                },
                {
                    name: "Remote Server",
                    command: "pnpm run dev:remote:server",
                    type: "newsame",
                    all: true,
                },
            ],
        },

        {
            name: "GitHub",
            type: "submenu",
            showOpenAll: false,
            apps: [
                {
                    name: "Abrir assistente GitHub",
                    command: "scripts\\github_tool.bat",
                    type: "newsame",
                    all: false,
                },
                {
                    name: "Buildar tudo e abrir assistente GitHub",
                    commands: [["pnpm run build:all", "scripts\\github_tool.bat"]],
                    type: "newsame",
                    all: false,
                },
            ],
        },

        {
            name: "Sair",
            type: "submenu",
            showOpenAll: false,
            apps: [
                {
                    name: "Sair para o terminal",
                    type: "terminal",
                    all: false,
                },

                {
                    name: "Fechar",
                    type: "exit",
                    all: false,
                },
            ],
        },

    ]
};


module.exports = launcherConfig;

const ANSI = {
    reset: "\x1b[0m",
    cyan: "\x1b[96m",
    gray: "\x1b[90m",
    green: "\x1b[92m",
    yellow: "\x1b[93m",
    red: "\x1b[91m",
    hideCursor: "\x1b[?25l",
    showCursor: "\x1b[?25h",
    clearScreen: "\x1b[2J",
    cursorHome: "\x1b[H",
    clearFromCursor: "\x1b[J",
};

const menuStack = [
    {
        title: launcherConfig.title,
        apps: launcherConfig.apps,
        showOpenAll: launcherConfig.showOpenAll !== false,
        selectedIndex: 0,
    },
];

let busy = false;
let statusMessage = "";

function write(value) {
    process.stdout.write(value);
}

function hideCursor() {
    write(ANSI.hideCursor);
}

function showCursor() {
    write(ANSI.showCursor);
}

function clearScreenOnce() {
    write(ANSI.clearScreen + ANSI.cursorHome);
}

function getCurrentMenu() {
    return menuStack[menuStack.length - 1];
}

function getSubmenuApps(item) {
    if (Array.isArray(item.apps)) {
        return item.apps;
    }

    if (Array.isArray(item.options)) {
        return item.options;
    }

    return [];
}

function getMenuItems(menu = getCurrentMenu()) {
    const items = [];

    /*
     * Quando habilitado, "Abrir todos" sempre será a opção 0.
     */
    if (menu.showOpenAll !== false) {
        items.push({
            name: "Abrir todos",
            type: "open_all",
        });
    }

    /*
     * Apps e submenus aparecem no meio.
     */
    items.push(...menu.apps);

    /*
     * Em qualquer submenu, "Voltar" sempre aparece por último.
     */
    if (
        menuStack.length > 1 &&
        launcherConfig.showBackButton !== false
    ) {
        items.push({
            name: "Voltar",
            type: "back",
        });
    }

    return items;
}

function getBreadcrumb() {
    return menuStack
        .map((menu) => menu.title)
        .join("  ›  ");
}

function centerText(text, width) {
    const value = String(text);

    if (value.length >= width) {
        return value.slice(0, width);
    }

    const remaining = width - value.length;
    const left = Math.floor(remaining / 2);

    return (
        " ".repeat(left) +
        value +
        " ".repeat(remaining - left)
    );
}

function getDisplayName(item) {
    if (item.type === "submenu") {
        return `${item.name}  ›`;
    }

    if (item.type === "back") {
        return `← ${item.name}`;
    }

    return item.name;
}

function calculateBoxWidth(title, items) {
    const widths = items.map((item, index) => {
        return `${index} - ${getDisplayName(item)}`.length;
    });

    const longest = Math.max(
        String(title).length,
        getBreadcrumb().length,
        ...widths,
    );

    return Math.max(
        62,
        Math.min(100, longest + 12),
    );
}

function renderMenu() {
    const menu = getCurrentMenu();
    const items = getMenuItems(menu);

    if (menu.selectedIndex < 0) {
        menu.selectedIndex = 0;
    }

    if (menu.selectedIndex >= items.length) {
        menu.selectedIndex = Math.max(
            0,
            items.length - 1,
        );
    }

    const width = calculateBoxWidth(
        menu.title,
        items,
    );

    const lines = [];

    const emptyHeader =
        `${ANSI.cyan}║${ANSI.reset}` +
        " ".repeat(width) +
        `${ANSI.cyan}║${ANSI.reset}`;

    lines.push(
        `${ANSI.cyan}╔${"═".repeat(width)}╗${ANSI.reset}`,
    );

    /*
     * Espaço acima do título.
     */
    lines.push(emptyHeader);

    lines.push(
        `${ANSI.cyan}║${ANSI.reset}` +
        centerText(menu.title, width) +
        `${ANSI.cyan}║${ANSI.reset}`,
    );

    /*
     * Espaço abaixo do título.
     */
    lines.push(emptyHeader);

    lines.push(
        `${ANSI.cyan}╚${"═".repeat(width)}╝${ANSI.reset}`,
    );

    lines.push("");

    if (menuStack.length > 1) {
        lines.push(
            `${ANSI.gray}${getBreadcrumb()}${ANSI.reset}`,
        );

        lines.push("");
    }

    const hint =
        menuStack.length > 1
            ? "Use [↑ / ↓], [Enter / →] para selecionar e [Esc / ←] para voltar."
            : "Use [↑ / ↓], [Enter / →] para selecionar e [Esc / ←] para fechar.";

    lines.push(
        `${ANSI.gray}${hint}${ANSI.reset}`,
    );

    lines.push("");

    items.forEach((item, index) => {
        /*
         * Separa visualmente o botão Voltar,
         * que sempre será a última opção.
         */
        if (
            item.type === "back" &&
            index > 0
        ) {
            lines.push("");
        }

        const selected =
            menu.selectedIndex === index;

        const name =
            getDisplayName(item);

        if (selected) {
            lines.push(
                `${ANSI.cyan}` +
                `  ➔  ${index} - ${name}` +
                `${ANSI.reset}`,
            );
        } else {
            lines.push(
                `     ${index} - ${name}`,
            );
        }

        /*
         * Separa "Abrir todos" das opções normais.
         */
        if (
            item.type === "open_all" &&
            items[index + 1]
        ) {
            lines.push("");
        }
    });

    lines.push("");

    if (launcherConfig.showFooter === true) {
        lines.push(
            `${ANSI.gray}` +
            `${"─".repeat(width + 2)}` +
            `${ANSI.reset}`,
        );
    }

    if (statusMessage) {
        lines.push("");
        lines.push(statusMessage);
    }

    /*
     * Não usa cls ao navegar.
     * Apenas reposiciona o cursor e redesenha.
     */
    write(
        ANSI.cursorHome +
        ANSI.clearFromCursor +
        lines.join("\n"),
    );
}

function hasWindowsTerminal() {
    const result = spawnSync(
        "where.exe",
        ["wt.exe"],
        {
            stdio: "ignore",
            windowsHide: true,
        },
    );

    return result.status === 0;
}

function buildActivatedCommand(command) {
    const commands = [
        `cd /d "${ROOT_DIR}"`,
    ];

    if (existsSync(VENV_SCRIPT)) {
        commands.push(
            `call "${VENV_SCRIPT}" call`,
        );
    }

    commands.push(command);

    return commands.join(" && ");
}

function hasOwn(object, property) {
    return Object.prototype.hasOwnProperty.call(
        object,
        property,
    );
}

function getCommandEntries(app) {
    if (hasOwn(app, "commands")) {
        return app.commands;
    }

    return [app.command];
}

function renderCommandEntry(entry) {
    if (Array.isArray(entry)) {
        return entry.join(" && ");
    }

    return entry;
}

function getCommandApps(app) {
    const entries =
        getCommandEntries(app);

    return entries.map(
        (entry, index) => ({
            ...app,
            name:
                entries.length > 1
                    ? `${app.name} [${index + 1}/${entries.length}]`
                    : app.name,
            command: renderCommandEntry(entry),
        }),
    );
}

function openCmdWindow(app) {
    const child = spawn(
        "cmd.exe",
        [
            "/k",
            buildActivatedCommand(
                app.command,
            ),
        ],
        {
            cwd: ROOT_DIR,
            detached: true,
            stdio: "ignore",
            windowsHide: false,
        },
    );

    child.unref();

    return {
        fallback: false,
    };
}

function openWindowsTerminalTab(app) {
    if (!hasWindowsTerminal()) {
        openCmdWindow(app);

        return {
            fallback: true,
        };
    }

    const commands = [];

    if (existsSync(VENV_SCRIPT)) {
        commands.push(
            `call "${VENV_SCRIPT}" call`,
        );
    }

    commands.push(app.command);

    const command =
        commands.join(" && ");

    const child = spawn(
        "wt.exe",
        [
            "-w",
            "0",
            "new-tab",
            "--title",
            app.name,
            "-d",
            ROOT_DIR,
            "cmd.exe",
            "/k",
            command,
        ],
        {
            cwd: ROOT_DIR,
            detached: true,
            stdio: "ignore",
            windowsHide: false,
        },
    );

    child.unref();

    return {
        fallback: false,
    };
}

function openExternalCommand(app) {
    if (app.type === "new") {
        return openCmdWindow(app);
    }

    if (app.type === "newsame") {
        return openWindowsTerminalTab(app);
    }

    throw new Error(
        `Tipo externo desconhecido: ${app.type}`,
    );
}

function openExternalApp(app) {
    const commandApps =
        getCommandApps(app);

    let fallback = false;

    for (const commandApp of commandApps) {
        const result =
            openExternalCommand(commandApp);

        fallback = fallback || result.fallback;
    }

    return {
        fallback,
        launched: commandApps.length,
    };
}

function runShellCommand(command) {
    return new Promise((resolve) => {
        const child = spawn(
            command,
            {
                cwd: ROOT_DIR,
                shell: true,
                stdio: "inherit",
                windowsHide: false,
            },
        );

        let finished = false;

        function finish(code) {
            if (finished) {
                return;
            }

            finished = true;
            resolve(code);
        }

        child.on(
            "error",
            (error) => {
                console.error();

                console.error(
                    `${ANSI.red}` +
                    `[ERRO] ${error.message}` +
                    `${ANSI.reset}`,
                );

                finish(1);
            },
        );

        child.on(
            "close",
            (code) => {
                finish(code ?? 0);
            },
        );
    });
}

function waitForEnter() {
    return new Promise((resolve) => {
        const rl =
            readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

        rl.question(
            "\nPressione Enter para voltar ao menu...",
            () => {
                rl.close();
                resolve();
            },
        );
    });
}

function normalizeAfter(after) {
    if (!after) {
        return {
            action: "menu",
        };
    }

    if (typeof after === "string") {
        return {
            action: after,
        };
    }

    return after;
}

function restoreMenu(exitCode = 0) {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    process.stdin.resume();
    hideCursor();

    busy = false;

    if (exitCode === 0) {
        statusMessage = "";
    } else {
        statusMessage =
            `${ANSI.red}` +
            `O comando terminou com o código ${exitCode}.` +
            `${ANSI.reset}`;
    }

    renderMenu();
}

async function handleAfterAction(
    after,
    exitCode = 0,
) {
    const config =
        normalizeAfter(after);

    if (config.action === "menu") {
        restoreMenu(exitCode);
        return;
    }

    if (config.action === "wait") {
        await waitForEnter();
        restoreMenu(exitCode);
        return;
    }

    if (config.action === "terminal") {
        closeLauncher(10);
        return;
    }

    if (
        config.action === "exit" ||
        config.action === "close"
    ) {
        closeLauncher(11);
        return;
    }

    if (config.action === "command") {
        if (!config.command) {
            console.error(
                `${ANSI.red}` +
                "[ERRO] after.command não foi definido." +
                `${ANSI.reset}`,
            );

            await waitForEnter();
            restoreMenu(1);
            return;
        }

        console.log();

        console.log(
            `${ANSI.cyan}` +
            `▶ Executando comando final: ${config.command}` +
            `${ANSI.reset}`,
        );

        console.log();

        const code =
            await runShellCommand(
                config.command,
            );

        await handleAfterAction(
            config.next ?? "menu",
            code,
        );

        return;
    }

    console.error(
        `${ANSI.red}` +
        `[ERRO] Ação final desconhecida: ${config.action}` +
        `${ANSI.reset}`,
    );

    await waitForEnter();
    restoreMenu(1);
}

async function runInCurrentTerminal(app) {
    busy = true;

    showCursor();

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }

    clearScreenOnce();

    console.log(
        `▶ Iniciando ${app.name}`,
    );

    console.log();

    const code =
        await runShellCommand(
            app.command,
        );

    if (code !== 0) {
        console.log();

        console.log(
            `${ANSI.red}` +
            `[ERRO] O comando terminou com o código ${code}.` +
            `${ANSI.reset}`,
        );
    }

    await handleAfterAction(
        app.after,
        code,
    );
}

async function runCommandsWithSameFirst(app) {
    const commandApps =
        getCommandApps(app);
    const [currentApp, ...externalApps] =
        commandApps;

    for (const externalApp of externalApps) {
        openWindowsTerminalTab({
            ...externalApp,
            type: "newsame",
        });
    }

    await runInCurrentTerminal(currentApp);
}

function openSubmenu(item) {
    const apps =
        getSubmenuApps(item);

    if (apps.length === 0) {
        statusMessage =
            `${ANSI.yellow}` +
            `O submenu "${item.name}" não possui opções.` +
            `${ANSI.reset}`;

        renderMenu();
        return;
    }

    menuStack.push({
        title:
            item.title ||
            item.name,

        apps,

        /*
         * true por padrão.
         * Use showOpenAll: false para ocultar.
         */
        showOpenAll:
            item.showOpenAll !== false,

        selectedIndex: 0,
    });

    statusMessage = "";

    renderMenu();
}

function goBack() {
    if (menuStack.length <= 1) {
        return false;
    }

    menuStack.pop();

    statusMessage = "";

    renderMenu();

    return true;
}

function collectAppsForOpenAll(
    apps,
    collected = [],
) {
    for (const app of apps) {
        if (app.type === "submenu") {
            collectAppsForOpenAll(
                getSubmenuApps(app),
                collected,
            );

            continue;
        }

        if (
            app.all === true &&
            (
                app.type === "new" ||
                app.type === "newsame"
            )
        ) {
            collected.push(app);
        }
    }

    return collected;
}

function openAll() {
    const apps =
        collectAppsForOpenAll(
            getCurrentMenu().apps,
        );

    if (apps.length === 0) {
        statusMessage =
            `${ANSI.yellow}` +
            "Nenhum módulo deste menu foi configurado com all: true." +
            `${ANSI.reset}`;

        renderMenu();
        return;
    }

    let fallbackCount = 0;
    let launchedCount = 0;

    for (const app of apps) {
        const result =
            openExternalApp(app);

        launchedCount += result.launched;

        if (result?.fallback) {
            fallbackCount += 1;
        }
    }

    statusMessage =
        `${ANSI.green}` +
        `${launchedCount} execução(ões) iniciada(s).` +
        `${ANSI.reset}`;

    if (fallbackCount > 0) {
        statusMessage +=
            ` ${ANSI.yellow}` +
            `${fallbackCount} módulo(s) foram abertos no CMD.` +
            `${ANSI.reset}`;
    }

    renderMenu();
}

async function executeSelectedItem() {
    const menu =
        getCurrentMenu();

    const items =
        getMenuItems(menu);

    const item =
        items[menu.selectedIndex];

    if (!item || busy) {
        return;
    }

    if (item.type === "open_all") {
        openAll();
        return;
    }

    if (item.type === "submenu") {
        openSubmenu(item);
        return;
    }

    if (item.type === "back") {
        goBack();
        return;
    }

    if (item.type === "terminal") {
        closeLauncher(10);
        return;
    }

    if (item.type === "exit") {
        closeLauncher(11);
        return;
    }

    if (item.type === "same") {
        if (hasOwn(item, "commands")) {
            await runCommandsWithSameFirst(item);
        } else {
            await runInCurrentTerminal(item);
        }
        return;
    }

    if (
        item.type === "new" ||
        item.type === "newsame"
    ) {
        const result =
            openExternalApp(item);

        statusMessage =
            `${ANSI.green}` +
            `${result.launched} execução(ões) de ${item.name} iniciada(s).` +
            `${ANSI.reset}`;

        if (result?.fallback) {
            statusMessage +=
                ` ${ANSI.yellow}` +
                "O Windows Terminal não foi encontrado; " +
                "o módulo foi aberto no CMD." +
                `${ANSI.reset}`;
        }

        renderMenu();
        return;
    }

    statusMessage =
        `${ANSI.red}` +
        `Tipo de execução desconhecido: ${item.type}` +
        `${ANSI.reset}`;

    renderMenu();
}

function closeLauncher(exitCode = 0) {
    showCursor();

    process.stdin.removeListener(
        "keypress",
        handleKeypress,
    );

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }

    process.stdin.pause();

    process.exit(exitCode);
}

function handleKeypress(_, key) {
    if (busy || !key) {
        return;
    }

    if (
        key.ctrl &&
        key.name === "c"
    ) {
        closeLauncher(0);
        return;
    }

    if (
        key.name === "escape" ||
        key.name === "left" ||
        key.name === "backspace"
    ) {
        if (!goBack()) {
            closeLauncher(0);
        }

        return;
    }

    const menu =
        getCurrentMenu();

    const items =
        getMenuItems(menu);

    if (key.name === "up") {
        menu.selectedIndex -= 1;

        if (menu.selectedIndex < 0) {
            menu.selectedIndex =
                items.length - 1;
        }

        statusMessage = "";

        renderMenu();
        return;
    }

    if (key.name === "down") {
        menu.selectedIndex += 1;

        if (
            menu.selectedIndex >=
            items.length
        ) {
            menu.selectedIndex = 0;
        }

        statusMessage = "";

        renderMenu();
        return;
    }

    if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "right"
    ) {
        void executeSelectedItem();
    }
}

function validateMenuItems(
    apps,
    path = launcherConfig.title,
) {
    if (!Array.isArray(apps)) {
        throw new TypeError(
            `As opções de "${path}" precisam estar em um array.`,
        );
    }

    for (const app of apps) {
        if (
            !app ||
            typeof app !== "object"
        ) {
            throw new TypeError(
                `Existe uma opção inválida em "${path}".`,
            );
        }

        if (
            !app.name ||
            typeof app.name !== "string"
        ) {
            throw new TypeError(
                `Existe uma opção sem nome válido em "${path}".`,
            );
        }

        if (
            !app.type ||
            typeof app.type !== "string"
        ) {
            throw new TypeError(
                `A opção "${app.name}" não possui um type válido.`,
            );
        }

        if (app.type === "submenu") {
            validateMenuItems(
                getSubmenuApps(app),
                `${path} > ${app.name}`,
            );

            continue;
        }

        if (
            app.type === "same" ||
            app.type === "new" ||
            app.type === "newsame"
        ) {
            validateAppCommands(
                app,
                `${path} > ${app.name}`,
            );
        }
    }
}

function validateAppCommands(app, path) {
    const hasCommand =
        hasOwn(app, "command");
    const hasCommands =
        hasOwn(app, "commands");

    if (hasCommand && hasCommands) {
        throw new TypeError(
            `A opção "${path}" deve usar command ou commands, nunca os dois.`,
        );
    }

    if (!hasCommand && !hasCommands) {
        throw new TypeError(
            `A opção "${path}" precisa definir command ou commands.`,
        );
    }

    if (hasCommand) {
        validateCommandEntry(
            app.command,
            `${path}.command`,
        );
        return;
    }

    if (
        !Array.isArray(app.commands) ||
        app.commands.length === 0
    ) {
        throw new TypeError(
            `commands de "${path}" precisa ser um array não vazio.`,
        );
    }

    app.commands.forEach(
        (entry, index) => {
            validateCommandEntry(
                entry,
                `${path}.commands[${index}]`,
            );
        },
    );
}

function validateCommandEntry(entry, path) {
    if (typeof entry === "string") {
        if (entry.trim()) {
            return;
        }

        throw new TypeError(
            `O comando "${path}" não pode estar vazio.`,
        );
    }

    if (
        !Array.isArray(entry) ||
        entry.length === 0
    ) {
        throw new TypeError(
            `O comando "${path}" precisa ser uma string ou um array não vazio de strings.`,
        );
    }

    entry.forEach(
        (command, index) => {
            if (
                typeof command !== "string" ||
                !command.trim()
            ) {
                throw new TypeError(
                    `O item "${path}[${index}]" precisa ser uma string não vazia.`,
                );
            }
        },
    );
}

function startLauncher() {
    if (
        !process.stdin.isTTY ||
        !process.stdout.isTTY
    ) {
        console.error(
            "[ERRO] O launcher precisa ser executado " +
            "em um terminal interativo.",
        );

        process.exit(1);
    }

    validateMenuItems(
        launcherConfig.apps,
    );

    readline.emitKeypressEvents(
        process.stdin,
    );

    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on(
        "keypress",
        handleKeypress,
    );

    process.on(
        "exit",
        showCursor,
    );

    process.on(
        "SIGINT",
        () => {
            closeLauncher(0);
        },
    );

    process.on(
        "uncaughtException",
        (error) => {
            showCursor();

            console.error(error);

            process.exit(1);
        },
    );

    process.on(
        "unhandledRejection",
        (error) => {
            showCursor();

            console.error(error);

            process.exit(1);
        },
    );

    clearScreenOnce();
    hideCursor();
    renderMenu();
}

if (require.main === module) {
    startLauncher();
}
