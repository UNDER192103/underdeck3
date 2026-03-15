import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import QRCode from "qrcode";
import { MainAppService } from "./main-app.js";
import { WebDeckService } from "./webdeck.js";
import { SoundPadService } from "./soundpad.js";
import { ObsService } from "./obs.js";
import { Settings } from "./settings.js";
import { logsService } from "./logs.js";
import { getDb } from "./database.js";
import { observerService, ObserverChannels, ObserverEventDataMap } from "./observer.js";

const { app: electronApp } = electron;
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

export class ExpressServer {
  private app: express.Application;
  private port: number;
  private server: HttpServer | null = null;
  private io: SocketIOServer | null = null;
  private appService: MainAppService;
  private webDeckService: WebDeckService;
  private soundPadService: SoundPadService;
  private obsService: ObsService;
  private unsubscribers: Array<() => void> = [];

  private isDevMode() {
    return !electronApp.isPackaged && process.env.NODE_ENV !== "production";
  }

  private isAllowedDevOrigin(origin: string) {
    // Sempre retorna true - qualquer origem é permitida
    // Esta função pode ser usada para logging no futuro
    return true;
  }

  private getLocalIpv4Address() {
    const interfaces = os.networkInterfaces();
    const virtualNamePattern = /(hamachi|tailscale|zerotier|wireguard|tun|tap|vpn|virtual|vbox|vmware)/i;
    const privateCandidates: string[] = [];
    const otherCandidates: string[] = [];

    const isPrivateIpv4 = (address: string) => {
      const parts = address.split(".").map((part) => Number(part));
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
      if (parts[0] === 10) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      return false;
    };

    for (const [name, entries] of Object.entries(interfaces)) {
      if (virtualNamePattern.test(name)) continue;
      for (const entry of entries ?? []) {
        if (!entry) continue;
        if (entry.family !== "IPv4") continue;
        if (entry.internal) continue;
        const address = entry.address;
        if (isPrivateIpv4(address)) {
          privateCandidates.push(address);
          continue;
        }
        otherCandidates.push(address);
      }
    }

    if (privateCandidates.length > 0) return privateCandidates[0];
    if (otherCandidates.length > 0) return otherCandidates[0];
    return "127.0.0.1";
  }

