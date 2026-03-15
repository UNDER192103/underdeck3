import electron from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RendererSourceMode, RendererTargetConfig } from "../../const.js";
import { Settings } from "../services/settings.js";

const { app, shell } = electron;

type RendererPage = "main" | "overlay" | "webdeck" | "applauncher";

const DEFAULT_SOURCE_MODE: RendererSourceMode = RendererTargetConfig.sourceMode;

const parseSourceMode = (value: string | undefined): RendererSourceMode => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "local" || normalized === "url" || normalized === "auto") {
        return normalized;
    }
    return DEFAULT_SOURCE_MODE;
};

const useRemoteUrl = (isDev: boolean) => {
    const mode = parseSourceMode(process.env.ELECTRON_RENDERER_SOURCE_MODE);
    if (mode === "url") return true;
    if (mode === "local") return false;
    return isDev;
};

const getBaseUrl = (isDev: boolean) => {
    if (isDev) {
        const serverPort = String(process.env.SERVER_PORT || "").trim();
        const defaultDevBaseUrl = serverPort
            ? `http://localhost:${serverPort}`
            : RendererTargetConfig.devBaseUrl;
        return String(
            process.env.ELECTRON_RENDERER_DEV_URL
            || process.env.ELECTRON_RENDERER_BASE_URL
            || defaultDevBaseUrl
        ).trim();
    }
    return String(
        process.env.ELECTRON_RENDERER_PROD_URL
        || process.env.ELECTRON_RENDERER_BASE_URL
    ).trim();
};

const getLocalIndexPath = (isDev: boolean, page: RendererPage) => {
    const pageIndex = path.join(page, "index.html");
    const legacyCandidates = page === "main" ? ["index.html"] : [];

    const candidates = isDev
        ? [
            path.join(process.cwd(), "src", "renderer", pageIndex),
            ...legacyCandidates.map((file) => path.join(process.cwd(), "src", "renderer", file)),
        ]
        : [
            path.join(app.getAppPath(), "renderer", pageIndex),
            ...legacyCandidates.map((file) => path.join(app.getAppPath(), "renderer", file)),
            path.join(process.resourcesPath, "renderer", pageIndex),
            ...legacyCandidates.map((file) => path.join(process.resourcesPath, "renderer", file)),
            path.join(app.getAppPath(), "src", "renderer", pageIndex),
            ...legacyCandidates.map((file) => path.join(app.getAppPath(), "src", "renderer", file)),
            path.join(process.resourcesPath, "app.asar.unpacked", "src", "renderer", pageIndex),
            ...legacyCandidates.map((file) => path.join(process.resourcesPath, "app.asar.unpacked", "src", "renderer", file)),
        ];

    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
};

const normalizePathname = (value: string) => {
    const decoded = decodeURIComponent(value || "");
    // Em Windows tratamos caminho sem case-sensitive para evitar falsos negativos.
    return process.platform === "win32" ? decoded.toLowerCase() : decoded;
};

const isInsideFileIndexScope = (targetUrl: string, indexFileUrl: string) => {
    try {
        const target = new URL(targetUrl);
        const allowed = new URL(indexFileUrl);
        if (target.protocol !== "file:" || allowed.protocol !== "file:") return false;

        const targetPath = normalizePathname(target.pathname);
        const allowedPath = normalizePathname(allowed.pathname);
        return targetPath === allowedPath || targetPath.startsWith(`${allowedPath}/`);
    } catch {
        return false;
    }
};

const attachNavigationLock = (
    win: Electron.BrowserWindow,
    shouldAllowUrl: (targetUrl: string) => boolean
) => {
    const shouldOpenExternal = () => Boolean(Settings.get("electron")?.openLinksInBrowser);

    const maybeOpenExternal = (targetUrl: string) => {
        if (!shouldOpenExternal()) return;
        try {
            void shell.openExternal(targetUrl);
        } catch {
            // ignore
        }
    };

    win.webContents.on("will-navigate", (event, targetUrl) => {
        if (shouldAllowUrl(targetUrl)) return;
        if (shouldOpenExternal()) {
            event.preventDefault();
            maybeOpenExternal(targetUrl);
        }
    });

    win.webContents.on("will-redirect", (event, targetUrl) => {
        if (shouldAllowUrl(targetUrl)) return;
        if (shouldOpenExternal()) {
            event.preventDefault();
            maybeOpenExternal(targetUrl);
        }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (shouldAllowUrl(url)) return { action: "allow" };
        if (shouldOpenExternal()) {
            maybeOpenExternal(url);
            return { action: "deny" };
        }
        return { action: "allow" };
    });
};

const lockNavigationToIndexFile = (win: Electron.BrowserWindow, indexFilePath: string) => {
    const allowedIndexUrl = pathToFileURL(indexFilePath).toString();
    const shouldAllowUrl = (targetUrl: string) => isInsideFileIndexScope(targetUrl, allowedIndexUrl);
    attachNavigationLock(win, shouldAllowUrl);
};

const lockNavigationToBaseUrl = (win: Electron.BrowserWindow, baseUrl: string) => {
    let allowedOrigin = "";
    try {
        allowedOrigin = new URL(baseUrl).origin;
    } catch {
        allowedOrigin = "";
    }
    const shouldAllowUrl = (targetUrl: string) => {
        try {
            const target = new URL(targetUrl);
            return allowedOrigin !== "" && target.origin === allowedOrigin;
        } catch {
            return false;
        }
    };
    attachNavigationLock(win, shouldAllowUrl);
};

const loadRendererPage = (win: Electron.BrowserWindow, isDev: boolean, page: RendererPage) => {
    if (useRemoteUrl(isDev)) {
        const baseUrl = getBaseUrl(isDev);
        const remotePath = page === "main" ? "/" : `/${page}/`;
        const target = new URL(remotePath, baseUrl).toString();
        lockNavigationToBaseUrl(win, baseUrl);
        void win.loadURL(target);
        return;
    }
    const rendererIndexPath = getLocalIndexPath(isDev, page);
    lockNavigationToIndexFile(win, rendererIndexPath);
    void win.loadFile(rendererIndexPath);
};

export const loadMainRenderer = (win: Electron.BrowserWindow, isDev: boolean) => {
    loadRendererPage(win, isDev, "main");
};

export const loadOverlayRenderer = (win: Electron.BrowserWindow, isDev: boolean) => {
    loadRendererPage(win, isDev, "overlay");
};

export const loadAppLauncherRenderer = (win: Electron.BrowserWindow, isDev: boolean) => {
    loadRendererPage(win, isDev, "applauncher");
};

export const getRendererLoadMode = () => parseSourceMode(process.env.ELECTRON_RENDERER_SOURCE_MODE);
export const isPackagedApp = () => app.isPackaged;
