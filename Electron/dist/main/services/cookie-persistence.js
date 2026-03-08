import electron from "electron";
import fs from "node:fs/promises";
import path from "node:path";
const { app, session } = electron;
const PERSIST_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias para cookies de sessao.
const normalizeUrl = (cookie) => {
    const domain = String(cookie.domain || "").replace(/^\./, "");
    const secure = Boolean(cookie.secure);
    const protocol = secure ? "https" : "http";
    const host = domain || "localhost";
    const cookiePath = cookie.path || "/";
    return `${protocol}://${host}${cookiePath}`;
};
const toSerializable = (cookie) => {
    const expirationDate = typeof cookie.expirationDate === "number" && Number.isFinite(cookie.expirationDate)
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
    filePath = path.join(app.getPath("userData"), "cookies-persisted.json");
    saveTimer = null;
    cookieListener = null;
    getSessionRef() {
        return session.defaultSession;
    }
    async init() {
        const sessionRef = this.getSessionRef();
        await this.restore();
        this.cookieListener = () => {
            this.scheduleSave();
        };
        sessionRef.cookies.on("changed", this.cookieListener);
    }
    async dispose() {
        const sessionRef = this.getSessionRef();
        if (this.cookieListener) {
            sessionRef.cookies.removeListener("changed", this.cookieListener);
            this.cookieListener = null;
        }
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.saveNow();
    }
    scheduleSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.saveNow();
        }, 250);
    }
    async saveNow() {
        try {
            const sessionRef = this.getSessionRef();
            const cookies = await sessionRef.cookies.get({});
            const serialized = cookies.map(toSerializable);
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            await fs.writeFile(this.filePath, JSON.stringify(serialized), "utf-8");
        }
        catch {
            // ignore persistence errors
        }
    }
    async restore() {
        try {
            const sessionRef = this.getSessionRef();
            const raw = await fs.readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0)
                return;
            const nowInSeconds = Math.floor(Date.now() / 1000);
            for (const cookie of parsed) {
                if (!cookie?.url || !cookie?.name)
                    continue;
                if (typeof cookie.expirationDate === "number" && cookie.expirationDate <= nowInSeconds)
                    continue;
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
                }
                catch {
                    // ignore invalid/obsolete cookies
                }
            }
        }
        catch {
            // no file yet or invalid json
        }
    }
}