  private async emitWebDeckUpdate() {
    if (!this.io) return false;
    const timestamp = Date.now();
    const { icons: autoIcons, timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
    const mappedAutoIcons = this.mapAutoIconsMediaUrls(autoIcons, autoIconTimestamps);
    this.io.emit("webdeck:pages-changed", {
      pages: this.webDeckService.listPages().map((page) => this.mapPageMediaUrls(page, mappedAutoIcons.pages, mappedAutoIcons.items, autoIconTimestamps)),
      autoIcons: {
        pages: mappedAutoIcons.pages,
        items: mappedAutoIcons.items,
      },
      at: timestamp,
    });
    return true;
  }

  constructor(
    port: number,
    appService: MainAppService,
    webDeckService: WebDeckService,
    soundPadService: SoundPadService,
    obsService: ObsService
  ) {
    this.app = express();
    this.port = port;
    this.appService = appService;
    this.webDeckService = webDeckService;
    this.soundPadService = soundPadService;
    this.obsService = obsService;
    this.configureMiddleware();
    this.configureRoutes();
  }

  private configureMiddleware() {
    this.app.use(express.json({ limit: "2mb" }));
    this.app.use((req, res, next) => {
      const requestOrigin = String(req.headers.origin || "").trim();
      
      // Sempre permite qualquer origem (localhost, IPs locais, etc)
      res.header("Access-Control-Allow-Origin", requestOrigin || "*");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        String(req.headers["access-control-request-headers"] || "Content-Type, Authorization")
      );
      // Sempre permite credentials para suportar cookies/sessões
      res.header("Access-Control-Allow-Credentials", "true");
      if (requestOrigin) {
        res.header("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  private getStorageRootPath() {
    return path.join(electronApp.getPath("userData"), Settings.get("storage").baseFolder);
  }

  private resolveMediaRelativePathToAbsolutePath(relativePath: string) {
    const normalizedRelative = String(relativePath || "").replace(/^\/+/, "");
    const target = path.normalize(path.join(this.getStorageRootPath(), normalizedRelative));
    const root = path.normalize(this.getStorageRootPath());
    if (!target.startsWith(root)) return null;
    return target;
  }

  private mediaUrlToHttpUrl(url: string | null | undefined, version?: number) {
    if (!url) return url ?? null;
    const raw = String(url).trim();
    if (!raw.startsWith("underdeck-media://")) return raw;
    try {
      const parsed = new URL(raw);
      const relativePath = `${parsed.hostname}${parsed.pathname}`.replace(/^\/+/, "");
      if (!relativePath) return raw;
      const baseUrl = `/media/${relativePath
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
        .join("/")}`;
      // Adiciona versão/timestamp para evitar cache quando o arquivo é atualizado
      const cacheBuster = version ?? Date.now();
      return `${baseUrl}?v=${cacheBuster}`;
    } catch {
      return raw;
    }
  }

  private getAutoItemKey(type: "app" | "soundpad" | "obs", refId: string) {
    return `${type}:${refId}`;
  }

  private mapPageMediaUrls<T extends { icon?: string | null; items?: Array<{ type?: string; refId?: string; icon?: string | null } | null> }>(
    page: T,
    autoPageIcons?: Record<string, string>,
    autoItemIcons?: Record<string, string>,
    version?: number | { pages?: Record<string, number>; items?: Record<string, number> }
  ): T {
    // Get version for page icon (use global version or default)
    const pageVersion = typeof version === "number" ? version : undefined;
    const icon = this.mediaUrlToHttpUrl(page.icon ?? null, pageVersion) ?? null;
    if (!Array.isArray(page.items)) {
      return { ...page, icon };
    }
    const timestamps = typeof version === "object" ? version : undefined;
    const items = page.items.map((item) => {
      if (!item) return item;
      const itemType = String(item.type ?? "").toLowerCase();
      const itemRefId = String(item.refId ?? "").trim();
      const fallbackAutoPageIcon =
        itemType === "page" && itemRefId.startsWith("__auto_page_")
          ? autoPageIcons?.[itemRefId] ?? null
          : null;
      const autoItemKey =
        itemType === "soundpad" || itemType === "obs" || itemType === "app"
          ? this.getAutoItemKey(itemType as "app" | "soundpad" | "obs", itemRefId)
          : "";
      const fallbackAutoItemIcon = autoItemKey ? autoItemIcons?.[autoItemKey] ?? null : null;
      // Use individual timestamp for auto icons if available
      let itemVersion = pageVersion;
      if (timestamps && itemRefId.startsWith("__auto_page_")) {
        itemVersion = timestamps.pages?.[itemRefId] ?? pageVersion;
      } else if (timestamps && autoItemKey) {
        itemVersion = timestamps.items?.[autoItemKey] ?? pageVersion;
      }
      return {
        ...item,
        icon: this.mediaUrlToHttpUrl(item.icon ?? null, itemVersion) ?? fallbackAutoPageIcon ?? fallbackAutoItemIcon ?? null,
      };
    });
    return { ...page, icon, items };
  }

  private mapAppMediaUrls<T extends { icon?: string | null }>(app: T, version?: number): T {
    return {
      ...app,
      icon: this.mediaUrlToHttpUrl(app.icon ?? null, version) ?? null,
    };
  }

  private mapAutoIconsMediaUrls(
    autoIcons: { pages?: Record<string, string>; items?: Record<string, string> },
    version?: number | { pages?: Record<string, number>; items?: Record<string, number> }
  ) {
    const pages: Record<string, string> = {};
    const items: Record<string, string> = {};
    const timestamps = typeof version === "object" ? version : undefined;
    const globalVersion = typeof version === "number" ? version : undefined;
    for (const [key, value] of Object.entries(autoIcons.pages ?? {})) {
      const iconVersion = timestamps?.pages?.[key] ?? globalVersion;
      const mapped = this.mediaUrlToHttpUrl(value, iconVersion);
      if (!mapped) continue;
      pages[key] = mapped;
    }
    for (const [key, value] of Object.entries(autoIcons.items ?? {})) {
      const iconVersion = timestamps?.items?.[key] ?? globalVersion;
      const mapped = this.mediaUrlToHttpUrl(value, iconVersion);
      if (!mapped) continue;
      items[key] = mapped;
    }
    return { pages, items };
  }

  private getThemePreferences() {
    const defaults = {
      theme: "ligth",
      background: { variant: "neural" } as
        | { variant: "neural" }
        | { variant: "image"; imageSrc: string }
        | { variant: "video"; videoSrc: string },
    };

    try {
      const db = getDb("theme");
      db.prepare(`
        CREATE TABLE IF NOT EXISTS theme_preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();

      const themeRow = db.prepare("SELECT value FROM theme_preferences WHERE key = ? LIMIT 1").get("theme") as
        | { value: string }
        | undefined;
      const backgroundRow = db
        .prepare("SELECT value FROM theme_preferences WHERE key = ? LIMIT 1")
        .get("background") as { value: string } | undefined;

      const theme = (() => {
        if (!themeRow?.value) return defaults.theme;
        try {
          const parsed = JSON.parse(themeRow.value);
          if (parsed === "ligth" || parsed === "dark" || parsed === "black" || parsed === "transparent") {
            return parsed;
          }
          return defaults.theme;
        } catch {
          return defaults.theme;
        }
      })();

      const background = (() => {
        if (!backgroundRow?.value) return defaults.background;
        try {
          const parsed = JSON.parse(backgroundRow.value) as
            | { variant?: "neural" }
            | { variant?: "image"; imageSrc?: string }
            | { variant?: "video"; videoSrc?: string };
          if (parsed?.variant === "image" && parsed.imageSrc) {
            return { variant: "image", imageSrc: this.mediaUrlToHttpUrl(parsed.imageSrc) ?? parsed.imageSrc };
          }
          if (parsed?.variant === "video" && parsed.videoSrc) {
            return { variant: "video", videoSrc: this.mediaUrlToHttpUrl(parsed.videoSrc) ?? parsed.videoSrc };
          }
          return defaults.background;
        } catch {
          return defaults.background;
        }
      })();

      return { theme, background };
    } catch {
      return defaults;
    }
  }

  private getStaticCandidates() {
    const userDefined = process.env.WEBDECK_STATIC_DIR?.trim();
    const appRoots = new Set<string>();
    const pushRoot = (target: string | null | undefined) => {
      if (!target) return;
      appRoots.add(path.resolve(target));
    };

    pushRoot(process.cwd());
    pushRoot(currentDirPath);
    for (let i = 0; i < 6; i += 1) {
      pushRoot(path.resolve(currentDirPath, ...Array(i).fill("..")));
    }

    if (process.resourcesPath) {
      pushRoot(process.resourcesPath);
      pushRoot(path.join(process.resourcesPath, "app"));
      pushRoot(path.join(process.resourcesPath, "app.asar"));
    }

    const candidates = [
      userDefined || "",
      ...Array.from(appRoots).flatMap((root) => [
        path.join(root, "renderer"),
        path.join(root, "src", "renderer"),
        path.join(root, "dist", "renderer"),
        path.join(root, "webdeck-client"),
        path.join(root, "resources", "webdeck-client"),
        path.join(root, "apps", "desktop", "client", "dist", "public"),
        path.join(root, "apps", "desktop", "client", "dist"),
        path.join(root, "apps", "remote", "dist", "public"),
        path.join(root, "apps", "remote", "dist"),
      ]),
      path.join(electronApp.getPath("userData"), "webdeck-client"),
    ].filter(Boolean);

    return [...new Set(candidates)];
  }

  private resolveStaticDir() {
    const candidates = this.getStaticCandidates();
    for (const candidate of candidates) {
      const indexPath = path.join(candidate, "index.html");
      const webdeckPath = path.join(candidate, "webdeck", "index.html");
      const webdeckHtmlPath = path.join(candidate, "webdeck.html");
      if (fs.existsSync(indexPath) || fs.existsSync(webdeckPath) || fs.existsSync(webdeckHtmlPath)) {
        return candidate;
      }
    }
    return null;
  }

  private setupStaticRoutes() {
    const staticDir = this.resolveStaticDir();
    const webdeckIndexFromDir = (dir: string) => path.join(dir, "webdeck", "index.html");
    const webdeckHtmlFromDir = (dir: string) => path.join(dir, "webdeck.html");
    const loadingIndexFromDir = (dir: string) => path.join(dir, "loading", "index.html");
    const loadingHtmlFromDir = (dir: string) => path.join(dir, "loading.html");
    const defaultIndexFromDir = (dir: string) => path.join(dir, "index.html");
    if (!staticDir) {
      const devPort = Number(process.env.WEB_PORT) || 3404;
      if (!electronApp.isPackaged) {
        this.app.get("/", (_req, res) => {
          res.redirect(`http://127.0.0.1:${devPort}/webdeck/`);
        });
        this.app.get(/^\/webdeck(?:\/.*)?$/, (_req, res) => {
          res.redirect(`http://127.0.0.1:${devPort}/webdeck/`);
        });
        this.app.get(/^\/loading(?:\/.*)?$/, (_req, res) => {
          res.redirect(`http://127.0.0.1:${devPort}/loading/`);
        });
        return;
      }
      this.app.get("/", (_req, res) => {
        res.status(200).json({
          ok: true,
          message: "UnderDeck API Online",
          hint:
            "Defina WEBDECK_STATIC_DIR ou copie o build do cliente para resources/webdeck-client para servir a UI.",
        });
      });
      return;
    }

    // Serve build assets from root as Vite uses absolute /assets paths by default.
    this.app.use(express.static(staticDir, { index: false }));
    const webdeckIndex = webdeckIndexFromDir(staticDir);
    const webdeckHtml = webdeckHtmlFromDir(staticDir);
    const loadingIndex = loadingIndexFromDir(staticDir);
    const loadingHtml = loadingHtmlFromDir(staticDir);
    const fallbackIndex = defaultIndexFromDir(staticDir);
    this.app.get("/", (_req, res) => {
      res.redirect("/webdeck");
    });
    this.app.get(/^\/webdeck(?:\/.*)?$/, (_req, res) => {
      if (fs.existsSync(webdeckIndex)) {
        res.sendFile(webdeckIndex);
        return;
      }
      if (fs.existsSync(webdeckHtml)) {
        res.sendFile(webdeckHtml);
        return;
      }
      res.sendFile(fallbackIndex);
    });
    this.app.get(/^\/loading(?:\/.*)?$/, (_req, res) => {
      if (fs.existsSync(loadingIndex)) {
        res.sendFile(loadingIndex);
        return;
      }
      if (fs.existsSync(loadingHtml)) {
        res.sendFile(loadingHtml);
        return;
      }
      res.sendFile(fallbackIndex);
    });
  }

  private async executeByType(type: string, id: string) {
    const normalizedType = String(type || "").toLowerCase();
    const normalizedId = decodeURIComponent(String(id || "")).trim();
    if (!normalizedType || !normalizedId) {
      return { ok: false, message: "Tipo ou id inválido." };
    }

    if (normalizedType === "app") {
      const ok = await this.appService.executeApp(normalizedId);
      return { ok: Boolean(ok), message: ok ? "App executado." : "Falha ao executar app." };
    }

    if (normalizedType === "soundpad-audio") {
      const index = Number(normalizedId);
      const result = await this.soundPadService.playSound(index);
      return result;
    }

    if (normalizedType === "soundpad-app") {
      const ok = await this.appService.executeApp(normalizedId);
      return { ok: Boolean(ok), message: ok ? "SoundPad app executado." : "Falha ao executar app SoundPad." };
    }

    if (normalizedType === "obs-scene") {
      return this.obsService.setCurrentScene(normalizedId);
    }

    if (normalizedType === "obs-audio") {
      return this.obsService.toggleInputMute(normalizedId);
    }

    if (normalizedType === "obs-action") {
      const action = normalizedId.toLowerCase();
      const map: Record<string, () => Promise<{ ok: boolean; message: string }>> = {
        startstream: () => this.obsService.startStream(),
        stopstream: () => this.obsService.stopStream(),
        togglestream: () => this.obsService.toggleStream(),
        startrecord: () => this.obsService.startRecord(),
        stoprecord: () => this.obsService.stopRecord(),
        togglerecordpause: () => this.obsService.toggleRecordPause(),
        pauserecord: () => this.obsService.pauseRecord(),
        resumerecord: () => this.obsService.resumeRecord(),
      };
      const handler = map[action];
      if (!handler) {
        return { ok: false, message: "Ação OBS inválida." };
      }
      return handler();
    }

    if (normalizedType === "obs-app") {
      const ok = await this.appService.executeApp(normalizedId);
      return { ok: Boolean(ok), message: ok ? "OBS app executado." : "Falha ao executar app OBS." };
    }

    return { ok: false, message: "Tipo não suportado." };
  }

  private configureRoutes() {
    this.app.get(/^\/media\/(.+)$/, (req, res) => {
      try {
        const match = req.path.match(/^\/media\/(.+)$/);
        const rawRelativePath = match?.[1] ?? "";
        const relativePath = rawRelativePath
          .split("/")
          .filter(Boolean)
          .map((segment) => decodeURIComponent(segment))
          .join("/");
        const absolutePath = this.resolveMediaRelativePathToAbsolutePath(relativePath);
        if (!absolutePath) {
          res.status(403).send("Forbidden");
          return;
        }
        if (!fs.existsSync(absolutePath)) {
          res.status(404).send("Not found");
          return;
        }
        res.sendFile(absolutePath);
      } catch {
        res.status(400).send("Bad request");
      }
    });

    this.app.get("/api/health", (_req, res) => {
      res.json({ ok: true, online: true, port: this.port });
    });

    this.app.get("/api/webdeck/config", async (_req, res) => {
      try {
        const timestamp = Date.now();
        const [pages, apps, obsState, soundpadAudios] = await Promise.all([
          this.webDeckService.listPages(),
          this.appService.listApps(),
          this.obsService.getState(),
          this.soundPadService.listAudios(),
        ]);
        const { icons: autoIconsRaw, timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
        const autoIcons = this.mapAutoIconsMediaUrls(autoIconsRaw, autoIconTimestamps);
        const mappedPages = pages.map((page) => this.mapPageMediaUrls(page, autoIcons.pages, autoIcons.items, autoIconTimestamps));
        const mappedApps = apps.map((app) => this.mapAppMediaUrls(app, timestamp));
        res.json({
          ok: true,
          pages: mappedPages,
          apps: mappedApps,
          theme: this.getThemePreferences(),
          autoIcons: {
            pages: autoIcons.pages,
            items: autoIcons.items,
          },
          obs: obsState,
          soundpad: {
            path: this.soundPadService.getPath(),
            audios: soundpadAudios,
          },
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao carregar config webdeck.",
        });
      }
    });

    this.app.get("/api/webdeck/pages", async (_req, res) => {
      try {
        const timestamp = Date.now();
        const { icons: autoIconsRaw, timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
        const autoIcons = this.mapAutoIconsMediaUrls(autoIconsRaw, autoIconTimestamps);
        const pages = this.webDeckService.listPages().map((page) => this.mapPageMediaUrls(page, autoIcons.pages, autoIcons.items, autoIconTimestamps));
        res.json({ ok: true, pages, at: timestamp });
      } catch (error) {
        res.status(500).json({
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao listar páginas.",
        });
      }
    });

    this.app.post("/api/webdeck/execute/:type/:id", async (req, res) => {
      const { type, id } = req.params;
      const result = await this.executeByType(type, id);
      res.status(result.ok ? 200 : 400).json(result);
    });

    this.setupStaticRoutes();
  }

  private setupSocketBridge() {
    if (!this.io) return;
    const io = this.io;
    io.on("connection", (socket) => {
      socket.emit("connected", { ok: true, now: Date.now() });
      logsService.log("socket", "client.connected", { id: socket.id });
      
      // Handler para comandos do WebDeck remoto
      socket.on("device:command", (payload: { hwid?: string; cmd?: string; data?: any }, callback?: any) => {
        const { cmd, data } = payload;
        
        if (!cmd) {
          callback?.({ ok: false, error: "Missing command" });
          return;
        }
        
        // Repassa para o IPC main processar
        electron.ipcMain.emit("WebDeckSV-Command", {}, { cmd, data }, callback);
      });
      
      // Handler para comandos vindos do servidor remoto
      socket.on("app:command", (payload: { cmd?: string; data?: any }, callback?: any) => {
        const { cmd, data } = payload;
        
        if (!cmd) {
          callback?.({ ok: false, error: "Missing command" });
          return;
        }
        
        // Repassa para o IPC main processar
        electron.ipcMain.emit("WebDeckSV-Command", {}, { cmd, data }, callback);
      });
      
      socket.on("disconnect", (reason) => {
        logsService.log("socket", "client.disconnected", { id: socket.id, reason });
      });
    });

    // Subscribe to observer events instead of direct service events
    const unsubscribeWebDeck = observerService.subscribe(
      ObserverChannels.WEBDECK_PAGES_CHANGED,
      (payload) => {
        const data = payload.data as { pages?: Array<{ icon?: string | null; items?: Array<{ type?: string; refId?: string; icon?: string | null } | null> }>; autoIcons?: { pages?: Record<string, string>; items?: Record<string, string> } };
        const timestamp = Date.now();
        
        // Se não tem pages, busca todas as páginas atuais
        if (!data || !Array.isArray(data.pages)) {
          // Publicou dados vazios, busca o estado completo
          const allPages = this.webDeckService.listPages();
          const { icons: autoIcons, timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
          io.emit("webdeck:pages-changed", {
            pages: allPages.map((page) => this.mapPageMediaUrls(page, autoIcons.pages, autoIcons.items, autoIconTimestamps)),
            autoIcons: this.mapAutoIconsMediaUrls(autoIcons, autoIconTimestamps),
            at: timestamp,
          });
          return;
        }
        
        // Get timestamps for auto icons to use in cache-busting (only changes when icon actually changes)
        const { timestamps: autoIconTimestamps } = this.webDeckService.listAutoIconsWithTimestamps();
        io.emit("webdeck:pages-changed", {
          pages: data.pages.map((page) => this.mapPageMediaUrls(page, data.autoIcons?.pages, data.autoIcons?.items, autoIconTimestamps)),
          autoIcons: this.mapAutoIconsMediaUrls(data.autoIcons || {}, autoIconTimestamps),
          at: timestamp,
        });
      }
    );

    const unsubscribeApps = observerService.subscribe(
      ObserverChannels.APPS_CHANGED,
      async () => {
        const timestamp = Date.now();
        io.emit("apps:changed", {
          apps: (await this.appService.listApps()).map((app) => this.mapAppMediaUrls(app, timestamp)),
          at: timestamp,
        });
      }
    );

    const unsubscribeObs = observerService.subscribe(
      ObserverChannels.OBS_STATE_CHANGED,
      (payload) => {
        const data = payload.data as ObserverEventDataMap["obs:state-changed"];
        io.emit("obs:state-changed", {
          state: data.state,
          at: Date.now(),
        });
      }
    );

    const unsubscribeSoundPad = observerService.subscribe(
      ObserverChannels.SOUNDPAD_AUDIOS_CHANGED,
      (payload) => {
        const data = payload.data as ObserverEventDataMap["soundpad:audios-changed"];
        io.emit("soundpad:audios-changed", {
          audios: data.audios,
          at: Date.now(),
        });
      }
    );

    const unsubscribeTheme = observerService.subscribeMany(
      [
        ObserverChannels.THEME_CHANGED,
        ObserverChannels.THEME_PREFERENCES_CHANGED,
        ObserverChannels.THEME_BACKGROUND_CHANGED,
      ],
      (payload) => {
        const timestamp = Date.now();
        const data = payload.data;
        if (data && typeof data === "object" && !Array.isArray(data)) {
          io.emit(payload.channel, { ...data, at: timestamp });
          return;
        }
        io.emit(payload.channel, { data, at: timestamp });
      }
    );

    // Store unsubscribers for cleanup
    this.unsubscribers.push(unsubscribeWebDeck);
    this.unsubscribers.push(unsubscribeApps);
    this.unsubscribers.push(unsubscribeObs);
    this.unsubscribers.push(unsubscribeSoundPad);
    this.unsubscribers.push(unsubscribeTheme);
  }

  satus() {
    return this.server ? true : false;
  }

  start(port: number) {
    this.port = port;
    if (this.server) return true;
    this.server = this.app.listen(this.port, () => {
      console.log(`Server is running on port ${this.port}`);
    });
    logsService.log("socket", "server.start", { port: this.port });
    this.io = new SocketIOServer(this.server, {
      cors: {
        // Sempre permite qualquer origem (localhost, IPs locais, etc)
        origin: true,
        credentials: true,
      },
      path: "/socket.io",
    });
    this.setupSocketBridge();
    return true;
  }

  stop() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    if (this.io) {
      this.io.removeAllListeners();
      this.io.close();
      this.io = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    logsService.log("socket", "server.stop");
  }

  async notifyWebDeckChanged() {
    return this.emitWebDeckUpdate();
  }

  async getWebDeckAccessInfo() {
    const port = this.port;
    const localIp = this.getLocalIpv4Address();
    const localhostUrl = `http://localhost:${port}/webdeck/`;
    const localIpUrl = `http://${localIp}:${port}/webdeck/`;
    const qrCodeDataUrl = await QRCode.toDataURL(localIpUrl, {
      margin: 1,
      width: 320,
    });
    return {
      localhostUrl,
      localIp,
      localIpUrl,
      inviteUrl: "",
      qrCodeDataUrl,
    };
  }
}
