import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { BackgroundProps } from "@/components/ui/background";
import axios from "axios";
import { StoreItem } from "@/types/store";
import type { StoredThemeBackground, StoredThemeName } from "@/types/electron";

export type Theme = "ligth" | "dark" | "black" | "transparent";
export interface Background {
  type: "transparent" | "neural"
};

interface ThemeContextType {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  background: BackgroundProps;
  setBackground: React.Dispatch<React.SetStateAction<BackgroundProps>>;
  listStoreBackgrounds: () => Promise<StoreItem[]>;
  switchable: boolean;
}

export function getThemes(theme: Theme): ("ligth" | "dark" | "black" | "transparent")[] {
  return [theme];
}

const allThemes: ("ligth" | "dark" | "black" | "transparent")[] = [
  ...getThemes("ligth"),
  ...getThemes("dark"),
  ...getThemes("black"),
  ...getThemes("transparent"),
];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultBackground?: BackgroundProps;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "ligth",
  defaultBackground = {
    variant: "neural",
  },
  switchable = false,
}: ThemeProviderProps) {
  const initialThemeRef = useRef<Theme>(defaultTheme);
  const initialBackgroundRef = useRef<BackgroundProps>(defaultBackground);

  const [theme, setTheme] = useState<Theme>(initialThemeRef.current);
  const [preferencesLoaded, setPreferencesLoaded] = useState(!switchable);

  const [background, setBackground] = useState<BackgroundProps>(initialBackgroundRef.current);
  const themeRef = useRef<Theme>(initialThemeRef.current);
  const backgroundRef = useRef<BackgroundProps>(initialBackgroundRef.current);

  const listStoreBackgrounds = async () => {
    try {
      const response = await axios.get<StoreItem[]>("/api/store/items/2");
      if (response.status === 200) {
        return response.data;
      }
      return [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const root = document.documentElement;

    for (const item of allThemes) {
      root.classList.remove(item);
    }

    if (allThemes.includes(theme)) {
      root.classList.add(theme);
    }
    else {
      root.classList.remove(theme);
    }

  }, [theme]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  useEffect(() => {
    if (!switchable || !window.underdeck?.theme?.getPreferences) return;
    let mounted = true;

    void (async () => {
      try {
        const prefs = await window.underdeck.theme.getPreferences(
          initialThemeRef.current as StoredThemeName,
          initialBackgroundRef.current as StoredThemeBackground
        );
        if (!mounted) return;
        setTheme((prefs.theme as Theme) ?? initialThemeRef.current);
        setBackground((prefs.background as BackgroundProps) ?? initialBackgroundRef.current);
      } catch {
        if (!mounted) return;
        setTheme(initialThemeRef.current);
        setBackground(initialBackgroundRef.current);
      } finally {
        if (mounted) setPreferencesLoaded(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [switchable]);

  useEffect(() => {
    if (!switchable || !window.underdeck?.theme?.onPreferencesChanged || !window.underdeck?.theme?.getPreferences) return;
    const unsubscribe = window.underdeck.theme.onPreferencesChanged(async () => {
      const prefs = await window.underdeck.theme.getPreferences(
        initialThemeRef.current as StoredThemeName,
        initialBackgroundRef.current as StoredThemeBackground
      );
      const nextTheme = (prefs.theme as Theme) ?? initialThemeRef.current;
      const nextBackground = (prefs.background as BackgroundProps) ?? initialBackgroundRef.current;

      if (themeRef.current !== nextTheme) {
        setTheme(nextTheme);
      }
      if (JSON.stringify(backgroundRef.current) !== JSON.stringify(nextBackground)) {
        setBackground(nextBackground);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [switchable]);

  useEffect(() => {
    if (!switchable || !preferencesLoaded || !window.underdeck?.theme?.setTheme) return;
    void window.underdeck.theme.setTheme(theme as StoredThemeName);
  }, [preferencesLoaded, switchable, theme]);

  useEffect(() => {
    if (!switchable || !preferencesLoaded || !window.underdeck?.theme?.setBackground) return;
    void window.underdeck.theme.setBackground(background as StoredThemeBackground);
  }, [background, preferencesLoaded, switchable]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, background, setBackground, listStoreBackgrounds, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
