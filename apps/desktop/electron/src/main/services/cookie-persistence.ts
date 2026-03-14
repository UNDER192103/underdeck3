import electron from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const { app, session } = electron;

type SerializableCookie = {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
  expirationDate?: number;
};

const PERSIST_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias para cookies de sessao.

const normalizeUrl = (cookie: Electron.Cookie) => {
  const domain = String(cookie.domain || "").replace(/^\./, "");
  const secure = Boolean(cookie.secure);
  const protocol = secure ? "https" : "http";
  const host = domain || "localhost";
  const cookiePath = cookie.path || "/";
  return `${protocol}://${host}${cookiePath}`;
};

const toSerializable = (cookie: Electron.Cookie): SerializableCookie => {
  const expirationDate =
    typeof cookie.expirationDate === "number" && Number.isFinite(cookie.expirationDate)
      ? cookie.expirationDate
      : Math.floor(Date.now() / 1000) + PERSIST_TTL_SECONDS;

  return {
    url: normalizeUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate,
  };
};

export class CookiePersistenceService {
  private readonly filePath = path.join(app.getPath("userData"), "cookies-persisted.json");
  private saveTimer: NodeJS.Timeout | null = null;
  private cookieListener: ((event: Electron.Event, cookie: Electron.Cookie, cause: string, removed: boolean) => void) | null = null;

  private getSessionRef() {
    if (!app.isReady()) return null;
    return session.defaultSession;
  }

  async init() {
    const sessionRef = this.getSessionRef();
    if (!sessionRef) return;
    await this.restore();
    this.cookieListener = () => {
      this.scheduleSave();
    };
    sessionRef.cookies.on("changed", this.cookieListener);
  }

  async dispose() {
    const sessionRef = this.getSessionRef();
    if (sessionRef && this.cookieListener) {
      sessionRef.cookies.removeListener("changed", this.cookieListener);
      this.cookieListener = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveNow();
  }

  private scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, 250);
  }

  private async saveNow() {
    try {
      const sessionRef = this.getSessionRef();
      if (!sessionRef) return;
      const cookies = await sessionRef.cookies.get({});
      const serialized = cookies.map(toSerializable);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(serialized), "utf-8");
    } catch {
      // ignore persistence errors
    }
  }

  private async restore() {
    try {
      const sessionRef = this.getSessionRef();
      if (!sessionRef) return;
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as SerializableCookie[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      const nowInSeconds = Math.floor(Date.now() / 1000);
      for (const cookie of parsed) {
        if (!cookie?.url || !cookie?.name) continue;
        if (typeof cookie.expirationDate === "number" && cookie.expirationDate <= nowInSeconds) continue;
        try {
          await sessionRef.cookies.set({
            url: cookie.url,
            name: cookie.name,
            value: cookie.value ?? "",
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate,
          });
        } catch {
          // ignore invalid/obsolete cookies
        }
      }
    } catch {
      // no file yet or invalid json
    }
  }
}
