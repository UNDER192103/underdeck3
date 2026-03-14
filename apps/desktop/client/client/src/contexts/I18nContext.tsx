import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { builtinByLocale, builtinLocales, TranslationMessages } from "@/i18n/builtin";
import { useObserver } from "@/contexts/ObserverContext";

export interface LocaleOption {
  locale: string;
  name: string;
  source: "builtin" | "external";
}

interface I18nContextType {
  locale: string;
  locales: LocaleOption[];
  setLocale: (nextLocale: string) => Promise<void>;
  importLocaleFile: (filePath: string) => Promise<void>;
  removeLocale: (locale: string) => Promise<boolean>;
  refreshLocales: () => Promise<void>;
  t: (key: string, fallback?: string) => string;
}

const DEFAULT_LOCALE = "en-US";
const FALLBACK_LOCALE = "en-US";
const LOCALE_STORAGE_KEY = "underdeck:i18n:locale";

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function mergeLocales(externalLocales: Array<{ locale: string; name: string }>) {
  const registry = new Map<string, LocaleOption>();

  builtinLocales.forEach((item) => {
    registry.set(item.locale, {
      locale: item.locale,
      name: item.name,
      source: "builtin",
    });
  });

  externalLocales.forEach((item) => {
    registry.set(item.locale, {
      locale: item.locale,
      name: item.name,
      source: "external",
    });
  });

  return Array.from(registry.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { publish, subscribe } = useObserver();
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);
  const [locales, setLocales] = useState<LocaleOption[]>(mergeLocales([]));
  const [externalMessages, setExternalMessages] = useState<TranslationMessages>({});

  const getI18nApi = () => window.underdeck?.i18n;

  const refreshLocales = async () => {
    const api = getI18nApi();
    if (!api) {
      setLocales(mergeLocales([]));
      return;
    }
    const external = await api.listExternalLocales();
    setLocales(mergeLocales(external ?? []));
  };

  const loadLocale = async (nextLocale: string) => {
    const api = getI18nApi();
    if (api) {
      const messages = await api.getExternalMessages(nextLocale);
      setExternalMessages(messages ?? {});
    } else {
      setExternalMessages({});
    }
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await refreshLocales();
        const api = getI18nApi();
        const localStored = localStorage.getItem(LOCALE_STORAGE_KEY);
        const current = api ? await api.getCurrentLocale() : localStored;
        if (!mounted) return;
        await loadLocale(current || DEFAULT_LOCALE);
      } catch {
        if (!mounted) return;
        setLocaleState(DEFAULT_LOCALE);
        setExternalMessages({});
        localStorage.setItem(LOCALE_STORAGE_KEY, DEFAULT_LOCALE);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe("i18n", async () => {
      const api = getI18nApi();
      await refreshLocales();
      if (!api) return;
      const current = await api.getCurrentLocale();
      if (current && current !== locale) {
        await loadLocale(current);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [locale, subscribe]);

  const setLocale = async (nextLocale: string) => {
    const api = getI18nApi();
    if (api) {
      await api.setCurrentLocale(nextLocale);
    }
    await loadLocale(nextLocale);
    await refreshLocales();
    publish({ id: "i18n.setLocale", channel: "i18n", data: { locale: nextLocale } });
  };

  const importLocaleFile = async (filePath: string) => {
    const api = getI18nApi();
    if (!api) {
      throw new Error("API de idioma indisponivel.");
    }
    await api.importLocaleFile(filePath);
    await refreshLocales();
    publish({ id: "i18n.importLocale", channel: "i18n", data: { filePath } });
  };

  const removeLocale = async (targetLocale: string) => {
    const api = getI18nApi();
    if (!api) {
      throw new Error("API de idioma indisponivel.");
    }

    const removed = await api.deleteExternalLocale(targetLocale);
    await refreshLocales();
    if (removed && locale === targetLocale) {
      await setLocale(DEFAULT_LOCALE);
    }
    if (removed) {
      publish({ id: "i18n.removeLocale", channel: "i18n", data: { locale: targetLocale } });
    }
    return removed;
  };

  const dictionary = useMemo(() => {
    const fallbackMessages = builtinByLocale.get(FALLBACK_LOCALE)?.messages ?? {};
    const localeMessages = builtinByLocale.get(locale)?.messages ?? {};
    return {
      ...fallbackMessages,
      ...localeMessages,
      ...externalMessages,
    };
  }, [locale, externalMessages]);

  const t = (key: string, fallback?: string) => {
    return dictionary[key] ?? fallback ?? key;
  };

  return (
    <I18nContext.Provider
      value={{
        locale,
        locales,
        setLocale,
        importLocaleFile,
        removeLocale,
        refreshLocales,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
