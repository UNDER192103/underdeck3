import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/contexts/SocketContext";
import { useI18n } from "@/contexts/I18nContext";
import { BackgroundComp, type BackgroundProps } from "@/components/ui/background";
import { WebDeckGrid } from "@/components/webdeck/WebDeckGrid";
import { Maximize2, Minimize2, ArrowLeft } from "lucide-react";
import type { StoreItem } from "@/types/store";
import { useUser } from "@/contexts/UserContext";
import LoginPage from "@/pages/Login";

type WebDeckItem = {
  id: string;
  type: "back" | "page" | "app" | "soundpad" | "obs";
  refId: string;
  label?: string;
  icon?: string | null;
};

type WebDeckPage = {
  id: string;
  name: string;
  icon: string | null;
  gridCols: number;
  gridRows: number;
  items: Array<WebDeckItem | null>;
  position: number;
  updatedAt?: number;
};

type AppInfo = {
  id: string;
  name: string;
  icon: string | null;
  type: number;
  updatedAt?: number;
};

type WebDeckConfig = {
  pages: WebDeckPage[];
  apps: AppInfo[];
  autoIcons?: {
    pages?: Record<string, string>;
    items?: Record<string, string>;
  };
  obs: {
    scenes?: Array<{ sceneName: string }>;
    audioInputs?: Array<{ inputName: string }>;
  };
  soundpad: {
    audios?: Array<{ index: number; name?: string }>;
  };
  theme: {
    theme: "ligth" | "dark" | "black" | "transparent";
    background: BackgroundProps;
  };
  version?: number;
};

type WebDeckThemePayload = {
  theme?: WebDeckConfig["theme"]["theme"];
  backgroundType?: "neural" | "store" | "local";
  storeItemId?: string | null;
  backgroundUrl?: string | null;
};

type WebDeckViewPage = WebDeckPage & {
  isAutoPage?: boolean;
  autoRootId?: string;
  isAutoSubPage?: boolean;
};

type AssetCache = {
  version: number;
  assets: Record<string, string>;
  timestamps?: Record<string, number>;
};

const AUTO_PAGE = {
  soundpad: "__auto_page_soundpad_all__",
  obsScenes: "__auto_page_obs_scenes__",
  obsAudios: "__auto_page_obs_audios__",
  obsAll: "__auto_page_obs_all__",
  apps: "__auto_page_apps_all__",
} as const;

function getAutoItemKey(type: WebDeckItem["type"], refId: string) {
  return `${type}:${refId}`;
}

function sanitizeAutoIconKey(value: string) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAutoPageRef(refId: string | null | undefined) {
  const value = String(refId || "").trim();
  return value.startsWith("__auto_page_");
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function shouldProxyMedia(url: string) {
  return url.startsWith("underdeck-media://") || url.startsWith("file://");
}

// Verifica se o background deve ser carregado (apenas GIF/PNG pequenos)
function shouldLoadBackground(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Aceita apenas GIF ou PNG
  const isGifOrPng = lower.endsWith(".gif") || lower.endsWith(".png");
  return isGifOrPng;
}

function resolveBackgroundFromStoreItem(item: StoreItem | null): BackgroundProps {
  const url = String(item?.meta_data?.url || "").trim();
  if (!url) return { variant: "neural" };
  const mediaType = String(item?.meta_data?.mediaType || item?.meta_data?.mimeType || item?.meta_data?.type || "")
    .trim()
    .toLowerCase();
  const cleanUrl = url.split("?")[0].toLowerCase();
  const isVideo =
    mediaType.startsWith("video/") ||
    [".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"].some((ext) => cleanUrl.endsWith(ext));
  if (isVideo) {
    return { variant: "video", videoSrc: url };
  }
  return { variant: "image", imageSrc: url };
}

const DB_NAME = "UnderDeckAssets";
const DB_VERSION = 1;
const STORE_NAME = "assets";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "hwid" });
      }
    };
  });
  return dbPromise;
}

async function readAssetCache(hwid: string): Promise<AssetCache> {
  if (!hwid) return { version: 0, assets: {} };
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(hwid);
    const result = await new Promise<any>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!result || !result.data) return { version: 0, assets: {} };
    return {
      version: Number(result.data.version || 0),
      assets: result.data.assets && typeof result.data.assets === "object" ? result.data.assets : {},
      timestamps: result.data.timestamps && typeof result.data.timestamps === "object" ? result.data.timestamps : {},
    };
  } catch {
    // Fallback para localStorage em caso de erro
    try {
      const raw = window.localStorage.getItem(`underdeck:webdeck:assets:${hwid}`);
      if (!raw) return { version: 0, assets: {} };
      const parsed = JSON.parse(raw) as AssetCache;
      return {
        version: Number(parsed.version || 0),
        assets: parsed.assets && typeof parsed.assets === "object" ? parsed.assets : {},
        timestamps: parsed.timestamps && typeof parsed.timestamps === "object" ? parsed.timestamps : {},
      };
    } catch {
      return { version: 0, assets: {} };
    }
  }
}

async function writeAssetCache(hwid: string, cache: AssetCache) {
  if (!hwid) return;
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ hwid, data: cache });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback para localStorage em caso de erro
    try {
      window.localStorage.setItem(`underdeck:webdeck:assets:${hwid}`, JSON.stringify(cache));
    } catch {
      // Ignora erro de quota
    }
  }
}

