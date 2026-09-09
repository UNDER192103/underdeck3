import { useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { GlobalObserverProvider } from "@/contexts/GlobalObserverContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveChatProvider } from "@/contexts/LiveChatContext";
import LiveChatOverlayView from "./LiveChatOverlayView";

const readScope = () => {
  const scope = new URLSearchParams(window.location.search).get("scope");
  return scope === "twitch" || scope === "tiktok" ? scope : "combined";
};

export default function LiveChatApp() {
  const scope = readScope();
  useEffect(() => {
    document.documentElement.classList.add("black");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  return (
    <ErrorBoundary>
      <GlobalObserverProvider
        sourceId={`LIVE_CHAT_OVERLAY_${scope.toUpperCase()}`}
      >
        <I18nProvider>
          <TooltipProvider>
            <LiveChatProvider scope={scope}>
              <LiveChatOverlayView scope={scope} />
            </LiveChatProvider>
          </TooltipProvider>
        </I18nProvider>
      </GlobalObserverProvider>
    </ErrorBoundary>
  );
}
