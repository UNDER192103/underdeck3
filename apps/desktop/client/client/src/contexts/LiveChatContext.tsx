import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useGlobalObserver } from "@/contexts/GlobalObserverContext";
import type { LiveChatEvent, LiveChatState } from "@/types/electron";

type LiveChatContextValue = {
  state: LiveChatState | null;
  events: LiveChatEvent[];
  messages: LiveChatEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  clear: (broadcast?: boolean) => Promise<void>;
};

const LiveChatContext = createContext<LiveChatContextValue | null>(null);

export function LiveChatProvider({
  children,
  scope = "combined",
}: {
  children: React.ReactNode;
  scope?: "combined" | "twitch" | "tiktok";
}) {
  const { subscribe } = useGlobalObserver();
  const [state, setState] = useState<LiveChatState | null>(null);
  const [events, setEvents] = useState<LiveChatEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const api = window.underdeck?.liveChat;
    if (!api) return;
    try {
      setState(await api.getState());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribe(
      ["live-chat:settings-changed", "live-chat:state-changed"],
      () => void refresh(),
      false,
    );
  }, [refresh, subscribe]);

  useEffect(() => {
    return subscribe(
      "live-chat:clear-requested",
      (payload) => {
        const requestedScope = String(
          (payload.data as { scope?: string } | undefined)?.scope ?? "",
        );
        if (
          !requestedScope ||
          requestedScope === scope ||
          requestedScope === "combined"
        )
          setEvents([]);
      },
      false,
    );
  }, [scope, subscribe]);

  const overlayScopeState = state?.settings.overlay.scopeStates?.[scope];
  const paused = overlayScopeState?.paused ?? Boolean(state?.settings.overlay.paused);
  const enabled = Boolean(state?.settings.enabled);
  const maxMessages = state?.settings.overlay.maxMessages ?? 200;
  const showSelf = Boolean(state?.settings.twitch.display.showSelfMessages);

  useEffect(() => {
    const api = window.underdeck?.liveChat;
    if (!api || paused || !enabled) return;
    return api.onEvent((event) => {
      if (scope !== "combined" && event.provider !== scope) return;
      if (event.event === "message" && event.self && !showSelf) return;
      setEvents((current) => [...current, event].slice(-(maxMessages * 3)));
    });
  }, [enabled, maxMessages, paused, scope, showSelf]);

  useEffect(() => {
    setEvents((current) => current.slice(-(maxMessages * 3)));
  }, [maxMessages]);

  const clear = useCallback(
    async (broadcast = true) => {
      setEvents([]);
      if (broadcast) await window.underdeck?.liveChat?.clear(scope);
    },
    [scope],
  );

  const value = useMemo<LiveChatContextValue>(
    () => ({
      state,
      events,
      messages: events
        .filter((event) => event.event === "message")
        .slice(-maxMessages),
      loading,
      refresh,
      clear,
    }),
    [clear, events, loading, maxMessages, refresh, state],
  );

  return (
    <LiveChatContext.Provider value={value}>
      {children}
    </LiveChatContext.Provider>
  );
}

export function useLiveChat() {
  const value = useContext(LiveChatContext);
  if (!value)
    throw new Error("useLiveChat must be used within LiveChatProvider");
  return value;
}
