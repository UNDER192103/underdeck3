import { EventEmitter } from "node:events";
import electron from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { NotificationService } from "./notifications.js";
import { Settings } from "./settings.js";
import { TranslationService } from "./translations.js";

const { app } = electron;

export type LoadingPhase =
  | "checking"
  | "downloading"
  | "installing"
  | "loading-app";

export type LoadingState = {
  phase: LoadingPhase;
  message: string;
  progressPercent?: number;
  version?: string | null;
};

export type UpdateState = {
  currentVersion: string;
  checking: boolean;
  updateAvailable: boolean;
  downloading: boolean;
  installing: boolean;
  downloaded: boolean;
  autoDownloadEnabled: boolean;
  availableVersion: string | null;
  downloadPercent: number;
  lastError: string | null;
  lastCheckedAt: number | null;
  lastAvailableReleaseDate: string | null;
  lastUpdatedAt: number | null;
};

const DEFAULT_LOADING_STATE: LoadingState = {
  phase: "checking",
  message: "Procurando Atualizacao",
  progressPercent: 0,
  version: null,
};

function normalizeVersion(version: string) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "");
}

function compareSemver(a: string, b: string) {
  const pa = normalizeVersion(a).split(".").map((part) => Number(part) || 0);
  const pb = normalizeVersion(b).split(".").map((part) => Number(part) || 0);
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export class UpdaterService extends EventEmitter {
  private state: UpdateState = {
    currentVersion: app.getVersion(),
    checking: false,
    updateAvailable: false,
    downloading: false,
    installing: false,
    downloaded: false,
    autoDownloadEnabled: false,
    availableVersion: null,
    downloadPercent: 0,
    lastError: null,
    lastCheckedAt: null,
    lastAvailableReleaseDate: null,
    lastUpdatedAt: null,
  };

  private loadingState: LoadingState = { ...DEFAULT_LOADING_STATE };
  private translationService: TranslationService;
  private initialized = false;

  constructor(translationService?: TranslationService) {
    super();
    this.translationService = translationService ?? new TranslationService();
    this.state.autoDownloadEnabled = this.getAutoDownloadSetting();
    const updates = Settings.get("updates");
    this.state.lastAvailableReleaseDate = String(updates?.lastAvailableReleaseDate || "") || null;
    this.state.lastUpdatedAt = Number(updates?.lastUpdatedAt || 0) || null;
    this.setupAutoUpdaterEvents();
  }

  private getAutoDownloadSetting() {
    const updates = Settings.get("updates");
    return Boolean(updates?.autoDownloadWhenAvailable);
  }

  private setLoadingState(next: LoadingState) {
    this.loadingState = {
      ...next,
      version: next.version ?? null,
      progressPercent: typeof next.progressPercent === "number" ? next.progressPercent : 0,
    };
    this.emit("loading-state-changed", this.getLoadingState());
  }

  private updateState(patch: Partial<UpdateState>) {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.emit("state-changed", this.getState());
  }

  private setupAutoUpdaterEvents() {
    autoUpdater.on("error", (error) => {
      this.updateState({
        checking: false,
        downloading: false,
        installing: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      this.updateState({
        downloading: true,
        downloadPercent: percent,
      });

      this.setLoadingState({
        phase: "downloading",
        message: this.translationService.t(
          "updates.loading.downloading",
          `Baixando Atualizacao V${this.state.availableVersion || ""}`,
          { version: this.state.availableVersion || "" }
        ),
        progressPercent: percent,
        version: this.state.availableVersion,
      });
    });
  }

  public initialize() {
    if (this.initialized) return;
    this.initialized = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.fullChangelog = false;
  }

  public getState() {
    return { ...this.state };
  }

  public getLoadingState() {
    return { ...this.loadingState };
  }

  public setAutoDownloadWhenAvailable(enabled: boolean) {
    const current = Settings.get("updates");
    Settings.set("updates", {
      ...current,
      autoDownloadWhenAvailable: Boolean(enabled),
    });
    this.updateState({
      autoDownloadEnabled: Boolean(enabled),
    });
    return this.getState();
  }

  public async checkForStartupUpdates() {
    return this.checkForUpdatesCore({ installIfFound: this.getAutoDownloadSetting() });
  }

  public async checkAndInstallIfAvailable() {
    return this.checkForUpdatesCore({ installIfFound: true });
  }

  private async checkForUpdatesCore(options: { installIfFound: boolean }) {
    this.initialize();
    this.updateState({
      checking: true,
      lastError: null,
      lastCheckedAt: Date.now(),
      autoDownloadEnabled: this.getAutoDownloadSetting(),
    });
    this.setLoadingState({
      phase: "checking",
      message: this.translationService.t("updates.loading.checking", "Procurando Atualizacao"),
      progressPercent: 0,
      version: null,
    });

    if (!app.isPackaged) {
      this.updateState({ checking: false, updateAvailable: false });
      this.setLoadingState({
        phase: "loading-app",
        message: this.translationService.t("updates.loading.loadingApp", "Carregando Aplicativo"),
        progressPercent: 0,
        version: null,
      });
      return { shouldContinueAppStartup: true, updateAvailable: false, downloaded: false };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      const currentVersion = app.getVersion();
      const availableVersion = normalizeVersion(info?.version || "");
      const releaseDateRaw = String(info?.releaseDate || "").trim();
      const releaseDate = releaseDateRaw || null;
      const isSuperior = availableVersion
        ? compareSemver(availableVersion, currentVersion) > 0
        : false;

      if (!isSuperior) {
        this.updateState({
          checking: false,
          updateAvailable: false,
          availableVersion: null,
          downloadPercent: 0,
          lastAvailableReleaseDate: null,
        });
        this.setLoadingState({
          phase: "loading-app",
          message: this.translationService.t("updates.loading.loadingApp", "Carregando Aplicativo"),
          progressPercent: 0,
          version: null,
        });
        return { shouldContinueAppStartup: true, updateAvailable: false, downloaded: false };
      }

      this.updateState({
        checking: false,
        updateAvailable: true,
        downloaded: false,
        availableVersion,
        downloadPercent: 0,
        lastAvailableReleaseDate: releaseDate,
      });
      Settings.set("updates", {
        ...Settings.get("updates"),
        lastAvailableReleaseDate: releaseDate,
      });

      NotificationService.send(
        this.translationService.t("updates.notification.title", "Atualizacao disponivel"),
        this.translationService.t(
          "updates.notification.availableBody",
          `Nova versao ${availableVersion} disponivel.`,
          { version: availableVersion }
        )
      );

      if (!options.installIfFound) {
        this.setLoadingState({
          phase: "loading-app",
          message: this.translationService.t("updates.loading.loadingApp", "Carregando Aplicativo"),
          progressPercent: 0,
          version: null,
        });
        return { shouldContinueAppStartup: true, updateAvailable: true, downloaded: false };
      }

      await this.downloadAndInstall();
      return { shouldContinueAppStartup: false, updateAvailable: true, downloaded: true };
    } catch (error) {
      this.updateState({
        checking: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
      this.setLoadingState({
        phase: "loading-app",
        message: this.translationService.t("updates.loading.loadingApp", "Carregando Aplicativo"),
        progressPercent: 0,
        version: null,
      });
      return { shouldContinueAppStartup: true, updateAvailable: false, downloaded: false };
    }
  }

  public async downloadAndInstall() {
    const version = this.state.availableVersion || "";
    if (!version) return false;

    this.updateState({
      downloading: true,
      installing: false,
      downloaded: false,
      downloadPercent: 0,
      lastError: null,
    });

    this.setLoadingState({
      phase: "downloading",
      message: this.translationService.t(
        "updates.loading.downloading",
        `Baixando Atualizacao V${version}`,
        { version }
      ),
      progressPercent: 0,
      version,
    });

    try {
      await autoUpdater.downloadUpdate();
      this.updateState({
        downloading: false,
        downloaded: true,
        installing: true,
        downloadPercent: 100,
        lastUpdatedAt: Date.now(),
      });
      Settings.set("updates", {
        ...Settings.get("updates"),
        lastUpdatedAt: Date.now(),
      });

      this.setLoadingState({
        phase: "installing",
        message: this.translationService.t("updates.loading.installing", "Instalando Atualizacao"),
        progressPercent: 100,
        version,
      });

      NotificationService.send(
        this.translationService.t("updates.notification.title", "Atualizacao disponivel"),
        this.translationService.t(
          "updates.notification.installingBody",
          `Instalando versao ${version}.`,
          { version }
        )
      );

      // Silencioso (sem UI do instalador) e reabre o app ao final.
      autoUpdater.quitAndInstall(true, true);
      return true;
    } catch (error) {
      this.updateState({
        downloading: false,
        installing: false,
        downloaded: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
      this.setLoadingState({
        phase: "loading-app",
        message: this.translationService.t("updates.loading.loadingApp", "Carregando Aplicativo"),
        progressPercent: 0,
        version: null,
      });
      return false;
    }
  }
}
