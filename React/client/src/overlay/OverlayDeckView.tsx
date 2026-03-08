import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WebDeckGrid } from "@/components/webdeck/WebDeckGrid";
import type { App } from "@/types/apps";
import type { ObsAudioInput, ObsScene, SoundPadAudio, WebDeckItem, WebDeckPage } from "@/types/electron";

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
      refId: isFirst ? "" : pageIndex === 1 ? rootId : `${rootId}::${pageIndex - 1}`,
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
      createdAt: 0,
      updatedAt: 0,
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
      createdAt: 0,
      updatedAt: 0,
      isAutoPage: true,
      autoRootId: rootId,
      isAutoSubPage: false,
    });
  }

  return pages;
}

export default function OverlayDeckView() {
  const [pages, setPages] = useState<WebDeckPage[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [soundpadAudios, setSoundpadAudios] = useState<SoundPadAudio[]>([]);
  const [obsScenes, setObsScenes] = useState<ObsScene[]>([]);
  const [obsAudioInputs, setObsAudioInputs] = useState<ObsAudioInput[]>([]);
  const [autoItemIcons, setAutoItemIcons] = useState<Record<string, string>>({});
  const [autoPageIcons, setAutoPageIcons] = useState<Record<string, string>>({});
  const [selectedPageId, setSelectedPageId] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const autoPages = useMemo<WebDeckViewPage[]>(() => {
    const firstPage = [...pages].sort((a, b) => a.position - b.position)[0];
    const cols = Math.max(1, firstPage?.gridCols ?? 5);
    const rows = Math.max(1, firstPage?.gridRows ?? 3);

    const soundpadItems: WebDeckItem[] = soundpadAudios
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" }))
      .map((audio) => {
        const refId = `soundpad-audio:${audio.index}`;
        return { id: `auto-soundpad-${audio.index}`, type: "soundpad", refId, label: audio.name || `Audio #${audio.index}`, icon: autoItemIcons[getAutoItemKey("soundpad", refId)] ?? null };
      });

    const obsSceneItems: WebDeckItem[] = obsScenes
      .slice()
      .sort((a, b) => a.sceneName.localeCompare(b.sceneName, "pt-BR", { sensitivity: "base" }))
      .map((scene) => {
        const refId = `obs-scene:${scene.sceneName}`;
        return { id: `auto-obs-scene-${scene.sceneName}`, type: "obs", refId, label: scene.sceneName, icon: autoItemIcons[getAutoItemKey("obs", refId)] ?? null };
      });

    const obsAudioItems: WebDeckItem[] = obsAudioInputs
      .slice()
      .sort((a, b) => a.inputName.localeCompare(b.inputName, "pt-BR", { sensitivity: "base" }))
      .map((input) => {
        const refId = `obs-audio:${input.inputName}`;
        return { id: `auto-obs-audio-${input.inputName}`, type: "obs", refId, label: input.inputName, icon: autoItemIcons[getAutoItemKey("obs", refId)] ?? null };
      });

    const appItems: WebDeckItem[] = apps
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .map((app) => {
        const refId = app.id;
        return { id: `auto-app-${app.id}`, type: "app", refId, label: app.name, icon: autoItemIcons[getAutoItemKey("app", refId)] ?? app.icon ?? null };
      });

    return [
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.soundpad, title: "Auto: SoundPad Audios", items: soundpadItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.soundpad] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.obsScenes, title: "Auto: OBS Cenas", items: obsSceneItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.obsScenes] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.obsAudios, title: "Auto: OBS Audios", items: obsAudioItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.obsAudios] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.obsAll, title: "Auto: OBS Cenas + Audios", items: [...obsSceneItems, ...obsAudioItems], gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.obsAll] ?? null }),
      ...buildAutoPagedPages({ rootId: AUTO_PAGE.apps, title: "Auto: Apps", items: appItems, gridCols: cols, gridRows: rows, pageIcon: autoPageIcons[AUTO_PAGE.apps] ?? null }),
    ];
  }, [pages, apps, soundpadAudios, obsScenes, obsAudioInputs, autoPageIcons, autoItemIcons]);

  const viewPages = useMemo<WebDeckViewPage[]>(() => [...pages, ...autoPages], [pages, autoPages]);
  const pageMap = useMemo(() => new Map(viewPages.map((page) => [page.id, page])), [viewPages]);
  const appMap = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const currentPage = useMemo(() => pageMap.get(selectedPageId) ?? viewPages[0] ?? null, [pageMap, selectedPageId, viewPages]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [loadedPages, loadedApps, loadedIcons, audios, obsState] = await Promise.all([
        window.underdeck.webdeck.listPages(),
        window.underdeck.apps.list(),
        window.underdeck.webdeck.listAutoIcons(),
        window.underdeck.soundpad.listAudios(),
        window.underdeck.obs.getState(),
      ]);
      const safePages = Array.isArray(loadedPages) ? loadedPages : [];
      setPages(safePages);
      setApps(Array.isArray(loadedApps) ? loadedApps : []);
      setAutoPageIcons(loadedIcons?.pages ?? {});
      setAutoItemIcons(loadedIcons?.items ?? {});
      setSoundpadAudios(Array.isArray(audios) ? audios : []);
      setObsScenes(Array.isArray(obsState?.scenes) ? obsState.scenes : []);
      setObsAudioInputs(Array.isArray(obsState?.audioInputs) ? obsState.audioInputs : []);
      setSelectedPageId((prev) => (prev && (safePages.some((p) => p.id === prev) || prev.startsWith("__auto_page_")) ? prev : safePages[0]?.id ?? ""));
      setError("");
    } catch {
      setError("Falha ao carregar WebDeck.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const unsubscribeWebDeck = window.underdeck.webdeck.onChanged(() => {
      void loadData();
    });
    const unsubscribeSoundPad = window.underdeck.soundpad.onAudiosChanged((audios) => {
      setSoundpadAudios(Array.isArray(audios) ? audios : []);
    });
    const unsubscribeObs = window.underdeck.obs.onStateChanged((state) => {
      setObsScenes(Array.isArray(state?.scenes) ? state.scenes : []);
      setObsAudioInputs(Array.isArray(state?.audioInputs) ? state.audioInputs : []);
    });
    return () => {
      unsubscribeWebDeck();
      unsubscribeSoundPad();
      unsubscribeObs();
    };
  }, []);

  const openItem = async (item: WebDeckItem) => {
    if (!currentPage) return;
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
      setHistory((prev) => [...prev, currentPage.id]);
      setSelectedPageId(item.refId);
      return;
    }
    if (item.type === "app") {
      await window.underdeck.apps.execute(item.refId);
      return;
    }
    if (item.type === "soundpad") {
      if (item.refId.startsWith("soundpad-audio:")) {
        await window.underdeck.soundpad.playSound(Number(item.refId.replace("soundpad-audio:", "")));
      } else {
        await window.underdeck.apps.execute(item.refId);
      }
      return;
    }
    if (item.type === "obs") {
      if (item.refId.startsWith("obs-scene:")) {
        await window.underdeck.obs.setCurrentScene(item.refId.replace("obs-scene:", ""));
        return;
      }
      if (item.refId.startsWith("obs-audio:")) {
        await window.underdeck.obs.toggleInputMute(item.refId.replace("obs-audio:", ""));
        return;
      }
      await window.underdeck.apps.execute(item.refId);
    }
  };

  const resolveItemBackground = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    if (item.icon) return item.icon;
    if (item.type === "page") return pageMap.get(item.refId)?.icon || autoPageIcons[item.refId] || "";
    if (item.type === "back") {
      const target = item.refId || history[history.length - 1] || "";
      return target ? pageMap.get(target)?.icon || "" : "";
    }
    return appMap.get(item.refId)?.icon || "";
  };

  const resolveItemLabel = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    if (item.label) return item.label;
    if (item.type === "back") return "Voltar";
    if (item.type === "page") return pageMap.get(item.refId)?.name || "Pagina";
    return appMap.get(item.refId)?.name || "Item";
  };

  if (loading && !currentPage) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!currentPage) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Nenhuma pagina disponivel.</div>;
  }

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium truncate">{currentPage.name}</h3>
        <Button rounded="xl" variant="secondary" onClick={() => void loadData()}>
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
          resolveItemLabel={(item) => resolveItemLabel(item)}
          resolveItemBackground={(item) => resolveItemBackground(item)}
        />
      </div>
    </div>
  );
}
