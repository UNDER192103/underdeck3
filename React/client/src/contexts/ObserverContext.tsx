import React, { createContext, useCallback, useContext, useMemo } from "react";
import type { ObserverEventPayload } from "@/types/electron";

type ObserverHandler = (payload: ObserverEventPayload) => void;

interface ObserverContextType {
  publish: (payload: Partial<ObserverEventPayload>) => void;
  subscribe: (channels: string | string[] | "global", handler: ObserverHandler) => () => void;
}

const ObserverContext = createContext<ObserverContextType | undefined>(undefined);

function defaultSourceId() {
  const path = window.location.pathname.toLowerCase();
  if (path === "/overlay" || path.startsWith("/overlay/")) return "OVERLAY";
  return "APP_ELECTRON";
}

export function ObserverProvider({ children }: { children: React.ReactNode }) {
  const publish = useCallback((payload: Partial<ObserverEventPayload>) => {
    window.underdeck.observer.publish({
      id: String(payload.id || "unknown"),
      channel: String(payload.channel || "global"),
      data: payload.data,
      sourceId: String(payload.sourceId || defaultSourceId()),
      timestamp: Number(payload.timestamp || Date.now()),
    });
  }, []);

  const subscribe = useCallback((channels: string | string[] | "global", handler: ObserverHandler) => {
    const targetChannels = Array.isArray(channels) ? channels : [channels];
    return window.underdeck.observer.subscribe((payload) => {
      if (!payload) return;
      if (targetChannels.includes("global")) {
        handler(payload);
        return;
      }
      if (targetChannels.includes(payload.channel)) {
        handler(payload);
      }
    });
  }, []);

  const value = useMemo<ObserverContextType>(() => ({ publish, subscribe }), [publish, subscribe]);
  return <ObserverContext.Provider value={value}>{children}</ObserverContext.Provider>;
}

export function useObserver() {
  const context = useContext(ObserverContext);
  if (!context) {
    throw new Error("useObserver must be used within ObserverProvider");
  }
  return context;
}

