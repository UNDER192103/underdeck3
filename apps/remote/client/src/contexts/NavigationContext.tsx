import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type NavigationStore = Record<string, string>;

interface NavigationContextType {
  set: (key: string, value: string) => void;
  get: (key: string) => string | undefined;
}

const defaultStore: NavigationStore = {
  pages: "home",
  homePages: "apps",
  overlayPages: "webdeck",
  overlayWebdeckPages: "deck",
};

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<NavigationStore>(defaultStore);

  const set = useCallback((key: string, value: string) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    setStore((prev) => ({ ...prev, [normalizedKey]: String(value ?? "") }));
  }, []);

  const get = useCallback((key: string) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return undefined;
    return store[normalizedKey];
  }, [store]);

  const value = useMemo<NavigationContextType>(() => ({ set, get }), [set, get]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}
