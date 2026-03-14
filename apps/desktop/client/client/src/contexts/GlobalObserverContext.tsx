import React, { createContext, useCallback, useContext, useMemo } from "react";
import type { ObserverEventPayload } from "@/types/electron";

type ObserverHandler = (payload: ObserverEventPayload) => void;

interface GlobalObserverContextType {
  publish: (payload: Partial<ObserverEventPayload>) => void;
  /** 
   * @param ignoreSelf Se true, ignora mensagens enviadas por este mesmo Provider (evita eco)
   */
  subscribe: (
    channels: string | string[] | "GLOBAL",
    handler: ObserverHandler,
    ignoreSelf?: boolean
  ) => () => void;
}

const GlobalObserverContext = createContext<GlobalObserverContextType | undefined>(undefined);

export function GlobalObserverProvider({
  children,
  sourceId = "APP_ELECTRON",
}: {
  children: React.ReactNode;
  sourceId?: string;
}) {

  const publish = useCallback((payload: Partial<ObserverEventPayload>) => {
    if (window?.underdeck?.globalObserver?.publish) {
      const normalizedPayload: ObserverEventPayload = {
        // Usando random para garantir unicidade se vários publish ocorrerem no mesmo ms
        id: String(payload.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
        channel: String(payload.channel || "GLOBAL"),
        data: payload.data,
        sourceId: String(payload.sourceId || sourceId),
        timestamp: Number(payload.timestamp || Date.now()),
      };
      window?.underdeck?.globalObserver?.publish(normalizedPayload);
    }
  }, [sourceId]);

  const subscribe = useCallback((
    channels: string | string[] | "GLOBAL",
    handler: ObserverHandler,
    ignoreSelf = true // Por padrão, evitamos o eco no mesmo fluxo
  ) => {
    const internalListener = (payload: ObserverEventPayload) => {
      if (!payload) return;

      // Lógica de "Anti-Eco": Se a mensagem veio daqui e ignoreSelf for true, paramos aqui.
      if (ignoreSelf && payload.sourceId === sourceId) {
        return;
      }

      const isGlobal = channels === "GLOBAL";
      const isInArray = Array.isArray(channels) && channels.includes(payload.channel);
      const isDirectMatch = typeof channels === "string" && channels === payload.channel;

      if (isGlobal || isInArray || isDirectMatch) {
        handler(payload);
      }
    };

    if (window?.underdeck?.globalObserver?.subscribe) {
      window?.underdeck?.globalObserver?.subscribe(internalListener);
    }

    return () => {
      window?.underdeck?.globalObserver?.removeListener(internalListener);
    };
  }, [sourceId]); // Adicionado sourceId como dependência

  const value = useMemo(() => ({ publish, subscribe }), [publish, subscribe]);

  return (
    <GlobalObserverContext.Provider value={value}>
      {children}
    </GlobalObserverContext.Provider>
  );
}

export function useGlobalObserver() {
  const context = useContext(GlobalObserverContext);
  if (!context) {
    throw new Error("useGlobalObserver must be used within GlobalObserverProvider");
  }
  return context;
}