async function clearAssetCache(hwid: string) {
  if (!hwid) return;
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(hwid);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback para localStorage
    try {
      window.localStorage.removeItem(`underdeck:webdeck:assets:${hwid}`);
    } catch {
      // Ignora erro
    }
  }
}

function buildAutoPagedPages(params: {
  rootId: string;
  title: string;
  items: WebDeckItem[];
  gridCols: number;
  gridRows: number;
  pageIcon?: string | null;
  backLabel: string;
  nextLabel: string;
}): WebDeckViewPage[] {
  const { rootId, title, items, gridCols, gridRows, pageIcon = null, backLabel, nextLabel } = params;
  const totalSlots = Math.max(1, gridCols * gridRows);
  const pages: WebDeckViewPage[] = [];
  let cursor = 0;
  let pageIndex = 0;

  while (true) {
    const pageId = pageIndex === 0 ? rootId : `${rootId}::${pageIndex}`;
    const nextPageId = `${rootId}::${pageIndex + 1}`;
    const isFirst = pageIndex === 0;
    const hasRemainingAfterThis = cursor < items.length;
    const reserveNextSlot = totalSlots >= 3 && hasRemainingAfterThis;
    const availableForData = Math.max(0, totalSlots - 1 - (reserveNextSlot ? 1 : 0));
    const pageData = items.slice(cursor, cursor + availableForData);
    cursor += pageData.length;
    const hasNext = reserveNextSlot && cursor < items.length;

    const slots: Array<WebDeckItem | null> = new Array(totalSlots).fill(null);
    slots[0] = {
      id: `${pageId}-back`,
      type: "back",
      refId: isFirst ? "" : (pageIndex === 1 ? rootId : `${rootId}::${pageIndex - 1}`),
      label: backLabel,
      icon: null,
    };

    const dataEnd = totalSlots - (hasNext ? 1 : 0);
    let dataSlot = 1;
    for (const item of pageData) {
      if (dataSlot >= dataEnd) break;
      slots[dataSlot] = item;
      dataSlot += 1;
    }

    if (hasNext) {
      slots[totalSlots - 1] = {
        id: `${pageId}-next`,
        type: "page",
        refId: nextPageId,
        label: nextLabel,
        icon: null,
      };
    }

    pages.push({
      id: pageId,
      name: isFirst ? title : `${title} (${pageIndex + 1})`,
      icon: pageIcon,
      gridCols,
      gridRows,
      items: slots,
      position: 10_000,
      isAutoPage: true,
      autoRootId: rootId,
      isAutoSubPage: !isFirst,
    });

    if (!hasNext) break;
    pageIndex += 1;
  }

  if (pages.length === 0) {
    pages.push({
      id: rootId,
      name: title,
      icon: null,
      gridCols,
      gridRows,
      items: new Array(totalSlots).fill(null),
      position: 10_000,
      isAutoPage: true,
      autoRootId: rootId,
      isAutoSubPage: false,
    });
  }

  return pages;
}

