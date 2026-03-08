import electron from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RendererTargetConfig } from "../../const.js";
const { app } = electron;
const DEFAULT_SOURCE_MODE = RendererTargetConfig.sourceMode;
const parseSourceMode = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "local" || normalized === "url" || normalized === "auto") {
        return normalized;
    }
    return DEFAULT_SOURCE_MODE;
};
const useRemoteUrl = (isDev) => {
    const mode = parseSourceMode(process.env.ELECTRON_RENDERER_SOURCE_MODE);
    if (mode === "url")
        return true;
    if (mode === "local")
        return false;
    return isDev;
};
const getBaseUrl = (isDev) => {
    if (isDev) {
        const serverPort = String(process.env.SERVER_PORT || "").trim();
        const defaultDevBaseUrl = serverPort
            ? `http://localhost:${serverPort}`
            : RendererTargetConfig.devBaseUrl;
        return String(process.env.ELECTRON_RENDERER_DEV_URL
            || process.env.ELECTRON_RENDERER_BASE_URL
            || defaultDevBaseUrl).trim();
    }
    return String(process.env.ELECTRON_RENDERER_PROD_URL
        || process.env.ELECTRON_RENDERER_BASE_URL).trim();
};
const getLocalIndexPath = (isDev, page) => {
    const pageIndex = path.join(page, "index.html");
    const legacyCandidates = page === "main" ? ["index.html"] : [];
    const candidates = isDev
        ? [
            path.join(process.cwd(), "src", "renderer", pageIndex),
            ...legacyCandidates.map((file) => path.join(process.cwd(), "src", "renderer", file)),
        ]
        : [
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
const normalizePathname = (value) => {
    const decoded = decodeURIComponent(value || "");
    // Em Windows tratamos caminho sem case-sensitive para evitar falsos negativos.
    return process.platform === "win32" ? decoded.toLowerCase() : decoded;
};
const isInsideFileIndexScope = (targetUrl, indexFileUrl) => {
    try {
        const target = new URL(targetUrl);
        const allowed = new URL(indexFileUrl);
        if (target.protocol !== "file:" || allowed.protocol !== "file:")
            return false;
        const targetPath = normalizePathname(target.pathname);
        const allowedPath = normalizePathname(allowed.pathname);
        return targetPath === allowedPath || targetPath.startsWith(`${allowedPath}/`);
    }
    catch {
        return false;
    }
};
const lockNavigationToIndexFile = (win, indexFilePath) => {
    const allowedIndexUrl = pathToFileURL(indexFilePath).toString();
    const shouldBlock = (targetUrl) => !isInsideFileIndexScope(targetUrl, allowedIndexUrl);
    win.webContents.on("will-navigate", (event, targetUrl) => {
        if (!shouldBlock(targetUrl))
            return;
        event.preventDefault();
    });
    win.webContents.on("will-redirect", (event, targetUrl) => {
        if (!shouldBlock(targetUrl))
            return;
        event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (shouldBlock(url)) {
            return { action: "deny" };
        }
        return { action: "allow" };
    });
};
const loadRendererPage = (win, isDev, page) => {
    if (useRemoteUrl(isDev)) {
        const baseUrl = getBaseUrl(isDev);
        const remotePath = page === "main" ? "/" : `/${page}/`;
        const target = new URL(remotePath, baseUrl).toString();
        void win.loadURL(target);
        return;
    }
    const rendererIndexPath = getLocalIndexPath(isDev, page);
    lockNavigationToIndexFile(win, rendererIndexPath);
    void win.loadFile(rendererIndexPath);
};
export const loadMainRenderer = (win, isDev) => {
    loadRendererPage(win, isDev, "main");
};
export const loadOverlayRenderer = (win, isDev) => {
    loadRendererPage(win, isDev, "overlay");
};
export const loadLoadingRenderer = (win, isDev) => {
    loadRendererPage(win, isDev, "loading");
};
export const getRendererLoadMode = () => parseSourceMode(process.env.ELECTRON_RENDERER_SOURCE_MODE);
export const isPackagedApp = () => app.isPackaged;
