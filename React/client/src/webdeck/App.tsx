import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import "../index.css";
import { BackgroundComp, type BackgroundProps } from "../components/ui/background";
import { Button } from "@/components/ui/button";
import { WebDeckGrid } from "../components/webdeck/WebDeckGrid";
import { I18nProvider } from "@/contexts/I18nContext";

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
};

type AppInfo = {
  id: string;
  name: string;
  icon: string | null;
  type: number;
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
};

type WebDeckViewPage = WebDeckPage & {
  isAutoPage?: boolean;
  autoRootId?: string;
  isAutoSubPage?: boolean;
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

async function fetchConfig(): Promise<WebDeckConfig> {
  const response = await fetch("/api/webdeck/config");
  if (!response.ok) throw new Error("Failed to load webdeck config");
  const payload = await response.json();
  return {
    pages: Array.isArray(payload.pages) ? payload.pages : [],
    apps: Array.isArray(payload.apps) ? payload.apps : [],
    autoIcons: payload?.autoIcons ?? { pages: {}, items: {} },
    obs: payload?.obs ?? { scenes: [], audioInputs: [] },
    soundpad: payload?.soundpad ?? { audios: [] },
    theme: payload?.theme ?? { theme: "ligth", background: { variant: "neural" } },
  };
}

function buildAutoPagedPages(params: {
  rootId: string;
  title: string;
  items: WebDeckItem[];
  gridCols: number;
  gridRows: number;
  pageIcon?: string | null;
}): WebDeckViewPage[] {
  const { rootId, title, items, gridCols, gridRows, pageIcon = null } = params;
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
      label: "Voltar",
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
        label: "Proxima",
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

async function execute(type: string, id: string) {
  const encodedType = encodeURIComponent(type);
  const encodedId = encodeURIComponent(id);
  const response = await fetch(`/api/webdeck/execute/${encodedType}/${encodedId}`, {
    method: "POST",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Falha ao executar." }));
    throw new Error(payload?.message || "Falha ao executar.");
  }
}

function WebDeckRemoteAppContent() {
  const [config, setConfig] = useState<WebDeckConfig>({
    pages: [],
    apps: [],
    obs: { scenes: [], audioInputs: [] },
    soundpad: { audios: [] },
    theme: { theme: "ligth", background: { variant: "neural" } },
  });
  const [loading, setLoading] = useState(true);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [autoItemIcons, setAutoItemIcons] = useState<Record<string, string>>({});
  const [autoPageIcons, setAutoPageIcons] = useState<Record<string, string>>({});

  const autoPages = useMemo<WebDeckViewPage[]>(() => {
    const firstPage = [...config.pages].sort((a, b) => a.position - b.position)[0];
    const cols = Math.max(1, firstPage?.gridCols ?? 5);
    const rows = Math.max(1, firstPage?.gridRows ?? 3);

    const soundpadItems: WebDeckItem[] = (config.soundpad.audios ?? [])
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" }))
      .map((audio) => {
        const refId = `soundpad-audio:${audio.index}`;
        const itemKey = getAutoItemKey("soundpad", refId);
        return {
          id: `auto-soundpad-${audio.index}`,
          type: "soundpad",
          refId,
          label: audio.name || `Audio #${audio.index}`,
          icon: autoItemIcons[itemKey] ?? autoItemIcons[sanitizeAutoIconKey(itemKey)] ?? null,
        };
      });

    const obsSceneItems: WebDeckItem[] = (config.obs.scenes ?? [])
      .slice()
      .sort((a, b) => a.sceneName.localeCompare(b.sceneName, "pt-BR", { sensitivity: "base" }))
      .map((scene) => {
        const refId = `obs-scene:${scene.sceneName}`;
        const itemKey = getAutoItemKey("obs", refId);
        return {
          id: `auto-obs-scene-${scene.sceneName}`,
          type: "obs",
          refId,
          label: scene.sceneName,
          icon: autoItemIcons[itemKey] ?? autoItemIcons[sanitizeAutoIconKey(itemKey)] ?? null,
        };
      });

    const obsAudioItems: WebDeckItem[] = (config.obs.audioInputs ?? [])
      .slice()
      .sort((a, b) => a.inputName.localeCompare(b.inputName, "pt-BR", { sensitivity: "base" }))
      .map((input) => {
        const refId = `obs-audio:${input.inputName}`;
        const itemKey = getAutoItemKey("obs", refId);
        return {
          id: `auto-obs-audio-${input.inputName}`,
          type: "obs",
          refId,
          label: input.inputName,
          icon: autoItemIcons[itemKey] ?? autoItemIcons[sanitizeAutoIconKey(itemKey)] ?? null,
        };
      });

    const appItems: WebDeckItem[] = config.apps
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .map((app) => {
        const refId = app.id;
        const itemKey = getAutoItemKey("app", refId);
        return {
          id: `auto-app-${app.id}`,
          type: "app",
          refId,
          label: app.name,
          icon: autoItemIcons[itemKey] ?? autoItemIcons[sanitizeAutoIconKey(itemKey)] ?? app.icon ?? null,
        };
      });

    return [
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.soundpad, title: "Auto: SoundPad Audios", items: soundpadItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.soundpad] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.obsScenes, title: "Auto: OBS Cenas", items: obsSceneItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.obsScenes] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.obsAudios, title: "Auto: OBS Audios", items: obsAudioItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.obsAudios] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.obsAll, title: "Auto: OBS Cenas + Audios", items: [...obsSceneItems, ...obsAudioItems], gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.obsAll] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.apps, title: "Auto: Apps", items: appItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.apps] ?? null }),
    ];
  }, [config.pages, config.soundpad.audios, config.obs.scenes, config.obs.audioInputs, config.apps, autoItemIcons, autoPageIcons]);

  const viewPages = useMemo<WebDeckViewPage[]>(() => [...config.pages, ...autoPages], [config.pages, autoPages]);
  const pageMap = useMemo(() => new Map(viewPages.map((page) => [page.id, page])), [viewPages]);
  const appMap = useMemo(() => new Map(config.apps.map((app) => [app.id, app])), [config.apps]);
  const currentPage = useMemo(() => pageMap.get(selectedPageId) ?? viewPages[0] ?? null, [pageMap, selectedPageId, viewPages]);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await fetchConfig();
      setConfig(next);
      setAutoPageIcons(next.autoIcons?.pages ?? {});
      setAutoItemIcons(next.autoIcons?.items ?? {});
      setSelectedPageId((prev) => {
        if (prev && (next.pages.some((page) => page.id === prev) || prev.startsWith("__auto_page_"))) return prev;
        return next.pages[0]?.id ?? "";
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const socket: Socket = io("/", { path: "/socket.io" });
    socket.on("webdeck:pages-changed", (payload) => {
      const pages = Array.isArray(payload?.pages) ? payload.pages : [];
      const autoPageIcons = (payload?.autoIcons?.pages ?? {}) as Record<string, string>;
      const autoItemIcons = (payload?.autoIcons?.items ?? {}) as Record<string, string>;
      setConfig((prev) => ({ ...prev, pages }));
      setAutoPageIcons(autoPageIcons);
      setAutoItemIcons(autoItemIcons);
    });
    socket.on("apps:changed", (payload) => {
      const apps = Array.isArray(payload?.apps) ? payload.apps : [];
      setConfig((prev) => ({ ...prev, apps }));
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const classes = ["ligth", "dark", "black", "transparent"];
    classes.forEach((name) => root.classList.remove(name));
    root.classList.add(config.theme.theme);
  }, [config.theme.theme]);

  const openItem = async (item: WebDeckItem) => {
    if (!currentPage) return;
    const autoTarget = item.type !== "back" && isAutoPageRef(item.refId) ? item.refId : "";
    if (autoTarget) {
      if (!pageMap.has(autoTarget)) return;
      const nextPage = pageMap.get(autoTarget);
      const isSameAutoStack =
        Boolean((currentPage as WebDeckViewPage).isAutoPage) &&
        Boolean((nextPage as WebDeckViewPage | undefined)?.isAutoPage) &&
        (currentPage as WebDeckViewPage).autoRootId &&
        (nextPage as WebDeckViewPage | undefined)?.autoRootId &&
        (currentPage as WebDeckViewPage).autoRootId === (nextPage as WebDeckViewPage).autoRootId;
      if (!isSameAutoStack) {
        setHistory((prev) => [...prev, currentPage.id]);
      }
      setSelectedPageId(autoTarget);
      return;
    }

    if (item.type === "back") {
      if (item.refId) {
        if (!pageMap.has(item.refId)) return;
        setSelectedPageId(item.refId);
        return;
      }
      const previous = history[history.length - 1];
      if (!previous) return;
      setHistory((prev) => prev.slice(0, -1));
      setSelectedPageId(previous);
      return;
    }

    if (item.type === "page") {
      if (!pageMap.has(item.refId)) return;
      const nextPage = pageMap.get(item.refId);
      const isSameAutoStack =
        Boolean((currentPage as WebDeckViewPage).isAutoPage) &&
        Boolean((nextPage as WebDeckViewPage | undefined)?.isAutoPage) &&
        (currentPage as WebDeckViewPage).autoRootId &&
        (nextPage as WebDeckViewPage | undefined)?.autoRootId &&
        (currentPage as WebDeckViewPage).autoRootId === (nextPage as WebDeckViewPage).autoRootId;
      if (!isSameAutoStack) {
        setHistory((prev) => [...prev, currentPage.id]);
      }
      setSelectedPageId(item.refId);
      return;
    }

    if (item.type === "app") {
      await execute("app", item.refId);
      return;
    }

    if (item.type === "soundpad") {
      if (item.refId.startsWith("soundpad-audio:")) {
        await execute("soundpad-audio", item.refId.replace("soundpad-audio:", ""));
        return;
      }
      await execute("soundpad-app", item.refId);
      return;
    }

    if (item.type === "obs") {
      if (item.refId.startsWith("obs-scene:")) {
        await execute("obs-scene", item.refId.replace("obs-scene:", ""));
        return;
      }
      if (item.refId.startsWith("obs-audio:")) {
        await execute("obs-audio", item.refId.replace("obs-audio:", ""));
        return;
      }
      if (item.refId.startsWith("obs-action:")) {
        await execute("obs-action", item.refId.replace("obs-action:", ""));
        return;
      }
      await execute("obs-app", item.refId);
    }
  };

  const getItemBackground = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    const itemRefId = String(item.refId || "").trim();
    if (item.type === "page" && isAutoPageRef(itemRefId)) {
      return pageMap.get(itemRefId)?.icon || autoPageIcons[itemRefId] || "";
    }
    if (item.icon) return item.icon;
    if (item.type === "page" || isAutoPageRef(itemRefId)) {
      return pageMap.get(itemRefId)?.icon || autoPageIcons[itemRefId] || "";
    }
    if (item.type === "back") {
      const target = itemRefId || history[history.length - 1] || "";
      return target ? pageMap.get(target)?.icon || "" : "";
    }
    return appMap.get(itemRefId)?.icon || "";
  };

  const getItemLabel = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    if (item.label) return item.label;
    if (item.type === "back") return "Voltar";
    if (item.type === "page" || isAutoPageRef(item.refId)) return pageMap.get(item.refId)?.name || "Pagina";
    if (item.type === "obs" && item.refId.startsWith("obs-")) {
      return item.refId.replace(/^obs-(scene|audio|action):/, "");
    }
    if (item.type === "soundpad" && item.refId.startsWith("soundpad-audio:")) {
      return `SoundPad #${item.refId.replace("soundpad-audio:", "")}`;
    }
    return appMap.get(item.refId)?.name || "Item";
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-black text-white">
        Carregando...
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-black text-white">
        Nenhuma pagina disponivel.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen text-white p-3 border rounded-xl overflow-hidden">
      <BackgroundComp {...config.theme.background} />
      <div className="w-full h-full min-h-0 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold truncate">{currentPage.name}</h1>
          <Button
            type="button"
            variant="primary"
            rounded="xl"
            onClick={() => void refresh()}
          >
            Atualizar
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
            emptyLabel="Nenhuma imagem"
            fillHeight={true}
            onSlotClick={(_index, item) => {
              if (!item) return;
              void openItem(item);
            }}
            resolveItemLabel={(item) => getItemLabel(item)}
            resolveItemBackground={(item) => getItemBackground(item)}
          />
        </div>
      </div>
    </div>
  );
}

export default function WebDeckRemoteApp() {
  return (
    <I18nProvider>
      <WebDeckRemoteAppContent />
    </I18nProvider>
  );
}
