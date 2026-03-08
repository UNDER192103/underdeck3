import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import { Settings } from "./settings.js";

const { app } = electron;

export interface LocaleInfo {
  locale: string;
  name: string;
}

interface LocaleFilePayload {
  locale?: string;
  name?: string;
  messages?: Record<string, string>;
  [key: string]: unknown;
}

export class TranslationService {
  private builtinMessages: Record<string, Record<string, string>> = {
    "en-US": {
      "tray.apps": "Apps",
      "tray.reopen": "Reopen",
      "tray.reload": "Reload",
      "tray.exit": "Exit",
      "updates.loading.checking": "Checking for updates",
      "updates.loading.downloading": "Downloading update V{version}",
      "updates.loading.installing": "Installing update",
      "updates.loading.loadingApp": "Loading application",
      "updates.notification.title": "Update available",
      "updates.notification.availableBody": "New version {version} is available.",
      "updates.notification.installingBody": "Installing version {version}.",
    },
    "pt-BR": {
      "tray.apps": "Aplicativos",
      "tray.reopen": "Reabrir",
      "tray.reload": "Recarregar",
      "tray.exit": "Sair",
      "updates.loading.checking": "Procurando Atualizacao",
      "updates.loading.downloading": "Baixando Atualizacao V{version}",
      "updates.loading.installing": "Instalando Atualizacao",
      "updates.loading.loadingApp": "Carregando Aplicativo",
      "updates.notification.title": "Atualizacao disponivel",
      "updates.notification.availableBody": "Nova versao {version} disponivel.",
      "updates.notification.installingBody": "Instalando versao {version}.",
    },
  };

  private getTranslationsDir() {
    const baseFolder = Settings.get("storage").baseFolder;
    const dir = path.join(app.getPath("userData"), baseFolder, "translations");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getLocaleFilePath(locale: string) {
    return path.join(this.getTranslationsDir(), `${locale}.json`);
  }

  private parsePayload(raw: string) {
    const parsed = JSON.parse(raw) as LocaleFilePayload | Record<string, string>;
    const hasMessagesField = typeof parsed === "object" && parsed !== null && "messages" in parsed;
    if (hasMessagesField) {
      const payload = parsed as LocaleFilePayload;
      return {
        locale: payload.locale,
        name: payload.name,
        messages: payload.messages ?? {},
      };
    }

    return {
      locale: undefined,
      name: undefined,
      messages: parsed as Record<string, string>,
    };
  }

  listExternalLocales() {
    const dir = this.getTranslationsDir();
    const files = fs.readdirSync(dir).filter((file) => file.toLowerCase().endsWith(".json"));
    const locales: LocaleInfo[] = [];

    files.forEach((fileName) => {
      const filePath = path.join(dir, fileName);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const payload = this.parsePayload(raw);
        const fallbackLocale = path.basename(fileName, ".json");
        const locale = payload.locale || fallbackLocale;
        const name = payload.name || locale;
        locales.push({ locale, name });
      } catch {
        // Ignore invalid locale files and keep listing working.
      }
    });

    return locales;
  }

  getExternalMessages(locale: string) {
    const filePath = this.getLocaleFilePath(locale);
    if (!fs.existsSync(filePath)) return {};
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const payload = this.parsePayload(raw);
      return payload.messages ?? {};
    } catch {
      return {};
    }
  }

  importLocaleFile(sourcePath: string) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error("Arquivo de tradução não encontrado.");
    }

    const raw = fs.readFileSync(sourcePath, "utf-8");
    const payload = this.parsePayload(raw);
    const fileNameLocale = path.basename(sourcePath, path.extname(sourcePath));
    const locale = payload.locale || fileNameLocale;

    if (!locale) {
      throw new Error("Locale invalido no arquivo de traducao.");
    }

    const name = payload.name || locale;
    const messages = payload.messages ?? {};
    if (!messages || typeof messages !== "object") {
      throw new Error("Mensagens invalidas no arquivo de traducao.");
    }

    const targetPath = this.getLocaleFilePath(locale);
    const normalized = {
      locale,
      name,
      messages,
    };
    fs.writeFileSync(targetPath, JSON.stringify(normalized, null, 2), "utf-8");

    return { locale, name };
  }

  deleteExternalLocale(locale: string) {
    const normalized = (locale ?? "").trim();
    if (!normalized) return false;

    const dir = this.getTranslationsDir();
    const files = fs.readdirSync(dir).filter((file) => file.toLowerCase().endsWith(".json"));

    const directPath = path.join(dir, `${normalized}.json`);
    if (fs.existsSync(directPath)) {
      fs.unlinkSync(directPath);
      return true;
    }

    for (const fileName of files) {
      const filePath = path.join(dir, fileName);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const payload = this.parsePayload(raw);
        const fileLocale = payload.locale || path.basename(fileName, ".json");
        if (fileLocale === normalized) {
          fs.unlinkSync(filePath);
          return true;
        }
      } catch {
        // Ignore invalid files while trying to find the target locale.
      }
    }

    return false;
  }

  getCurrentLocale() {
    return Settings.get("i18n").locale;
  }

  setCurrentLocale(locale: string) {
    const current = Settings.get("i18n");
    Settings.set("i18n", {
      ...current,
      locale,
    });
    return locale;
  }

  t(key: string, fallback: string, params?: Record<string, string | number>) {
    const i18n = Settings.get("i18n");
    const locale = String(i18n?.locale || "en-US");
    const fallbackLocale = String(i18n?.fallbackLocale || "en-US");
    const externalMessages = this.getExternalMessages(locale);
    const fallbackExternalMessages = this.getExternalMessages(fallbackLocale);
    const localized =
      externalMessages?.[key] ??
      this.builtinMessages[locale]?.[key] ??
      fallbackExternalMessages?.[key] ??
      this.builtinMessages[fallbackLocale]?.[key] ??
      fallback;

    let text = String(localized || fallback || key);
    if (!params || typeof params !== "object") return text;

    Object.entries(params).forEach(([paramKey, value]) => {
      const token = `{${paramKey}}`;
      text = text.split(token).join(String(value));
    });

    return text;
  }
}
