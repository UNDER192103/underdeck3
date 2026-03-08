import { Loader2 } from "lucide-react";
import { BackgroundComp, type BackgroundProps } from "../components/ui/background";
import { useEffect, useState } from "react";
import type { UpdateLoadingState } from "../types/electron";

const background: BackgroundProps = {
  variant: "neural",
};

export default function LoadingApp() {
  const [state, setState] = useState<UpdateLoadingState>({
    phase: "checking",
    message: "Procurando Atualizacao",
    progressPercent: 0,
    version: null,
  });

  useEffect(() => {
    let unsubscribe = () => {};

    void window.underdeck.updates
      .getLoadingState()
      .then((payload) => {
        if (payload?.message) {
          setState(payload);
        }
      })
      .catch(() => {
        // ignore
      });

    unsubscribe = window.underdeck.updates.onLoadingStateChanged((payload) => {
      if (!payload?.message) return;
      setState(payload);
    });

    return () => unsubscribe();
  }, []);

  const isDownloading = state.phase === "downloading";
  const progress = Math.max(0, Math.min(100, Math.round(state.progressPercent ?? 0)));

  return (
    <div
      className="relative h-screen w-screen overflow-hidden text-white select-none [app-region:drag] [-webkit-app-region:drag]"
    >
      <BackgroundComp {...background} />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-cyan-300" />
        <p className="text-sm tracking-wide text-slate-100">{state.message}</p>
        {isDownloading ? (
          <div className="w-64 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900/70">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-slate-300">{progress}%</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