export default function WebDeckRemotePage() {
  const { user, loading: loadinguser, login } = useUser();
  if(!user) {
    return <LoginPage enableRedirect={false} />;
  }
  const { socket, isConnected } = useSocket();
  const { t } = useI18n();
  const [location, navigate] = useLocation();
  const [pages, setPages] = useState<WebDeckPage[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [autoIcons, setAutoIcons] = useState<{ pages?: Record<string, string>; items?: Record<string, string> }>({});
  const [obs, setObs] = useState<WebDeckConfig["obs"]>({ scenes: [], audioInputs: [] });
  const [soundpad, setSoundpad] = useState<WebDeckConfig["soundpad"]>({ audios: [] });
  const [theme, setTheme] = useState<WebDeckConfig["theme"]>({ theme: "ligth", background: { variant: "neural" } });
  const [remoteBackground, setRemoteBackground] = useState<BackgroundProps>({ variant: "neural" });
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const storeItemsLoadingRef = useRef<Promise<StoreItem[]> | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPageId, setCurrentPageId] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [assetCache, setAssetCache] = useState<AssetCache>({ version: 0, assets: {}, timestamps: {} });
  const [iconTimestamps, setIconTimestamps] = useState<Record<string, number>>({});
  const pendingAssetRequests = useRef(new Set<string>());
  const metadataSyncDone = useRef(false);
  const [metadataSyncNonce, setMetadataSyncNonce] = useState(0);

  const hwidParam = useMemo(() => {
    const url = new URL(window.location.href);
    return String(url.searchParams.get("uuid") || "").trim();
  }, [location]);

  const tokenParam = useMemo(() => {
    const url = new URL(window.location.href);
    return String(url.searchParams.get("token") || "").trim();
  }, [location]);

  const [tokenHwid, setTokenHwid] = useState("");
  const [accessPending, setAccessPending] = useState(false);
  const [accessSessionId, setAccessSessionId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const hwid = hwidParam || tokenHwid;

  useEffect(() => {
    if (!hwid) return;
    void (async () => {
      const cache = await readAssetCache(hwid);
      setAssetCache(cache);
      setIconTimestamps({});
    })();
  }, [hwid]);

  useEffect(() => {
    if (!hwid) return;
    if (version && assetCache.version !== version) {
      const next = { version, assets: {}, timestamps: {} };
      void writeAssetCache(hwid, next);
      setAssetCache(next);
    }
  }, [assetCache.version, hwid, version]);

  useEffect(() => {
    metadataSyncDone.current = false;
    setMetadataSyncNonce((value) => value + 1);
  }, [hwid, version]);

  useEffect(() => {
    if (!isMobileDevice()) return;
    try {
      void (window.screen?.orientation as any)?.lock?.("landscape");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Ouve evento de remoção de acesso ao dispositivo e limpa o cache
  useEffect(() => {
    const handleAccessRemoved = (event: CustomEvent) => {
      const detail = event.detail;
      const removedHwid = detail?.hwid;
      // Se o hwid removido for o atual, limpa o cache e redireciona
      if (removedHwid && removedHwid === hwid) {
        void clearAssetCache(hwid);
        setAssetCache({ version: 0, assets: {}, timestamps: {} });
        // Redireciona para a lista de dispositivos
        window.location.href = "/dashboard/devices";
      }
    };

    window.addEventListener("underdeck:device-access-removed", handleAccessRemoved as EventListener);
    return () => {
      window.removeEventListener("underdeck:device-access-removed", handleAccessRemoved as EventListener);
    };
  }, [hwid]);

  useEffect(() => {
    const root = document.documentElement;
    ["ligth", "dark", "black", "transparent"].forEach((value) => root.classList.remove(value));
    root.classList.add(theme.theme);
  }, [theme.theme]);

  // Coleta todas as URLs de ícones em uso
  const collectIconUrlsInUse = useCallback((config: WebDeckConfig, background: BackgroundProps): Set<string> => {
    const urls = new Set<string>();

    // Ícones de páginas
    config.pages?.forEach((page) => {
      if (page.icon) urls.add(page.icon);
    });

    // Ícones auto de páginas
    Object.values(config.autoIcons?.pages ?? {}).forEach((icon) => {
      if (icon) urls.add(icon);
    });

    // Ícones auto de items
    Object.values(config.autoIcons?.items ?? {}).forEach((icon) => {
      if (icon) urls.add(icon);
    });

    // Ícones de apps
    config.apps?.forEach((app) => {
      if (app.icon) urls.add(app.icon);
    });

    // Ícones dos items nas páginas
    config.pages?.forEach((page) => {
      page.items?.forEach((item) => {
        if (item?.icon) urls.add(item.icon);
      });
    });

    // Background remoto (apenas se for proxy de media)
    if (background.variant === "image" && shouldProxyMedia(background.imageSrc)) {
      urls.add(background.imageSrc);
    }
    if (background.variant === "video" && shouldProxyMedia(background.videoSrc)) {
      urls.add(background.videoSrc);
    }

    return urls;
  }, []);

  // Limpa ícones não usados do cache
  const cleanupUnusedIcons = useCallback(async (config: WebDeckConfig, background: BackgroundProps) => {
    if (!hwid) return;

    const usedUrls = collectIconUrlsInUse(config, background);
    const currentCache = await readAssetCache(hwid);

    // Filtra apenas os assets em uso
    const newAssets: Record<string, string> = {};
    const newTimestamps: Record<string, number> = {};
    let hasChanges = false;

    for (const [url, dataUrl] of Object.entries(currentCache.assets)) {
      if (usedUrls.has(url)) {
        newAssets[url] = dataUrl;
        const timestamp = currentCache.timestamps?.[url];
        if (timestamp) {
          newTimestamps[url] = timestamp;
        }
      } else {
        hasChanges = true;
      }
    }

    if (hasChanges) {
      const newCache = { ...currentCache, assets: newAssets, timestamps: newTimestamps };
      await writeAssetCache(hwid, newCache);
      setAssetCache(newCache);
    }
  }, [hwid, collectIconUrlsInUse]);

  const fetchConfig = async () => {
    if (!socket || !isConnected || !hwid) return;
    setLoading(true);
    setError(null);
    socket.emit(
      "device:command",
      { hwid, cmd: "webdeck:getConfig", data: null, timeoutMs: 20000 },
      (result: { ok: boolean; data?: WebDeckConfig; error?: string }) => {
        if (!result?.ok) {
          setError(result?.error || t("remote.webdeck.loading", "Loading deck..."));
          setLoading(false);
          return;
        }
        const data = result?.data;
        setPages(Array.isArray(data?.pages) ? data!.pages : []);
        setApps(Array.isArray(data?.apps) ? data!.apps : []);
        setAutoIcons(data?.autoIcons ?? { pages: {}, items: {} });
        setObs(data?.obs ?? { scenes: [], audioInputs: [] });
        setSoundpad(data?.soundpad ?? { audios: [] });
        setTheme(data?.theme ?? { theme: "ligth", background: { variant: "neural" } });
        setVersion(Number(data?.version || Date.now()));
        setCurrentPageId((prev) => {
          const fallback = data?.pages?.[0]?.id ?? "";
          if (!prev) return fallback;
          const exists = data?.pages?.some((page) => page.id === prev) ?? false;
          return exists || prev.startsWith("__auto_page_") ? prev : fallback;
        });

        if (data) {
          void cleanupUnusedIcons(data, remoteBackground);
        }

        metadataSyncDone.current = false;
        setMetadataSyncNonce((value) => value + 1);
        setLoading(false);
      },
    );
  };

  const fetchStoreItems = useCallback(async () => {
    if (storeItems.length) return storeItems;
    if (storeItemsLoadingRef.current) return storeItemsLoadingRef.current;
    const promise = (async () => {
      try {
        const response = await fetch("/api/store/items/2", { credentials: "include" });
        if (!response.ok) return [];
        const data = (await response.json()) as StoreItem[];
        setStoreItems(Array.isArray(data) ? data : []);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      } finally {
        storeItemsLoadingRef.current = null;
      }
    })();
    storeItemsLoadingRef.current = promise;
    return promise;
  }, [storeItems]);

  const fetchThemeBackground = useCallback(() => {
    if (!socket || !isConnected || !hwid) return;
    socket.emit(
      "device:command",
      { hwid, cmd: "webdeck:getThemeBackground", data: null, timeoutMs: 20000 },
      (result: { ok: boolean; data?: WebDeckThemePayload; error?: string }) => {
        if (!result?.ok) return;
        const data = result?.data;
        if (data?.theme) {
          setTheme((prev) => ({ ...prev, theme: data.theme! }));
        }
        const backgroundType = data?.backgroundType ?? "neural";
        if (backgroundType !== "store") {
          setRemoteBackground({ variant: "neural" });
          return;
        }
        if (data?.storeItemId) {
          void (async () => {
            const items = await fetchStoreItems();
            const match = items.find((item) => String(item.id) === String(data.storeItemId));
            if (match) {
              setRemoteBackground(resolveBackgroundFromStoreItem(match));
              return;
            }
            if (data?.backgroundUrl) {
              setRemoteBackground(resolveBackgroundFromStoreItem({ id: "remote", type: 2, name: "remote", description: "", meta_data: { url: data.backgroundUrl } }));
              return;
            }
            setRemoteBackground({ variant: "neural" });
          })();
          return;
        }
        if (data?.backgroundUrl) {
          setRemoteBackground(resolveBackgroundFromStoreItem({ id: "remote", type: 2, name: "remote", description: "", meta_data: { url: data.backgroundUrl } }));
          return;
        }
        setRemoteBackground({ variant: "neural" });
      },
    );
  }, [socket, isConnected, hwid, fetchStoreItems]);

  useEffect(() => {
    if (!tokenParam) return;
    setAccessPending(true);
    setAccessError(null);
    void fetch("/api/device-access/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token: tokenParam }),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data?.error || "Access request failed.");
        }
        if (data?.hwid) setTokenHwid(String(data.hwid));
        if (data?.sessionId) setAccessSessionId(String(data.sessionId));
        if (data?.status === "pending") {
          setAccessPending(true);
          return;
        }
        setAccessPending(false);
      })
      .catch((err) => {
        setAccessError(err?.message || "Access request failed.");
        setAccessPending(false);
      });
  }, [tokenParam]);

  useEffect(() => {
    if (!socket || !isConnected || !hwid) return;
    socket.emit("device:attach", { hwid }, (resp: { ok: boolean; error?: string }) => {
      if (!resp?.ok) {
        setError(resp?.error || t("remote.webdeck.connecting", "Connecting..."));
        setLoading(false);
        return;
      }
      void fetchConfig();
      void fetchThemeBackground();
    });
  }, [hwid, isConnected, socket, fetchThemeBackground]);

  const autoPages = useMemo(() => {
    const firstPage = [...pages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    const gridCols = Math.max(1, firstPage?.gridCols ?? 5);
    const gridRows = Math.max(1, firstPage?.gridRows ?? 3);

    const backLabel = t("remote.webdeck.back", "Back");
    const nextLabel = t("remote.webdeck.next", "Next");

    const soundpadItems = (soundpad.audios ?? [])
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" }))
      .map((audio) => {
        const refId = `soundpad-audio:${audio.index}`;
        return {
          id: `auto-soundpad-${audio.index}`,
          type: "soundpad" as const,
          refId,
          label: audio.name || `${t("remote.webdeck.audio.prefix", "Audio #")}${audio.index}`,
          icon: autoIcons.items?.[getAutoItemKey("soundpad", refId)] ?? null,
        };
      });

    const obsScenes = (obs.scenes ?? [])
      .slice()
      .sort((a, b) => a.sceneName.localeCompare(b.sceneName, "pt-BR", { sensitivity: "base" }))
      .map((scene) => {
        const refId = `obs-scene:${scene.sceneName}`;
        return {
          id: `auto-obs-scene-${scene.sceneName}`,
          type: "obs" as const,
          refId,
          label: scene.sceneName,
          icon: autoIcons.items?.[getAutoItemKey("obs", refId)] ?? null,
        };
      });

    const obsAudios = (obs.audioInputs ?? [])
      .slice()
      .sort((a, b) => a.inputName.localeCompare(b.inputName, "pt-BR", { sensitivity: "base" }))
      .map((input) => {
        const refId = `obs-audio:${input.inputName}`;
        return {
          id: `auto-obs-audio-${input.inputName}`,
          type: "obs" as const,
          refId,
          label: input.inputName,
          icon: autoIcons.items?.[getAutoItemKey("obs", refId)] ?? null,
        };
      });

    const appItems = apps
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .map((app) => {
        const refId = app.id;
        return {
          id: `auto-app-${app.id}`,
          type: "app" as const,
          refId,
          label: app.name,
          icon: autoIcons.items?.[getAutoItemKey("app", refId)] ?? app.icon ?? null,
        };
      });

    return [
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.soundpad,
        title: t("remote.webdeck.auto.soundpad", "Auto: SoundPad Audios"),
        items: soundpadItems,
        gridCols,
        gridRows,
        pageIcon: autoIcons.pages?.[AUTO_PAGE.soundpad] ?? null,
        backLabel,
        nextLabel,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.obsScenes,
        title: t("remote.webdeck.auto.obs_scenes", "Auto: OBS Scenes"),
        items: obsScenes,
        gridCols,
        gridRows,
        pageIcon: autoIcons.pages?.[AUTO_PAGE.obsScenes] ?? null,
        backLabel,
        nextLabel,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.obsAudios,
        title: t("remote.webdeck.auto.obs_audios", "Auto: OBS Audios"),
        items: obsAudios,
        gridCols,
        gridRows,
        pageIcon: autoIcons.pages?.[AUTO_PAGE.obsAudios] ?? null,
        backLabel,
        nextLabel,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.obsAll,
        title: t("remote.webdeck.auto.obs_all", "Auto: OBS Scenes + Audios"),
        items: [...obsScenes, ...obsAudios],
        gridCols,
        gridRows,
        pageIcon: autoIcons.pages?.[AUTO_PAGE.obsAll] ?? null,
        backLabel,
        nextLabel,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.apps,
        title: t("remote.webdeck.auto.apps", "Auto: Apps"),
        items: appItems,
        gridCols,
        gridRows,
        pageIcon: autoIcons.pages?.[AUTO_PAGE.apps] ?? null,
        backLabel,
        nextLabel,
      }),
    ];
  }, [apps, autoIcons.items, autoIcons.pages, obs.audioInputs, obs.scenes, pages, soundpad.audios, t]);

  const visiblePages = useMemo(() => [...pages, ...autoPages], [autoPages, pages]);
  const pagesById = useMemo(() => new Map(visiblePages.map((page) => [page.id, page])), [visiblePages]);
  const appsById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);

  const currentPage = useMemo(() => {
    if (!visiblePages.length) return null;
    if (currentPageId && pagesById.has(currentPageId)) {
      return pagesById.get(currentPageId) ?? null;
    }
    return visiblePages[0] ?? null;
  }, [currentPageId, pagesById, visiblePages]);

  const resolveItemLabel = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    if (item.label) return item.label;
    if (item.type === "back") return t("remote.webdeck.back", "Back");
    if (item.type === "page" || isAutoPageRef(item.refId)) {
      return pagesById.get(item.refId)?.name ?? t("remote.webdeck.page", "Page");
    }
    if (item.type === "soundpad" && item.refId.startsWith("soundpad-audio:")) {
      const index = Number(item.refId.replace("soundpad-audio:", ""));
      return `${t("remote.webdeck.soundpad.prefix", "SoundPad #")}${Number.isFinite(index) ? index : ""}`;
    }
    if (item.type === "obs" && item.refId.startsWith("obs-")) {
      return item.refId.replace(/^obs-(scene|audio|action):/, "");
    }
    return appsById.get(item.refId)?.name ?? t("remote.webdeck.item", "Item");
  };

  const resolveItemIcon = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    const refId = String(item.refId || "").trim();
    if (item.type === "page" && isAutoPageRef(refId)) {
      return pagesById.get(refId)?.icon || autoIcons.pages?.[refId] || "";
    }
    if (item.icon) return item.icon;
    if (item.type === "page" || isAutoPageRef(refId)) {
      return pagesById.get(refId)?.icon || autoIcons.pages?.[refId] || "";
    }
    if (item.type === "back") {
      const previous = refId || stack[stack.length - 1] || "";
      return previous ? pagesById.get(previous)?.icon || "" : "";
    }
    const appIcon = appsById.get(refId)?.icon ?? "";
    return appIcon || autoIcons.items?.[getAutoItemKey(item.type, refId)] || "";
  };

  const resolveAsset = (url: string) => {
    if (!url) return "";
    if (url.startsWith("data:") || url.startsWith("http")) return url;
    return assetCache.assets[url] || "";
  };

  const requestMedia = async (
    urls: string[],
    options?: { timestamps?: Record<string, number>; ignoreCache?: boolean }
  ) => {
    if (!socket || !isConnected || !hwid || urls.length === 0) return;

    const timestamps = options?.timestamps ?? {};
    
    // Processa URLs em sequência (uma por vez) para evitar sobrecarga no socket
    for (const url of urls) {
      const requiredTimestamp = Number(timestamps[url] ?? 0);
      const cachedTimestamp = Number(assetCache.timestamps?.[url] ?? 0);
      const hasAsset = Boolean(assetCache.assets[url]);
      const isFresh = requiredTimestamp ? cachedTimestamp === requiredTimestamp : hasAsset;
      const shouldSkip = !options?.ignoreCache && hasAsset && isFresh;

      if (shouldSkip) continue;
      if (pendingAssetRequests.current.has(url)) continue;
      pendingAssetRequests.current.add(url);
      
      await new Promise<void>((resolve) => {
        socket.emit(
          "device:command",
          { hwid, cmd: "webdeck:getMedia", data: { urls: [url] }, timeoutMs: 30000 },
          (result: { ok: boolean; data?: { assets?: Record<string, string> } }) => {
            if (result?.ok) {
              const assets = result?.data?.assets ?? {};
              if (Object.keys(assets).length > 0) {
                setAssetCache((prev) => {
                  const nextTimestamps = { ...(prev.timestamps ?? {}) };
                  Object.keys(assets).forEach((assetUrl) => {
                    const nextTimestamp = Number(timestamps[assetUrl] ?? 0);
                    if (nextTimestamp) {
                      nextTimestamps[assetUrl] = nextTimestamp;
                    }
                  });
                  const next = {
                    ...prev,
                    assets: { ...prev.assets, ...assets },
                    timestamps: nextTimestamps,
                  };
                  void writeAssetCache(hwid, next);
                  return next;
                });
              }
            }
            pendingAssetRequests.current.delete(url);
            resolve();
          },
        );
      });
      
      // Pequeno delay entre requisições para não sobrecarregar
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  // Busca apenas metadados e sincroniza ícones com cache baseado em timestamp
  const fetchMetadataAndSyncIcons = useCallback(
    async (preferredPageId?: string) => {
      if (!socket || !isConnected || !hwid) return;

      socket.emit(
        "device:command",
        { hwid, cmd: "webdeck:getMetadata", data: null, timeoutMs: 20000 },
        async (result: { ok: boolean; data?: { pages: WebDeckPage[]; apps: AppInfo[]; autoIcons: any; iconTimestamps?: Record<string, number>; timestamp: number }; error?: string }) => {
          if (!result?.ok) {
            console.error("Failed to fetch metadata:", result?.error);
            return;
          }

          const metadata = result.data;
          if (!metadata) return;

          setPages(metadata.pages);
          setApps(metadata.apps);
          setAutoIcons(metadata.autoIcons);

          const nextIconTimestamps: Record<string, number> = { ...(metadata.iconTimestamps ?? {}) };
          const fallbackTimestamp = Number(metadata.timestamp || Date.now());

          metadata.pages?.forEach((page) => {
            const pageTimestamp = Number(page.updatedAt ?? 0);
            if (page.icon && !nextIconTimestamps[page.icon] && pageTimestamp) {
              nextIconTimestamps[page.icon] = pageTimestamp;
            }
            page.items?.forEach((item) => {
              if (item?.icon && !nextIconTimestamps[item.icon] && pageTimestamp) {
                nextIconTimestamps[item.icon] = pageTimestamp;
              }
            });
          });

          metadata.apps?.forEach((app) => {
            const appTimestamp = Number(app.updatedAt ?? 0);
            if (app.icon && !nextIconTimestamps[app.icon] && appTimestamp) {
              nextIconTimestamps[app.icon] = appTimestamp;
            }
          });

          Object.values(metadata.autoIcons?.pages || {}).forEach((icon) => {
            const iconKey = String(icon || "").trim();
            if (iconKey && !nextIconTimestamps[iconKey]) {
              nextIconTimestamps[iconKey] = fallbackTimestamp;
            }
          });
          Object.values(metadata.autoIcons?.items || {}).forEach((icon) => {
            const iconKey = String(icon || "").trim();
            if (iconKey && !nextIconTimestamps[iconKey]) {
              nextIconTimestamps[iconKey] = fallbackTimestamp;
            }
          });
          setIconTimestamps(nextIconTimestamps);
          metadataSyncDone.current = true;

          const targetPageId = preferredPageId || currentPageId || metadata.pages?.[0]?.id || "";
          const currentPageData = metadata.pages.find((page) => page.id === targetPageId) || metadata.pages[0];
          if (!currentPageData) return;

          const urlsToCheck = new Set<string>();

          if (currentPageData.icon && shouldProxyMedia(currentPageData.icon)) urlsToCheck.add(currentPageData.icon);
          currentPageData.items?.forEach((item) => {
            if (item?.icon && shouldProxyMedia(item.icon)) urlsToCheck.add(item.icon);
          });

          Object.values(metadata.autoIcons?.pages || {}).forEach((icon) => {
            const iconKey = String(icon || "").trim();
            if (iconKey && shouldProxyMedia(iconKey)) urlsToCheck.add(iconKey);
          });
          Object.values(metadata.autoIcons?.items || {}).forEach((icon) => {
            const iconKey = String(icon || "").trim();
            if (iconKey && shouldProxyMedia(iconKey)) urlsToCheck.add(iconKey);
          });

          metadata.apps.forEach((app) => {
            if (app.icon && shouldProxyMedia(app.icon)) urlsToCheck.add(app.icon);
          });

          const currentCache = await readAssetCache(hwid);
          const timestampsInCache = currentCache.timestamps || {};
          const urlsToRequest = new Set<string>();

          urlsToCheck.forEach((url) => {
            const requiredTimestamp = Number(nextIconTimestamps[url] ?? 0);
            const cachedTimestamp = Number(timestampsInCache[url] ?? 0);
            const hasAsset = Boolean(currentCache.assets[url]);
            const isFresh = requiredTimestamp ? cachedTimestamp === requiredTimestamp : hasAsset;

            if (!hasAsset || !isFresh) {
              urlsToRequest.add(url);
            }
          });

          if (urlsToRequest.size > 0) {
            await requestMedia(Array.from(urlsToRequest), { timestamps: nextIconTimestamps });
          }
        },
      );
    },
    [socket, isConnected, hwid, currentPageId, requestMedia]
  );

  useEffect(() => {
    if (!socket || !isConnected || !hwid) return;
    if (loading) return;
    if (metadataSyncDone.current) return;
    void fetchMetadataAndSyncIcons(currentPageId || pages[0]?.id);
  }, [socket, isConnected, hwid, loading, currentPageId, pages, fetchMetadataAndSyncIcons, metadataSyncNonce]);

  useEffect(() => {
    if (!socket) return;
    const onChanged = () => {
      metadataSyncDone.current = false;
      setMetadataSyncNonce((value) => value + 1);
      void fetchConfig();
      void fetchThemeBackground();
    };
    const onAccessResolved = (payload: { sessionId?: string; status?: string; hwid?: string }) => {
      if (!payload?.sessionId || payload.sessionId !== accessSessionId) return;
      if (payload.status === "approved") {
        if (payload.hwid) setTokenHwid(String(payload.hwid));
        setAccessPending(false);
        metadataSyncDone.current = false;
        setMetadataSyncNonce((value) => value + 1);
        void fetchConfig();
        void fetchThemeBackground();
        return;
      }
      if (payload.status === "denied" || payload.status === "revoked" || payload.status === "expired") {
        setAccessPending(false);
        setAccessError(t("remote.webdeck.access.denied", "Access denied."));
      }
    };

    // Recebe eventos específicos do observer (pages-changed, apps-changed, etc)
    const onObserverEvent = (payload: { hwid?: string; event?: { type?: string; data?: unknown } }) => {
      if (payload?.hwid !== hwid) return; // Só processa se for do device atual
      const eventType = payload?.event?.type;
      const eventData = payload?.event?.data;

      if (eventType === "webdeck:pages-changed" || eventType === "webdeck:items-changed") {
        metadataSyncDone.current = false;
        setMetadataSyncNonce((value) => value + 1);
        void fetchMetadataAndSyncIcons(currentPageId);
      } else if (eventType === "apps:changed" || eventType === "app:added" || eventType === "app:updated" || eventType === "app:deleted") {
        metadataSyncDone.current = false;
        setMetadataSyncNonce((value) => value + 1);
        void fetchMetadataAndSyncIcons(currentPageId);
      } else if (eventType === "theme:changed" || eventType === "theme:preferences-changed" || eventType === "theme:background-changed") {
        void fetchThemeBackground();
      } else if (eventType === "obs:state-changed") {
        const data = eventData as { scenes?: Array<{ sceneName: string }>; audioInputs?: Array<{ inputName: string }> } | undefined;
        if (data) {
          setObs((prev) => ({
            scenes: data.scenes ?? prev.scenes,
            audioInputs: data.audioInputs ?? prev.audioInputs,
          }));
        }
      } else if (eventType === "soundpad:audios-changed") {
        const data = eventData as { audios?: Array<{ index: number; name?: string }> } | undefined;
        if (data?.audios) {
          setSoundpad((prev) => ({ ...prev, audios: data.audios! }));
        }
      }
    };

    socket.on("webdeck:changed", onChanged);
    socket.on("device:access:resolved", onAccessResolved);
    socket.on("observer:event", onObserverEvent);
    return () => {
      socket.off("webdeck:changed", onChanged);
      socket.off("device:access:resolved", onAccessResolved);
      socket.off("observer:event", onObserverEvent);
    };
  }, [accessSessionId, socket, t, hwid, fetchConfig, fetchMetadataAndSyncIcons, currentPageId, fetchThemeBackground]);

  useEffect(() => {
    if (!currentPage || !hwid) return;
    const urls = new Set<string>();
    const timestamps = iconTimestamps ?? {};
    const cachedTimestamps = assetCache.timestamps ?? {};

    const maybeQueue = (url: string) => {
      if (!url) return;
      if (!shouldProxyMedia(url)) return;
      const requiredTimestamp = Number(timestamps[url] ?? 0);
      const cachedTimestamp = Number(cachedTimestamps[url] ?? 0);
      const hasAsset = Boolean(assetCache.assets[url]);
      const isFresh = requiredTimestamp ? cachedTimestamp === requiredTimestamp : hasAsset;
      if (!hasAsset || !isFresh) {
        urls.add(url);
      }
    };

    const pageIcon = currentPage.icon || autoIcons.pages?.[currentPage.id] || "";
    maybeQueue(pageIcon);

    for (const item of currentPage.items) {
      const icon = resolveItemIcon(item);
      maybeQueue(icon);
    }

    // Background: apenas GIF/PNG pequenos (verificação de tamanho é feita no servidor)
    const background = remoteBackground;
    if (background.variant === "image" && shouldLoadBackground(background.imageSrc)) {
      maybeQueue(background.imageSrc);
    }
    // Vídeos são ignorados (podem ser muito grandes)
    // if (background.variant === "video" && shouldProxyMedia(background.videoSrc) && !assetCache.assets[background.videoSrc]) {
    //   urls.add(background.videoSrc);
    // }

    if (urls.size > 0) {
      void requestMedia(Array.from(urls), { timestamps });
    }
  }, [assetCache.assets, assetCache.timestamps, autoIcons.pages, autoIcons.items, currentPage, hwid, iconTimestamps, remoteBackground, resolveItemIcon]);

  const handleSlotClick = (item: WebDeckItem | null) => {
    if (!item || !socket || !isConnected || !hwid) return;
    const autoTarget = item.type !== "back" && isAutoPageRef(item.refId) ? item.refId : "";
    if (autoTarget) {
      if (!pagesById.has(autoTarget)) return;
      const target = pagesById.get(autoTarget) as WebDeckViewPage | undefined;
      if (!target) return;
      if ((currentPage as WebDeckViewPage)?.isAutoPage && target.isAutoPage && (currentPage as WebDeckViewPage).autoRootId === target.autoRootId) {
        setCurrentPageId(autoTarget);
        return;
      }
      setStack((prev) => [...prev, currentPage?.id ?? ""]);
      setCurrentPageId(autoTarget);
      return;
    }

    if (item.type === "back") {
      if (item.refId) {
        if (!pagesById.has(item.refId)) return;
        setCurrentPageId(item.refId);
        return;
      }
      const previous = stack[stack.length - 1];
      if (!previous) return;
      setStack((prev) => prev.slice(0, -1));
      setCurrentPageId(previous);
      return;
    }

    if (item.type === "page") {
      if (!pagesById.has(item.refId)) return;
      const target = pagesById.get(item.refId) as WebDeckViewPage | undefined;
      if (!target) return;
      if ((currentPage as WebDeckViewPage)?.isAutoPage && target.isAutoPage && (currentPage as WebDeckViewPage).autoRootId === target.autoRootId) {
        setCurrentPageId(item.refId);
        return;
      }
      setStack((prev) => [...prev, currentPage?.id ?? ""]);
      setCurrentPageId(item.refId);
      return;
    }

    socket.emit(
      "device:command",
      { hwid, cmd: "webdeck:activateItem", data: { type: item.type, refId: item.refId }, timeoutMs: 15000 },
      () => { },
    );
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }
      await document.documentElement.requestFullscreen?.();
      try {
        await (window.screen?.orientation as any)?.lock?.("landscape");
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  };

  const background = useMemo<BackgroundProps>(() => {
    if (remoteBackground.variant === "image") {
      const original = remoteBackground.imageSrc;
      const resolved = resolveAsset(original);
      const imageSrc = resolved || (shouldProxyMedia(original) ? "" : original);
      if (!imageSrc) return { variant: "neural" };
      return { ...remoteBackground, imageSrc };
    }
    if (remoteBackground.variant === "video") {
      const original = remoteBackground.videoSrc;
      const resolved = resolveAsset(original);
      const videoSrc = resolved || (shouldProxyMedia(original) ? "" : original);
      const posterOriginal = remoteBackground.videoPoster || "";
      const posterResolved = posterOriginal ? resolveAsset(posterOriginal) : "";
      const videoPoster = posterResolved || (posterOriginal && shouldProxyMedia(posterOriginal) ? "" : posterOriginal || undefined);
      if (!videoSrc) return { variant: "neural" };
      return { ...remoteBackground, videoSrc, videoPoster };
    }
    return remoteBackground;
  }, [assetCache.assets, remoteBackground]);

  const renderStatus = (message: string) => (
    <div className="min-h-screen w-full flex items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-3">
        <Button variant="secondary" rounded="xl" onClick={() => navigate("/dashboard/connections")}>
          {t("remote.webdeck.back_connections", "Back to Devices")}
        </Button>
        <div>{message}</div>
      </div>
    </div>
  );

  if (!isConnected) {
    return renderStatus(t("remote.webdeck.connecting", "Connecting..."));
  }

  if (!hwid) {
    return renderStatus(t("remote.webdeck.missing_hwid", "Missing device hwid."));
  }

  if (accessPending) {
    return renderStatus(t("remote.webdeck.access.pending", "Waiting for approval..."));
  }

  if (accessError) {
    return renderStatus(accessError);
  }

  if (loading) {
    return renderStatus(t("remote.webdeck.app.loading", "Loading..."));
  }

  if (!currentPage) {
    return renderStatus(t("remote.webdeck.app.no_pages", "No pages available."));
  }

  return (
    <div className="h-screen w-screen text-white p-3 border rounded-xl overflow-hidden">
      <BackgroundComp {...background} />
      <div className="w-full h-full min-h-0 flex flex-col gap-3">
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              type="button"
              variant="secondary"
              rounded="full"
              size="icon"
              onClick={() => navigate("/dashboard/connections")}
              className="bg-black/55 hover:bg-black/70 text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold truncate">{currentPage.name}</h1>
          </div>
          <Button
            type="button"
            variant="secondary"
            rounded="full"
            size="icon"
            className="absolute left-1/2 -translate-x-1/2 shadow-lg bg-black/55 hover:bg-black/70 text-white"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="primary" rounded="xl" onClick={() => void fetchConfig()}>
            {t("remote.webdeck.app.refresh", "Refresh")}
          </Button>
        </div>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex-1 min-h-0">
          <WebDeckGrid<WebDeckItem>
            pageId={currentPage.id}
            gridCols={currentPage.gridCols}
            gridRows={currentPage.gridRows}
            items={currentPage.items}
            mode="view"
            emptyStyle="placeholder"
            emptyLabel={t("remote.webdeck.app.empty_image", "No image")}
            fillHeight={true}
            onSlotClick={(_, item) => {
              if (item) handleSlotClick(item);
            }}
            resolveItemLabel={(item) => resolveItemLabel(item)}
            resolveItemBackground={(item) => resolveAsset(resolveItemIcon(item))}
          />
        </div>
      </div>
    </div>
  );
}
