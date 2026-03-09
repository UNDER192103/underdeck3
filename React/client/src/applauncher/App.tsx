import { Loader2 } from "lucide-react";
import { BackgroundComp, type BackgroundProps } from "../components/ui/background";
import { useEffect, useState } from "react";
import type { UpdateLoadingState } from "../types/electron";

const background: BackgroundProps = {
  variant: "neural",
};

export default function AppLauncherApp() {
  const [state, setState] = useState<UpdateLoadingState>({
    phase: "checking",
    message: "Checking for updates",
    progressPercent: 0,
    version: null,
  });

  useEffect(() => {
    try {
      window.underdeck.observer.publish({
        id: "loading.ready",
        channel: "app",
        sourceId: "APP_LOADING",
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const updatesApi = (window as any)?.launcher?.updates || (window as any)?.underdeck?.updates;
    if (!updatesApi) {
      setState((prev) => ({
        ...prev,
        phase: "loading-app",
        message: "Preparing launcher...",
      }));
      return;
    }

    let unsubscribe = () => {};

    void updatesApi
      .getLoadingState()
      .then((payload: UpdateLoadingState) => {
        if (payload?.message) {
          setState(payload);
        }
      })
      .catch(() => {
        // ignore
      });

    unsubscribe = updatesApi.onLoadingStateChanged((payload: UpdateLoadingState) => {
      if (!payload?.message) return;
      setState(payload);
    });

    return () => unsubscribe();
  }, []);

  const isDownloading = state.phase === "downloading";
  const progress = Number(Math.max(0, Math.min(100, Number(state.progressPercent ?? 0))).toFixed(1));
  const formatBytes = (value?: number) => {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const fractionDigits = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
  };
  const detailText = state.detail
    || (isDownloading && state.totalBytes
      ? `${formatBytes(state.bytesDownloaded)} / ${formatBytes(state.totalBytes)}`
      : null);
  const speedText = isDownloading && state.bytesPerSecond
    ? `${formatBytes(state.bytesPerSecond)}/s`
    : null;
  const remainingText = isDownloading && state.totalBytes
    ? `${formatBytes(Math.max(0, Number(state.totalBytes || 0) - Number(state.bytesDownloaded || 0)))} restantes`
    : null;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden text-white select-none [app-region:drag] [-webkit-app-region:drag]"
    >
      <BackgroundComp {...background} />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-cyan-300" />
        <p className="w-[80%] max-w-md text-center whitespace-pre-line text-sm tracking-wide text-slate-100">
          {state.message}
        </p>
        {state.version ? (
          <p className="w-[80%] max-w-md text-center text-xs text-slate-300">{"Vers\u00e3o: v"}{state.version}</p>
        ) : null}
        {isDownloading ? (
          <div className="w-72 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900/70">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-slate-300">{progress}%</p>
            {detailText ? (
              <p className="w-[80%] max-w-md text-center whitespace-pre-line text-[11px] text-slate-300">
                {detailText}
              </p>
            ) : null}
            {speedText ? (
              <p className="text-center text-[11px] text-slate-400">{speedText}</p>
            ) : null}
            {remainingText ? (
              <p className="text-center text-[11px] text-slate-400">{remainingText}</p>
            ) : null}
          </div>
        ) : detailText ? (
          <p className="w-[80%] max-w-md text-center whitespace-pre-line text-[11px] text-slate-300">
            {detailText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
