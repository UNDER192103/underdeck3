import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { UpdateManager } from "velopack";
import { NotificationService } from "./notifications.js";
import { Settings } from "./settings.js";
import { TranslationService } from "./translations.js";
const TOTAL_UPDATE_STEPS = 5;
const DEFAULT_LOADING_STATE = {
    phase: "checking",
    message: "Checking for updates",
    step: 0,
    totalSteps: TOTAL_UPDATE_STEPS,
    progressPercent: 0,
    version: null,
    bytesDownloaded: 0,
    totalBytes: 0,
    bytesPerSecond: null,
    detail: null,
};
function normalizeVersion(version) {
    return String(version || "").trim().replace(/^v/i, "");
}
function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0)
        return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    const fractionDigits = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function readPackageMetadata() {
    try {
        const packagePath = app.isPackaged
            ? path.join(app.getAppPath(), "package.json")
            : path.join(process.cwd(), "package.json");
        const raw = fs.readFileSync(packagePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export class UpdaterService extends EventEmitter {
    state = {
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
        downloadedBytes: 0,
        totalBytes: 0,
        bytesPerSecond: null,
    };
    loadingState = { ...DEFAULT_LOADING_STATE };
    translationService;
    initialized = false;
    shouldInstallOnDownloaded = false;
    updateManager = null;
    availableUpdate = null;
    currentDownloadStartedAt = 0;
    constructor(translationService) {
        super();
        this.translationService = translationService ?? new TranslationService();
        this.state.autoDownloadEnabled = this.getAutoDownloadSetting();
        const updates = Settings.get("updates");
        this.state.lastAvailableReleaseDate = String(updates?.lastAvailableReleaseDate || "") || null;
        this.state.lastUpdatedAt = Number(updates?.lastUpdatedAt || 0) || null;
    }
    getAutoDownloadSetting() {
        const updates = Settings.get("updates");
        return Boolean(updates?.autoDownloadWhenAvailable);
    }
    updateState(patch) {
        this.state = { ...this.state, ...patch };
        this.emit("state-changed", this.getState());
    }
    setLoadingState(next) {
        const progressPercent = typeof next.progressPercent === "number"
            ? next.progressPercent
            : (next.step && next.totalSteps
                ? Math.round((next.step / next.totalSteps) * 100)
                : 0);
        this.loadingState = {
            ...next,
            version: next.version ?? null,
            progressPercent,
            bytesDownloaded: Number(next.bytesDownloaded || 0),
            totalBytes: Number(next.totalBytes || 0),
            bytesPerSecond: next.bytesPerSecond ?? null,
            detail: next.detail ?? null,
        };
        this.emit("loading-state-changed", this.getLoadingState());
    }
    logDev(message, data) {
        this.emit("debug-log", {
            level: "log",
            message,
            data,
            timestamp: Date.now(),
        });
    }
    logError(message, error) {
        this.emit("debug-log", {
            level: "error",
            message,
            data: error,
            timestamp: Date.now(),
        });
        console.error(`[updates] ${message}:`, error);
    }
    getGithubFeedUrl() {
        const explicit = String(process.env.VELOPACK_FEED_URL || "").trim().replace(/\/+$/, "");
        if (explicit)
            return explicit;
        const packageMetadata = readPackageMetadata();
        const owner = String(process.env.GH_OWNER
            || packageMetadata?.underdeck?.github?.owner
            || "").trim();
        const repo = String(process.env.GH_REPO
            || packageMetadata?.underdeck?.github?.repo
            || "").trim();
        if (!owner || !repo)
            return "";
        return `https://github.com/${owner}/${repo}/releases/latest/download`;
    }
    getReleaseDate(update) {
        const notes = update?.TargetFullRelease?.NotesMarkdown || update?.TargetFullRelease?.NotesHtml || "";
        const tag = update?.TargetFullRelease?.Version || "";
        const current = Settings.get("updates");
        const fallback = String(current?.lastAvailableReleaseDate || "") || null;
        const matched = String(notes).match(/\b(\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]*)?)\b/);
        if (matched?.[1])
            return matched[1];
        if (tag)
            return fallback;
        return fallback;
    }
    initialize() {
        if (this.initialized)
            return;
        this.initialized = true;
        if (process.platform !== "win32" || !app.isPackaged) {
            this.logDev("initialize:skipped", { platform: process.platform, packaged: app.isPackaged });
            return;
        }
        const feedUrl = this.getGithubFeedUrl();
        if (!feedUrl) {
            this.logDev("initialize:skipped", { reason: "missing-feed-url" });
            return;
        }
        this.updateManager = new UpdateManager(feedUrl, {
            AllowVersionDowngrade: false,
            MaximumDeltasBeforeFallback: 10,
        });
        this.logDev("initialize:ready", { provider: "velopack", feedUrl });
    }
    getState() {
        return { ...this.state };
    }
    getLoadingState() {
        return { ...this.loadingState };
    }
    setAutoDownloadWhenAvailable(enabled) {
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
    async checkForStartupUpdates() {
        return this.checkForUpdatesCore({ installIfFound: this.getAutoDownloadSetting() });
    }
    async checkForUpdatesOnly() {
        return this.checkForUpdatesCore({ installIfFound: false });
    }
    async checkAndInstallIfAvailable() {
        return this.checkForUpdatesCore({ installIfFound: true });
    }
    async checkForUpdatesCore(options) {
        this.initialize();
        this.shouldInstallOnDownloaded = Boolean(options.installIfFound);
        this.updateState({
            checking: true,
            downloading: false,
            installing: false,
            downloaded: false,
            lastError: null,
            autoDownloadEnabled: this.getAutoDownloadSetting(),
            lastCheckedAt: Date.now(),
            downloadedBytes: 0,
            totalBytes: 0,
            bytesPerSecond: null,
            downloadPercent: 0,
        });
        this.setLoadingState({
            phase: "checking",
            message: `Step 1/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.checking", "Checking for updates")}`,
            step: 1,
            totalSteps: TOTAL_UPDATE_STEPS,
            version: null,
            bytesDownloaded: 0,
            totalBytes: 0,
            bytesPerSecond: null,
            detail: this.translationService.t("updates.loading.checking", "Checking for updates"),
        });
        if (!this.updateManager) {
            this.updateState({ checking: false, updateAvailable: false });
            this.setLoadingState({
                phase: "loading-app",
                message: `Step 5/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.loadingApp", "Loading application")}`,
                step: 5,
                totalSteps: TOTAL_UPDATE_STEPS,
                version: null,
            });
            return { shouldContinueAppStartup: true, updateAvailable: false, downloaded: false };
        }
        try {
            const update = await this.updateManager.checkForUpdatesAsync();
            this.availableUpdate = update;
            const availableVersion = normalizeVersion(update?.TargetFullRelease?.Version || "");
            const totalBytes = Number(update?.TargetFullRelease?.Size || 0);
            const releaseDateValue = this.getReleaseDate(update);
            if (!update || !availableVersion) {
                this.updateState({
                    checking: false,
                    updateAvailable: false,
                    availableVersion: null,
                    lastAvailableReleaseDate: null,
                });
                this.setLoadingState({
                    phase: "loading-app",
                    message: `Step 5/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.loadingApp", "Loading application")}`,
                    step: 5,
                    totalSteps: TOTAL_UPDATE_STEPS,
                    version: null,
                });
                return { shouldContinueAppStartup: true, updateAvailable: false, downloaded: false };
            }
            this.emit("update-available-passive", {
                version: availableVersion || null,
                releaseDate: releaseDateValue,
            });
            this.updateState({
                checking: false,
                updateAvailable: true,
                downloaded: false,
                availableVersion,
                totalBytes,
                lastAvailableReleaseDate: releaseDateValue,
            });
            Settings.set("updates", {
                ...Settings.get("updates"),
                lastAvailableReleaseDate: releaseDateValue,
            });
            NotificationService.send(this.translationService.t("updates.notification.title", "Update available"), this.translationService.t("updates.notification.availableBody", `New version ${availableVersion} is available.`, { version: availableVersion }));
            this.setLoadingState({
                phase: "downloading",
                message: `Step 2/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.updateFound", "Update found")}`,
                step: 2,
                totalSteps: TOTAL_UPDATE_STEPS,
                version: availableVersion,
                progressPercent: 40,
                bytesDownloaded: 0,
                totalBytes,
                bytesPerSecond: null,
                detail: totalBytes > 0
                    ? `v${availableVersion} â€¢ ${formatBytes(0)} / ${formatBytes(totalBytes)}`
                    : `v${availableVersion}`,
            });
            if (!options.installIfFound) {
                this.setLoadingState({
                    phase: "loading-app",
                    message: `Step 5/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.loadingApp", "Loading application")}`,
                    step: 5,
                    totalSteps: TOTAL_UPDATE_STEPS,
                    version: null,
                });
                return { shouldContinueAppStartup: true, updateAvailable: true, downloaded: false };
            }
            const installed = await this.downloadAndInstall(update);
            return { shouldContinueAppStartup: !installed, updateAvailable: true, downloaded: installed };
        }
        catch (error) {
            this.logError("checkForUpdates failed", error);
            this.availableUpdate = null;
            this.updateState({
                checking: false,
                lastError: error instanceof Error ? error.message : String(error),
            });
            this.setLoadingState({
                phase: "loading-app",
                message: `Step 5/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.loadingApp", "Loading application")}`,
                step: 5,
                totalSteps: TOTAL_UPDATE_STEPS,
                version: null,
            });
            return { shouldContinueAppStartup: true, updateAvailable: false, downloaded: false };
        }
    }
    async downloadAndInstall(updateOverride) {
        this.initialize();
        const update = updateOverride ?? this.availableUpdate;
        if (!this.updateManager || !update) {
            return false;
        }
        const version = normalizeVersion(update.TargetFullRelease?.Version || this.state.availableVersion || "");
        const totalBytes = Number(update.TargetFullRelease?.Size || 0);
        this.currentDownloadStartedAt = Date.now();
        this.emit("download-starting", { version: version || null });
        this.shouldInstallOnDownloaded = true;
        this.updateState({
            downloading: true,
            installing: false,
            downloaded: false,
            downloadPercent: 0,
            lastError: null,
            totalBytes,
            downloadedBytes: 0,
            bytesPerSecond: null,
            availableVersion: version || this.state.availableVersion,
            updateAvailable: true,
            checking: false,
        });
        this.setLoadingState({
            phase: "downloading",
            message: `Step 3/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.downloading", "Downloading update")}`,
            step: 3,
            totalSteps: TOTAL_UPDATE_STEPS,
            version: version || null,
            progressPercent: 0,
            bytesDownloaded: 0,
            totalBytes,
            bytesPerSecond: null,
            detail: totalBytes > 0
                ? `v${version} â€¢ ${formatBytes(0)} / ${formatBytes(totalBytes)}`
                : (version ? `v${version}` : null),
        });
        try {
            await this.updateManager.downloadUpdateAsync(update, (progress) => {
                const percent = Number(progress || 0);
                const downloadedBytes = totalBytes > 0 ? Math.min(totalBytes, Math.round((percent / 100) * totalBytes)) : 0;
                const elapsedMs = Math.max(1, Date.now() - this.currentDownloadStartedAt);
                const bytesPerSecond = downloadedBytes > 0 ? Math.round(downloadedBytes / (elapsedMs / 1000)) : null;
                this.updateState({
                    downloading: true,
                    downloadPercent: percent,
                    downloadedBytes,
                    totalBytes,
                    bytesPerSecond,
                });
                this.setLoadingState({
                    phase: "downloading",
                    message: `Step 3/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.downloading", "Downloading update")}`,
                    step: 3,
                    totalSteps: TOTAL_UPDATE_STEPS,
                    version: version || null,
                    progressPercent: percent,
                    bytesDownloaded: downloadedBytes,
                    totalBytes,
                    bytesPerSecond,
                    detail: totalBytes > 0
                        ? `v${version} â€¢ ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                        : (version ? `v${version}` : null),
                });
            });
            this.updateState({
                downloading: false,
                downloaded: true,
                installing: true,
                downloadPercent: 100,
                downloadedBytes: totalBytes,
                totalBytes,
            });
            this.setLoadingState({
                phase: "installing",
                message: `Step 4/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.installing", "Installing update")}`,
                step: 4,
                totalSteps: TOTAL_UPDATE_STEPS,
                version: version || null,
                progressPercent: 100,
                bytesDownloaded: totalBytes,
                totalBytes,
                bytesPerSecond: null,
                detail: version ? `Vers\u00e3o: v${version}` : null,
            });
            Settings.set("updates", {
                ...Settings.get("updates"),
                lastUpdatedAt: Date.now(),
                lastAvailableReleaseDate: this.state.lastAvailableReleaseDate,
            });
            this.updateState({
                lastUpdatedAt: Date.now(),
            });
            await delay(1200);
            this.setLoadingState({
                phase: "loading-app",
                message: `Step 5/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.restarting", "Restarting to apply update")}`,
                step: 5,
                totalSteps: TOTAL_UPDATE_STEPS,
                version: version || null,
                detail: this.translationService.t("updates.loading.restarting", "Restarting to apply update"),
            });
            this.updateManager.waitExitThenApplyUpdate(update, true, true);
            this.emit("restart-required", {
                version: version || null,
            });
            return true;
        }
        catch (error) {
            this.logError("downloadAndInstall failed", error);
            this.updateState({
                downloading: false,
                installing: false,
                downloaded: false,
                lastError: error instanceof Error ? error.message : String(error),
            });
            this.setLoadingState({
                phase: "loading-app",
                message: `Step 5/${TOTAL_UPDATE_STEPS}: ${this.translationService.t("updates.loading.loadingApp", "Loading application")}`,
                step: 5,
                totalSteps: TOTAL_UPDATE_STEPS,
                version: null,
            });
            return false;
        }
    }
}
