import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { SocketSettings } from "@/const";
import type { ObserverEventPayload } from "@/types/electron";

type ObserverHandler = (payload: ObserverEventPayload) => void;
type ObserverMode = "auto" | "electron" | "express";

interface ObserverContextType {
  publish: (payload: Partial<ObserverEventPayload>) => void;
  subscribe: (channels: string | string[] | "global", handler: ObserverHandler) => () => void;
}

const ObserverContext = createContext<ObserverContextType | undefined>(undefined);

export function ObserverProvider({
  children,
  sourceId = "APP_ELECTRON",
  mode = "auto",
  socketUrl,
}: {
  children: React.ReactNode;
  sourceId?: string;
  mode?: ObserverMode;
  socketUrl?: string;
}) {
  const listenersRef = useRef<Set<ObserverHandler>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const electronUnsubscribeRef = useRef<(() => void) | null>(null);
  const hasElectronObserver = Boolean(window.underdeck?.observer);
  const shouldUseElectron = mode === "electron" || (mode === "auto" && hasElectronObserver);
  const shouldUseExpress = mode === "express" || (mode === "auto" && !hasElectronObserver);

  const dispatchLocal = useCallback((payload: ObserverEventPayload) => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // ignore listener failures
      }
    });
  }, []);

  useEffect(() => {
    if (!shouldUseElectron || !window.underdeck?.observer?.subscribe) return;
    electronUnsubscribeRef.current = window.underdeck.observer.subscribe((payload) => {
      if (!payload) return;
      dispatchLocal(payload);
    });

    return () => {
      if (!electronUnsubscribeRef.current) return;
      electronUnsubscribeRef.current();
      electronUnsubscribeRef.current = null;
    };
  }, [dispatchLocal, shouldUseElectron]);

  useEffect(() => {
    if (!shouldUseExpress) return;

    const fallbackOrigin = String(window.location?.origin || "").trim();
    const resolvedSocketUrl =
      String(socketUrl || "").trim()
      || (fallbackOrigin && fallbackOrigin !== "null" ? fallbackOrigin : "")
      || SocketSettings.url;

    const socket = io(resolvedSocketUrl, {
      path: "/socket.io",
      transports: ["websocket"],
      withCredentials: true,
    });
    socketRef.current = socket;

    const emitAsObserver = (channel: string, id: string, data: unknown) => {
      dispatchLocal({
        id,
        channel,
        data,
        sourceId: "EXPRESS_SOCKET",
        timestamp: Date.now(),
      });
    };

    socket.on("apps:changed", (payload) => emitAsObserver("apps", "apps.changed", payload));
    socket.on("webdeck:pages-changed", (payload) => emitAsObserver("webdeck", "webdeck.pages_changed", payload));
    socket.on("obs:state-changed", (payload) => emitAsObserver("obs", "obs.state_changed", payload));
    socket.on("soundpad:audios-changed", (payload) => emitAsObserver("soundpad", "soundpad.audios_changed", payload));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [dispatchLocal, shouldUseExpress, socketUrl]);

  const publish = useCallback((payload: Partial<ObserverEventPayload>) => {
    const normalizedPayload: ObserverEventPayload = {
      id: String(payload.id || "unknown"),
      channel: String(payload.channel || "global"),
      data: payload.data,
      sourceId: String(payload.sourceId || sourceId),
      timestamp: Number(payload.timestamp || Date.now()),
    };

    if (shouldUseElectron && window.underdeck?.observer?.publish) {
      window.underdeck.observer.publish(normalizedPayload);
    }

    dispatchLocal(normalizedPayload);
  }, [dispatchLocal, shouldUseElectron, sourceId]);

  const subscribe = useCallback((channels: string | string[] | "global", handler: ObserverHandler) => {
    const targetChannels = Array.isArray(channels) ? channels : [channels];
    const wrapped: ObserverHandler = (payload) => {
      if (!payload) return;
      if (targetChannels.includes("global")) {
        handler(payload);
        return;
      }
      if (targetChannels.includes(payload.channel)) {
        handler(payload);
      }
    };

    listenersRef.current.add(wrapped);
    return () => {
      listenersRef.current.delete(wrapped);
    };
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
