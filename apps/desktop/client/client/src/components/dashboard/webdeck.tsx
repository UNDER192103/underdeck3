import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Check, Copy, Plus, QrCode, RefreshCw, UserX, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { WebDeckGrid } from "@/components/webdeck/WebDeckGrid";
import { BackgroundComp } from "@/components/ui/background";
import { useTheme } from "@/contexts/ThemeContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/contexts/UserContext";
import { useSocket } from "@/contexts/SocketContext";
import { ApiSettings } from "@/const";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import type { AppUser } from "@/types/user";
import type { ObsAudioInput, ObsScene, SoundPadAudio, WebDeckItem, WebDeckPage } from "@/types/electron";

const GRID_PRESETS = ["4x2", "5x3", "6x4", "7x5", "8x4"];
const GRID_CUSTOM_VALUE = "__custom__";
const AUTO_PAGE = {
  soundpad: "__auto_page_soundpad_all__",
  obsScenes: "__auto_page_obs_scenes__",
  obsAudios: "__auto_page_obs_audios__",
  obsAll: "__auto_page_obs_all__",
  apps: "__auto_page_apps_all__",
} as const;
type ItemEditorType = "back" | "page" | "app" | "soundpad" | "obs";
type ItemFormState = { type: ItemEditorType; refId: string; label: string; icon: string };
type ObsActionType = "audio" | "scene" | "stream" | "record";
type WebDeckAccessInfo = {
  localhostUrl: string;
  localIp: string;
  localIpUrl: string;
  inviteUrl: string;
  qrCodeDataUrl: string;
};
type RemoteDeviceSummary = {
  id: string;
  name: string;
  hwid: string;
};
type RemoteDeviceInvite = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
};
type RemoteDeviceSession = {
  id: string;
  userId: string;
  status: "pending" | "active" | "denied" | "revoked" | "expired";
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
  user?: AppUser | null;
};
type RemoteDeviceConnection = {
  userId: string;
  connectedAt: string;
  user?: AppUser | null;
};
type WebDeckViewPage = WebDeckPage & {
  isAutoPage?: boolean;
  autoPageKind?: "soundpad" | "obs-scenes" | "obs-audios" | "obs-all" | "apps";
  autoRootId?: string;
  isAutoSubPage?: boolean;
};

function normalizeLabel(value: string, fallback: string) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function decodeRefValue(value: string) {
  return value === "__history__" ? "" : value;
}

function encodeRefValue(value: string) {
  return value ? value : "__history__";
}

function getAutoItemKey(type: WebDeckItem["type"], refId: string) {
  return `${type}:${refId}`;
}

function buildAutoPage(
  id: string,
  name: string,
  kind: WebDeckViewPage["autoPageKind"],
  payloadItems: Array<WebDeckItem | null>
): WebDeckViewPage {
  const items = payloadItems.length > 0 ? payloadItems : [null];
  const gridCols = 5;
  const gridRows = Math.max(1, Math.ceil(items.length / gridCols));
  return {
    id,
    name,
    icon: null,
    gridCols,
    gridRows,
    items,
    position: 10_000,
    createdAt: 0,
    updatedAt: 0,
    isAutoPage: true,
    autoPageKind: kind,
  };
}

function buildAutoPagedPages(params: {
  rootId: string;
  title: string;
  kind: NonNullable<WebDeckViewPage["autoPageKind"]>;
  items: WebDeckItem[];
  gridCols: number;
  gridRows: number;
  pageIcon?: string | null;
}) {
  const { rootId, title, kind, items, gridCols, gridRows, pageIcon = null } = params;
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
        icon: pageIcon,
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
      autoPageKind: kind,
      autoRootId: rootId,
      isAutoSubPage: !isFirst,
    });

    if (!hasNext) break;
    pageIndex += 1;
  }

  if (pages.length === 0) {
    pages.push(buildAutoPage(rootId, title, kind, [null]));
  }

  return pages;
}

export default function WebDeck({
  className = "backdrop-blur",
  sourceId = "APP_ELECTRON",
}: {
  className?: string;
  sourceId?: string;
}) {
  const { t } = useI18n();
  const { apps, executeApp } = useUnderDeck();
  const { user } = useUser();
  const { socket: remoteSocket, isConnected: remoteSocketConnected } = useSocket();
  const [pages, setPages] = useState<WebDeckPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createIcon, setCreateIcon] = useState("");
  const [createIconPreview, setCreateIconPreview] = useState<string | null>(null);
  const [gridCols, setGridCols] = useState("5");
  const [gridRows, setGridRows] = useState("3");
  const [editPageOpen, setEditPageOpen] = useState(false);
  const [editPageName, setEditPageName] = useState("");
  const [editPageIcon, setEditPageIcon] = useState("");
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemFormState>({ type: "page", refId: "", label: "", icon: "" });
  const [obsActionType, setObsActionType] = useState<ObsActionType>("scene");
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [movingFromIndex, setMovingFromIndex] = useState<number | null>(null);
  const [openDropdownSlot, setOpenDropdownSlot] = useState<number | null>(null);
  const [soundpadAudios, setSoundpadAudios] = useState<SoundPadAudio[]>([]);
  const [obsScenes, setObsScenes] = useState<ObsScene[]>([]);
  const [obsAudioInputs, setObsAudioInputs] = useState<ObsAudioInput[]>([]);
  const [iconVersion, setIconVersion] = useState<number>(Date.now());
  const [expressEnabled, setExpressEnabled] = useState(false);
  const [expressPort, setExpressPort] = useState("59231");
  const [expressBusy, setExpressBusy] = useState(false);
  const [openAccessModal, setOpenAccessModal] = useState(false);
  const [accessInfoLoading, setAccessInfoLoading] = useState(false);
  const [accessInfo, setAccessInfo] = useState<WebDeckAccessInfo | null>(null);
  const [accessTab, setAccessTab] = useState<"local" | "remote">("local");
  const [remoteDeviceId, setRemoteDeviceId] = useState("");
  const [remoteDeviceName, setRemoteDeviceName] = useState("");
  const [remoteManagerTab, setRemoteManagerTab] = useState<"invites" | "connections" | "sessions">("invites");
  const [remoteInvites, setRemoteInvites] = useState<RemoteDeviceInvite[]>([]);
  const [remoteConnections, setRemoteConnections] = useState<RemoteDeviceConnection[]>([]);
  const [remoteSessions, setRemoteSessions] = useState<RemoteDeviceSession[]>([]);
  const [remoteManagerLoading, setRemoteManagerLoading] = useState(false);
  const [inviteDuration, setInviteDuration] = useState("1h");
  const [inviteQrOpen, setInviteQrOpen] = useState(false);
  const [inviteQrDataUrl, setInviteQrDataUrl] = useState<string | null>(null);
  const [inviteQrUrl, setInviteQrUrl] = useState("");
  const [connectionsTick, setConnectionsTick] = useState(0);
  const [itemIconPreview, setItemIconPreview] = useState<string | null>(null);
  const [autoItemIcons, setAutoItemIcons] = useState<Record<string, string>>({});
  const [autoPageIcons, setAutoPageIcons] = useState<Record<string, string>>({});
  const [editingAutoItemKey, setEditingAutoItemKey] = useState<string | null>(null);
  const supportListsLoadedRef = useRef(false);
  const supportListsLoadingRef = useRef(false);

  const inviteDurations = useMemo(
    () => [
      { value: "15m", label: t("webdeck.remote.invites.duration.15m", "15 minutos") },
      { value: "1h", label: t("webdeck.remote.invites.duration.1h", "1 hora") },
      { value: "6h", label: t("webdeck.remote.invites.duration.6h", "6 horas") },
      { value: "24h", label: t("webdeck.remote.invites.duration.24h", "24 horas") },
      { value: "7d", label: t("webdeck.remote.invites.duration.7d", "7 dias") },
      { value: "forever", label: t("webdeck.remote.invites.duration.forever", "Sem expiração") },
    ],
    [t],
  );

  const formatDuration = (ms: number) => {
    const safe = Math.max(0, ms);
    const seconds = Math.floor(safe / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  const formatRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return t("webdeck.remote.sessions.no_expiry", "Sem expiração");
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return t("webdeck.remote.sessions.expired", "Expirado");
    return formatDuration(diff);
  };

  const apiFetch = async (path: string, options?: RequestInit) => {
    const base = String(ApiSettings.url || "").trim();
    const url = base && base !== "/" ? new URL(path, base).toString() : path;
    const response = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || "Request failed.");
    }
    return data;
  };

  const autoPageRoots = useMemo<WebDeckViewPage[]>(() => {
    const firstCommonPage = [...pages].sort((a, b) => a.position - b.position)[0];
    const defaultCols = Math.max(1, firstCommonPage?.gridCols ?? 5);
    const defaultRows = Math.max(1, firstCommonPage?.gridRows ?? 3);
    const sortedSoundPadAudios = soundpadAudios
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" }));
    const sortedObsScenes = obsScenes
      .slice()
      .sort((a, b) => a.sceneName.localeCompare(b.sceneName, "pt-BR", { sensitivity: "base" }));
    const sortedObsAudios = obsAudioInputs
      .slice()
      .sort((a, b) => a.inputName.localeCompare(b.inputName, "pt-BR", { sensitivity: "base" }));

    const soundPadItems: WebDeckItem[] = sortedSoundPadAudios.map((audio) => {
      const refId = `soundpad-audio:${audio.index}`;
      return {
        id: `auto-soundpad-${audio.index}`,
        type: "soundpad",
        refId,
        label: normalizeLabel(audio.name, `Audio #${audio.index}`),
        icon: autoItemIcons[getAutoItemKey("soundpad", refId)] ?? null,
      };
    });

    const obsSceneItems: WebDeckItem[] = sortedObsScenes.map((scene) => {
      const refId = `obs-scene:${scene.sceneName}`;
      return {
        id: `auto-obs-scene-${scene.sceneName}`,
        type: "obs",
        refId,
        label: scene.sceneName,
        icon: autoItemIcons[getAutoItemKey("obs", refId)] ?? null,
      };
    });

    const obsAudioItems: WebDeckItem[] = sortedObsAudios.map((input) => {
      const refId = `obs-audio:${input.inputName}`;
      return {
        id: `auto-obs-audio-${input.inputName}`,
        type: "obs",
        refId,
        label: input.inputName,
        icon: autoItemIcons[getAutoItemKey("obs", refId)] ?? null,
      };
    });

    const appItems: WebDeckItem[] = apps
      .slice()
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .map((app) => {
        const refId = app.id;
        return {
          id: `auto-app-${app.id}`,
          type: "app",
          refId,
          label: app.name,
          icon: autoItemIcons[getAutoItemKey("app", refId)] ?? app.icon ?? null,
        };
      });

    return [
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.soundpad,
        title: t("webdeck.auto.page.soundpad", "Auto: SoundPad Audios"),
        kind: "soundpad",
        items: soundPadItems,
        gridCols: defaultCols,
        gridRows: defaultRows,
        pageIcon: autoPageIcons[AUTO_PAGE.soundpad] ?? null,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.obsScenes,
        title: t("webdeck.auto.page.obs_scenes", "Auto: OBS Cenas"),
        kind: "obs-scenes",
        items: obsSceneItems,
        gridCols: defaultCols,
        gridRows: defaultRows,
        pageIcon: autoPageIcons[AUTO_PAGE.obsScenes] ?? null,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.obsAudios,
        title: t("webdeck.auto.page.obs_audios", "Auto: OBS Audios"),
        kind: "obs-audios",
        items: obsAudioItems,
        gridCols: defaultCols,
        gridRows: defaultRows,
        pageIcon: autoPageIcons[AUTO_PAGE.obsAudios] ?? null,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.obsAll,
        title: t("webdeck.auto.page.obs_all", "Auto: OBS Cenas + Audios"),
        kind: "obs-all",
        items: [...obsSceneItems, ...obsAudioItems],
        gridCols: defaultCols,
        gridRows: defaultRows,
        pageIcon: autoPageIcons[AUTO_PAGE.obsAll] ?? null,
      }),
      ...buildAutoPagedPages({
        rootId: AUTO_PAGE.apps,
        title: t("webdeck.auto.page.apps", "Auto: Apps"),
        kind: "apps",
        items: appItems,
        gridCols: defaultCols,
        gridRows: defaultRows,
        pageIcon: autoPageIcons[AUTO_PAGE.apps] ?? null,
      }),
    ];
  }, [pages, soundpadAudios, obsScenes, obsAudioInputs, apps, autoItemIcons, autoPageIcons, t]);

  const autoPages = useMemo(() => autoPageRoots, [autoPageRoots]);
  const autoRootPages = useMemo(
    () => autoPages.filter((page) => page.isAutoPage && !page.isAutoSubPage),
    [autoPages]
  );
  const viewPages = useMemo<WebDeckViewPage[]>(() => [...pages, ...autoPages], [pages, autoPages]);
  const currentPage = useMemo(() => viewPages.find((item) => item.id === selectedPageId) ?? null, [viewPages, selectedPageId]);
  const pageById = useMemo(() => new Map(viewPages.map((page) => [page.id, page])), [viewPages]);
  const appById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const sessionByUserId = useMemo(() => new Map(remoteSessions.map((session) => [session.userId, session])), [remoteSessions]);
  const hasPendingSessions = useMemo(() => remoteSessions.some((session) => session.status === "pending"), [remoteSessions]);
  const backItemsCount = useMemo(() => currentPage?.items.filter((item) => item?.type === "back").length ?? 0, [currentPage?.items]);
  const visiblePages = useMemo(
    () => [...pages, ...autoRootPages].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true })),
    [pages, autoRootPages]
  );
  const sortedPages = useMemo(
    () => [...viewPages].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true })),
    [viewPages]
  );
  const isCurrentAutoPage = Boolean(currentPage?.isAutoPage);
  const selectedPageForSelect = useMemo(() => {
    if (!currentPage) return selectedPageId;
    if (currentPage.isAutoSubPage && currentPage.autoRootId) return currentPage.autoRootId;
    return selectedPageId;
  }, [currentPage, selectedPageId]);
  const isFirstPage = useMemo(() => {
    if (!currentPage || currentPage.isAutoPage) return false;
    const ordered = [...pages].sort((a, b) => a.position - b.position);
    return ordered[0]?.id === currentPage.id;
  }, [currentPage, pages]);

  const loadSupportLists = async () => {
    if (supportListsLoadingRef.current) return;
    supportListsLoadingRef.current = true;
    try {
      const [audios] = await Promise.all([window.underdeck.soundpad.listAudios()]);
      setSoundpadAudios(Array.isArray(audios) ? audios : []);
      await window.underdeck.obs.connect();
      const [scenes, inputs] = await Promise.all([window.underdeck.obs.listScenes(), window.underdeck.obs.listAudioInputs()]);
      setObsScenes(Array.isArray(scenes) ? scenes : []);
      setObsAudioInputs(Array.isArray(inputs) ? inputs : []);
      supportListsLoadedRef.current = true;
    } finally {
      supportListsLoadingRef.current = false;
    }
  };

  const loadPages = async (focusPageId?: string) => {
    setLoading(true);
    try {
      const list = await window.underdeck.webdeck.listPages();
      const safeList = Array.isArray(list) ? list : [];
      setPages(safeList);
      const fallbackId = safeList[0]?.id ?? "";
      const selectedIsAuto = selectedPageId.startsWith("__auto_page_");
      const nextSelected =
        focusPageId && safeList.some((page) => page.id === focusPageId)
          ? focusPageId
          : focusPageId && focusPageId.startsWith("__auto_page_")
            ? focusPageId
            : selectedPageId && safeList.some((page) => page.id === selectedPageId)
              ? selectedPageId
              : selectedIsAuto
                ? selectedPageId
                : fallbackId;
      setSelectedPageId(nextSelected);
      const selected = safeList.find((page) => page.id === nextSelected);
      if (selected) {
        setGridCols(String(selected.gridCols));
        setGridRows(String(selected.gridRows));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAutoIcons = async () => {
    if (typeof window.underdeck.webdeck.listAutoIcons !== "function") {
      setAutoPageIcons({});
      setAutoItemIcons({});
      return;
    }
    const icons = await window.underdeck.webdeck.listAutoIcons();
    setAutoPageIcons(icons?.pages ?? {});
    setAutoItemIcons(icons?.items ?? {});
  };

  const notifyWebDeckChanged = async () => {
    try {
      // Atualiza o cache-buster para forçar re-renderização das imagens
      setIconVersion(Date.now());
      await window.underdeck.express.notifyWebDeckChanged();
    } catch {
      // ignore notify failures when express is off or unavailable
    }
  };

  useEffect(() => {
    void Promise.all([loadPages(), loadAutoIcons()]);
  }, []);

  useEffect(() => {
    if (typeof window.underdeck.webdeck.onChanged !== "function") return;
    const unsubscribe = window.underdeck.webdeck.onChanged(() => {
      // Atualiza o cache-buster para forçar re-renderização das imagens
      setIconVersion(Date.now());
      void Promise.all([loadPages(selectedPageId), loadAutoIcons()]);
    });
    return () => {
      unsubscribe();
    };
  }, [selectedPageId]);

  useEffect(() => {
    void loadSupportLists();
    const unsubscribeSoundPad = window.underdeck.soundpad.onAudiosChanged((audios) => {
      setSoundpadAudios(Array.isArray(audios) ? audios : []);
      supportListsLoadedRef.current = true;
    });
    const unsubscribeObs = window.underdeck.obs.onStateChanged((state) => {
      setObsScenes(Array.isArray(state?.scenes) ? state.scenes : []);
      setObsAudioInputs(Array.isArray(state?.audioInputs) ? state.audioInputs : []);
      supportListsLoadedRef.current = true;
    });
    return () => {
      unsubscribeSoundPad();
      unsubscribeObs();
    };
  }, []);

  useEffect(() => {
    if (!currentPage) return;
    setGridCols(String(currentPage.gridCols));
    setGridRows(String(currentPage.gridRows));
  }, [currentPage?.id, currentPage?.gridCols, currentPage?.gridRows]);

  useEffect(() => {
    void (async () => {
      const status = await window.underdeck.express.status();
      setExpressEnabled(Boolean(status));
    })();
  }, []);

  useEffect(() => {
    if (typeof window.underdeck.express.onStatusChanged !== "function") return;
    const unsubscribe = window.underdeck.express.onStatusChanged((payload) => {
      setExpressEnabled(Boolean(payload?.enabled));
      if (Number.isFinite(Number(payload?.port))) {
        setExpressPort(String(payload.port));
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const raw = createIcon.trim();
    if (!raw) {
      setCreateIconPreview(null);
      return;
    }
    const isDirect =
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:") ||
      raw.startsWith("underdeck-media://") ||
      raw.startsWith("file://");
    if (isDirect) {
      setCreateIconPreview(raw);
      return;
    }
    let active = true;
    void window.underdeck.dialog.readFileAsDataUrl(raw).then((dataUrl) => {
      if (!active) return;
      setCreateIconPreview(dataUrl ?? null);
    });
    return () => {
      active = false;
    };
  }, [createIcon]);

  useEffect(() => {
    const raw = itemForm.icon.trim();
    if (!raw) {
      setItemIconPreview(null);
      return;
    }
    const isDirect =
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:") ||
      raw.startsWith("underdeck-media://") ||
      raw.startsWith("file://");
    if (isDirect) {
      setItemIconPreview(raw);
      return;
    }
    let active = true;
    void window.underdeck.dialog.readFileAsDataUrl(raw).then((dataUrl) => {
      if (!active) return;
      setItemIconPreview(dataUrl ?? null);
    });
    return () => {
      active = false;
    };
  }, [itemForm.icon]);

  const pickIconPath = async (setter: (value: string) => void) => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("webdeck.icon.select", "Selecionar icone"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    setter(selectedPath);
  };

  const createPage = async () => {
    const name = normalizeLabel(createName, "");
    if (!name) return toast.error(t("webdeck.page.name.required", "Informe o nome da pagina."));
    const created = await window.underdeck.webdeck.createPage({ name, iconSource: createIcon.trim() || null }, sourceId);
    if (!created) return toast.error(t("webdeck.page.create.fail", "Falha ao criar pagina."));
    setCreateName("");
    setCreateIcon("");
    setCreatePageOpen(false);
    await loadPages(created.id);
    await notifyWebDeckChanged();
  };

  const savePageSettings = async () => {
    if (!currentPage) return;
    if (currentPage.isAutoPage) {
      if (typeof window.underdeck.webdeck.setAutoPageIcon !== "function") {
        toast.error("Atualize/reinicie o Electron para aplicar icones de Auto Page.");
        return;
      }
      const rootId = currentPage.autoRootId ?? currentPage.id;
      await window.underdeck.webdeck.setAutoPageIcon(rootId, editPageIcon.trim() || null, sourceId);
      await loadAutoIcons();
      setEditPageOpen(false);
      await notifyWebDeckChanged();
      return;
    }
    const name = normalizeLabel(editPageName, "");
    if (!name) return toast.error(t("webdeck.page.name.required", "Informe o nome da pagina."));
    const updated = await window.underdeck.webdeck.updatePage({ id: currentPage.id, name, iconSource: editPageIcon.trim() || null }, sourceId);
    if (!updated) return toast.error(t("webdeck.page.update.fail", "Falha ao atualizar pagina."));
    setEditPageOpen(false);
    await loadPages(currentPage.id);
    await notifyWebDeckChanged();
  };

  const deleteCurrentPage = async () => {
    if (!currentPage || currentPage.isAutoPage) return;
    const ok = await window.underdeck.webdeck.deletePage(currentPage.id, sourceId);
    if (!ok) return toast.error(t("webdeck.page.delete.fail", "Falha ao deletar pagina."));
    setPageHistory((prev) => prev.filter((id) => id !== currentPage.id));
    await loadPages();
    await notifyWebDeckChanged();
  };

  const applyGrid = async () => {
    if (!currentPage || currentPage.isAutoPage) return;
    const cols = Number(gridCols);
    const rows = Number(gridRows);
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return toast.error(t("webdeck.grid.invalid", "Grid invalido."));
    if (cols < 2 || rows < 2 || cols * rows < 4) return toast.error(t("webdeck.grid.min_2x2", "O grid minimo e 2x2."));
    const updated = await window.underdeck.webdeck.setGrid(currentPage.id, cols, rows, sourceId);
    if (!updated) return toast.error(t("webdeck.grid.update.fail", "Falha ao atualizar grid."));
    await loadPages(currentPage.id);
    await notifyWebDeckChanged();
  };

  const openAccessInfo = async () => {
    setOpenAccessModal(true);
    setAccessTab("local");
    setAccessInfoLoading(true);
    try {
      const info = await window.underdeck.express.getWebDeckAccessInfo();
      setAccessInfo(info);
    } catch {
      toast.error(t("webdeck.express.access_info.fail", "Falha ao carregar dados de acesso."));
      setAccessInfo(null);
    } finally {
      setAccessInfoLoading(false);
    }

    // remote access is handled via manager (invites)
  };

  const openAccessUrlInBrowser = async () => {
    const targetUrl = accessInfo?.localIpUrl || accessInfo?.localhostUrl || "";
    if (!targetUrl) return;
    const ok = await window.underdeck.express.openExternal(targetUrl);
    if (!ok) {
      toast.error(t("webdeck.express.open_external.fail", "Falha ao abrir no navegador."));
    }
  };

  const openInviteQr = async (url: string) => {
    setInviteQrUrl(url);
    if (!url) {
      setInviteQrDataUrl(null);
      setInviteQrOpen(true);
      return;
    }
    try {
      const qr = await window.underdeck?.system?.makeQrCodeDataUrl?.(url);
      setInviteQrDataUrl(qr ?? null);
      setInviteQrOpen(true);
    } catch {
      setInviteQrDataUrl(null);
      setInviteQrOpen(true);
    }
  };

  useEffect(() => {
    if (!openAccessModal || accessTab !== "remote") return;
    void refreshRemoteManager();
  }, [accessTab, openAccessModal, remoteSocketConnected, user?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: "invites" | "connections" | "sessions" }>).detail;
      setOpenAccessModal(true);
      setAccessTab("remote");
      setRemoteManagerTab(detail?.tab ?? "sessions");
      void refreshRemoteManager();
    };
    window.addEventListener("underdeck:open-webdeck-remote-manager", handler as EventListener);
    return () => {
      window.removeEventListener("underdeck:open-webdeck-remote-manager", handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (window.sessionStorage.getItem("underdeck:webdeck:openRemoteSessions") !== "1") return;
    window.sessionStorage.removeItem("underdeck:webdeck:openRemoteSessions");
    setOpenAccessModal(true);
    setAccessTab("remote");
    setRemoteManagerTab("sessions");
    void refreshRemoteManager();
  }, []);

  useEffect(() => {
    if (!openAccessModal || accessTab !== "remote" || remoteManagerTab !== "connections") return;
    const interval = window.setInterval(() => {
      setConnectionsTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [accessTab, openAccessModal, remoteManagerTab]);

  useEffect(() => {
    if (!remoteSocket || !remoteDeviceId) return;
    const onInvitesUpdated = (payload: { deviceId?: string }) => {
      if (payload?.deviceId !== remoteDeviceId) return;
      void loadRemoteInvites(remoteDeviceId);
    };
    const onSessionsUpdated = (payload: { deviceId?: string }) => {
      if (payload?.deviceId !== remoteDeviceId) return;
      void loadRemoteSessions(remoteDeviceId);
    };
    const onConnectionsUpdated = (payload: { deviceId?: string }) => {
      if (payload?.deviceId !== remoteDeviceId) return;
      void loadRemoteConnections(remoteDeviceId);
    };
    remoteSocket.on("device:invites:updated", onInvitesUpdated);
    remoteSocket.on("device:sessions:updated", onSessionsUpdated);
    remoteSocket.on("device:connections:updated", onConnectionsUpdated);
    return () => {
      remoteSocket.off("device:invites:updated", onInvitesUpdated);
      remoteSocket.off("device:sessions:updated", onSessionsUpdated);
      remoteSocket.off("device:connections:updated", onConnectionsUpdated);
    };
  }, [remoteDeviceId, remoteSocket]);

  const loadRemoteDevice = async (): Promise<RemoteDeviceSummary | null> => {
    const device = await window.underdeck?.system?.getDeviceInfo?.();
    const hwid = String(device?.hwid || "").trim();
    if (!hwid) return null;
    const data = await apiFetch("/api/devices");
    const devices = Array.isArray(data?.devices) ? data.devices : [];
    const match = devices.find((entry: any) => entry?.hwid === hwid && entry?.isOwner);
    if (!match) return null;
    return { id: match.id, name: match.name, hwid: match.hwid };
  };

  const loadRemoteInvites = async (deviceId: string) => {
    const data = await apiFetch(`/api/devices/${deviceId}/invites`);
    setRemoteInvites(Array.isArray(data?.invites) ? data.invites : []);
  };

  const loadRemoteSessions = async (deviceId: string) => {
    const data = await apiFetch(`/api/devices/${deviceId}/sessions`);
    setRemoteSessions(Array.isArray(data?.sessions) ? data.sessions : []);
  };

  const loadRemoteConnections = async (deviceId: string) => {
    const data = await apiFetch(`/api/devices/${deviceId}/connections`);
    setRemoteConnections(Array.isArray(data?.connections) ? data.connections : []);
  };

  const refreshRemoteManager = async () => {
    if (!user?.id || !remoteSocketConnected) return;
    setRemoteManagerLoading(true);
    try {
      const device = await loadRemoteDevice();
      if (!device) {
        setRemoteDeviceId("");
        setRemoteDeviceName("");
        setRemoteInvites([]);
        setRemoteConnections([]);
        setRemoteSessions([]);
        return;
      }
      setRemoteDeviceId(device.id);
      setRemoteDeviceName(device.name);
      await Promise.all([
        loadRemoteInvites(device.id),
        loadRemoteConnections(device.id),
        loadRemoteSessions(device.id),
      ]);
    } catch (error: any) {
      toast.error(t("webdeck.remote.manager.load_fail", "Falha ao carregar dados remotos."), {
        description: error?.message || "",
      });
    } finally {
      setRemoteManagerLoading(false);
    }
  };

  const createInvite = async () => {
    if (!remoteDeviceId) return;
    try {
      await apiFetch(`/api/devices/${remoteDeviceId}/invites`, {
        method: "POST",
        body: JSON.stringify({ duration: inviteDuration }),
      });
      toast.success(t("webdeck.remote.invites.created", "Convite criado."));
      await loadRemoteInvites(remoteDeviceId);
    } catch (error: any) {
      toast.error(t("webdeck.remote.invites.create_fail", "Falha ao criar convite."), {
        description: error?.message || "",
      });
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!remoteDeviceId) return;
    try {
      await apiFetch(`/api/devices/${remoteDeviceId}/invites/${inviteId}`, { method: "DELETE" });
      toast.success(t("webdeck.remote.invites.revoked", "Convite removido."));
      await loadRemoteInvites(remoteDeviceId);
    } catch (error: any) {
      toast.error(t("webdeck.remote.invites.revoke_fail", "Falha ao remover convite."), {
        description: error?.message || "",
      });
    }
  };

  const approveSession = async (sessionId: string) => {
    if (!remoteDeviceId) return;
    try {
      await apiFetch(`/api/devices/${remoteDeviceId}/sessions/${sessionId}/approve`, { method: "POST" });
      toast.success(t("webdeck.remote.sessions.approved", "Sessão aprovada."));
      await loadRemoteSessions(remoteDeviceId);
    } catch (error: any) {
      toast.error(t("webdeck.remote.sessions.approve_fail", "Falha ao aprovar sessão."), {
        description: error?.message || "",
      });
    }
  };

  const denySession = async (sessionId: string) => {
    if (!remoteDeviceId) return;
    try {
      await apiFetch(`/api/devices/${remoteDeviceId}/sessions/${sessionId}/deny`, { method: "POST" });
      toast.success(t("webdeck.remote.sessions.denied", "Sessão recusada."));
      await Promise.all([loadRemoteSessions(remoteDeviceId), loadRemoteConnections(remoteDeviceId)]);
    } catch (error: any) {
      toast.error(t("webdeck.remote.sessions.deny_fail", "Falha ao recusar sessão."), {
        description: error?.message || "",
      });
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!remoteDeviceId) return;
    try {
      await apiFetch(`/api/devices/${remoteDeviceId}/sessions/${sessionId}`, { method: "DELETE" });
      toast.success(t("webdeck.remote.sessions.revoked", "Permissão removida."));
      await Promise.all([loadRemoteSessions(remoteDeviceId), loadRemoteConnections(remoteDeviceId)]);
    } catch (error: any) {
      toast.error(t("webdeck.remote.sessions.revoke_fail", "Falha ao remover permissão."), {
        description: error?.message || "",
      });
    }
  };

  const disconnectUser = async (userId: string) => {
    if (!remoteDeviceId) return;
    try {
      await apiFetch(`/api/devices/${remoteDeviceId}/connections/${userId}/disconnect`, { method: "POST" });
      toast.success(t("webdeck.remote.connections.disconnected", "Usuário desconectado."));
      await loadRemoteConnections(remoteDeviceId);
    } catch (error: any) {
      toast.error(t("webdeck.remote.connections.disconnect_fail", "Falha ao desconectar usuário."), {
        description: error?.message || "",
      });
    }
  };

  const applyExpressState = async (enabled: boolean) => {
    const portValue = Number(expressPort);
    if (enabled && (!Number.isFinite(portValue) || portValue < 1 || portValue > 65535)) {
      toast.error(t("webdeck.express.invalid_port", "Porta invalida."));
      return;
    }
    setExpressBusy(true);
    try {
      if (enabled) {
        const started = await window.underdeck.express.start(Math.trunc(portValue), sourceId);
        setExpressEnabled(Boolean(started));
      } else {
        await window.underdeck.express.stop(sourceId);
        setExpressEnabled(false);
      }
    } finally {
      setExpressBusy(false);
    }
  };

  const openItemEditor = async (slotIndex: number) => {
    if (!currentPage) return;
    if (!currentPage.isAutoPage && !supportListsLoadedRef.current) {
      void loadSupportLists();
    }
    const existing = currentPage.items[slotIndex];
    if (currentPage.isAutoPage) {
      if (!existing) return;
      if (existing.type === "back" || existing.type === "page") return;
      setEditingAutoItemKey(getAutoItemKey(existing.type, existing.refId));
    } else {
      setEditingAutoItemKey(null);
    }
    const nextObsActionType: ObsActionType | null =
      existing?.type === "obs"
        ? (
          existing.refId.startsWith("obs-scene:")
            ? "scene"
            : existing.refId.startsWith("obs-audio:")
              ? "audio"
              : existing.refId.startsWith("obs-action:stopStream")
                || existing.refId.startsWith("obs-action:startStream")
                || existing.refId.startsWith("obs-action:toggleStream")
                ? "stream"
                : "record"
        )
        : null;
    if (nextObsActionType) {
      setObsActionType(nextObsActionType);
    }
    setItemForm(
      !existing
        ? { type: "page", refId: apps[0]?.id ?? "", label: "", icon: "" }
        : {
          type: existing.type,
          refId:
            existing.type === "back"
              ? (
                existing.refId
                  ? encodeRefValue(existing.refId)
                  : (isFirstPage ? "__history__" : (sortedPages.find((page) => page.id !== currentPage.id)?.id ?? ""))
              )
              : existing.refId,
          label: existing.label ?? "",
          icon: existing.icon ?? "",
        }
    );
    setEditingSlot(slotIndex);
    setItemFormOpen(true);
  };

  const saveItem = async () => {
    if (!currentPage || editingSlot == null) return;
    if (currentPage.isAutoPage) {
      if (!editingAutoItemKey) return;
      if (typeof window.underdeck.webdeck.setAutoItemIcon !== "function") {
        toast.error("Atualize/reinicie o Electron para aplicar icones de item automatico.");
        return;
      }
      await window.underdeck.webdeck.setAutoItemIcon(editingAutoItemKey, itemForm.icon.trim() || null, sourceId);
      await loadAutoIcons();
      setItemFormOpen(false);
      setEditingSlot(null);
      setEditingAutoItemKey(null);
      await notifyWebDeckChanged();
      return;
    }
    const type = itemForm.type;
    const refId = itemForm.refId;

    const normalizedType: WebDeckItem["type"] = type as WebDeckItem["type"];
    const normalizedRef = normalizedType === "back" ? decodeRefValue(refId) : refId.trim();
    if (normalizedType === "back" && !isFirstPage && !normalizedRef) {
      return toast.error(t("webdeck.back.target.required", "Nas outras paginas, Voltar deve redirecionar para uma pagina."));
    }
    if (normalizedType !== "back" && !normalizedRef) return toast.error(t("webdeck.item.destination.required", "Selecione o destino do item."));
    const normalizedIcon = itemForm.icon.trim() || null;
    const isAutoPageLink = normalizedType === "page" && normalizedRef.startsWith("__auto_page_");
    if (isAutoPageLink) {
      if (typeof window.underdeck.webdeck.setAutoPageIcon !== "function") {
        toast.error("Atualize/reinicie o Electron para aplicar icones de Auto Page.");
        return;
      }
      // Auto page icon should only be removed via "Editar pagina" (auto page settings),
      // never by clearing/removing a grid item that points to that auto page.
      if (normalizedIcon) {
        await window.underdeck.webdeck.setAutoPageIcon(normalizedRef, normalizedIcon, sourceId);
        await loadAutoIcons();
      }
    }
    const updated = await window.underdeck.webdeck.upsertItem(currentPage.id, editingSlot, {
      type: normalizedType,
      refId: normalizedRef,
      label: itemForm.label.trim() || undefined,
      // Auto page links inherit icon from the auto page itself.
      icon: isAutoPageLink ? null : normalizedIcon,
    }, sourceId);
    if (!updated) return toast.error(t("webdeck.item.save.fail", "Falha ao salvar item."));
    setItemFormOpen(false);
    setEditingSlot(null);
    await loadPages(currentPage.id);
    await notifyWebDeckChanged();
  };

  const removeItem = async (index: number) => {
    if (!currentPage || currentPage.isAutoPage) return;
    const item = currentPage.items[index];
    if (item?.type === "back" && backItemsCount <= 1) return toast.error(t("webdeck.back.required", "Sempre deve existir ao menos um item Voltar."));
    const updated = await window.underdeck.webdeck.removeItem(currentPage.id, index, sourceId);
    if (!updated) return toast.error(t("webdeck.item.remove.fail", "Falha ao remover item."));
    await loadPages(currentPage.id);
    await notifyWebDeckChanged();
  };

  const moveTo = async (toIndex: number) => {
    if (!currentPage || currentPage.isAutoPage || movingFromIndex == null || movingFromIndex === toIndex) return;
    const updated = await window.underdeck.webdeck.moveItem(currentPage.id, movingFromIndex, toIndex, sourceId);
    if (!updated) return toast.error(t("webdeck.item.move.fail", "Falha ao mover item."));
    setMovingFromIndex(null);
    await loadPages(currentPage.id);
    await notifyWebDeckChanged();
  };

  const openItem = async (item: WebDeckItem) => {
    if (!currentPage) return;
    if (item.type === "back") {
      if (item.refId) {
        const nextPage = pageById.get(item.refId);
        if (!nextPage) return toast.error(t("webdeck.back.target_missing", "Página de retorno não encontrada."));
        setSelectedPageId(nextPage.id);
        return;
      }
      if (pageHistory.length === 0) return;
      const previousPageId = pageHistory[pageHistory.length - 1];
      setPageHistory((prev) => prev.slice(0, -1));
      setSelectedPageId(previousPageId);
      return;
    }
    if (item.type === "page") {
      const nextPage = pageById.get(item.refId);
      if (!nextPage) return toast.error(t("webdeck.page.target_missing", "Página de destino não encontrada."));
      const isSameAutoStack =
        Boolean(currentPage.isAutoPage) &&
        Boolean(nextPage.isAutoPage) &&
        currentPage.autoRootId &&
        nextPage.autoRootId &&
        currentPage.autoRootId === nextPage.autoRootId;
      if (!isSameAutoStack) {
        setPageHistory((prev) => [...prev, currentPage.id]);
      }
      setSelectedPageId(nextPage.id);
      return;
    }
    if (item.type === "soundpad") {
      if (item.refId.startsWith("soundpad-audio:")) {
        const index = Number(item.refId.replace("soundpad-audio:", ""));
        const result = await window.underdeck.soundpad.playSound(index);
        if (!result.ok) toast.error(t("webdeck.soundpad.fail", "Falha ao executar audio SoundPad."));
        return;
      }
      return executeApp(item.refId);
    }
    if (item.type === "obs") {
      if (item.refId.startsWith("obs-scene:")) {
        const result = await window.underdeck.obs.setCurrentScene(item.refId.replace("obs-scene:", ""));
        if (!result.ok) toast.error(result.message);
        return;
      }
      if (item.refId.startsWith("obs-audio:")) {
        const result = await window.underdeck.obs.toggleInputMute(item.refId.replace("obs-audio:", ""));
        if (!result.ok) toast.error(result.message);
        return;
      }
      if (item.refId.startsWith("obs-action:")) {
        const action = item.refId.replace("obs-action:", "");
        const map: Record<string, () => Promise<{ ok: boolean; message: string }>> = {
          startStream: () => window.underdeck.obs.startStream(),
          stopStream: () => window.underdeck.obs.stopStream(),
          toggleStream: () => window.underdeck.obs.toggleStream(),
          startRecord: () => window.underdeck.obs.startRecord(),
          stopRecord: () => window.underdeck.obs.stopRecord(),
          toggleRecordPause: () => window.underdeck.obs.toggleRecordPause(),
          pauseRecord: () => window.underdeck.obs.pauseRecord(),
          resumeRecord: () => window.underdeck.obs.resumeRecord(),
        };
        const handler = map[action];
        if (!handler) return;
        const result = await handler();
        if (!result.ok) toast.error(result.message);
        return;
      }
      return executeApp(item.refId);
    }
    return executeApp(item.refId);
  };

  const handlePageSelectChange = (nextPageId: string) => {
    if (!nextPageId) return;
    if (!currentPage || currentPage.id === nextPageId) {
      setSelectedPageId(nextPageId);
      return;
    }
    setPageHistory((prev) => [...prev, currentPage.id]);
    setSelectedPageId(nextPageId);
  };

  const resolveItemLabel = (item: WebDeckItem | null | undefined) => {
    if (!item) return "";
    if (item.label) return item.label;
    if (item.type === "back") return t("webdeck.back", "Voltar");
    if (item.type === "page") return pageById.get(item.refId)?.name ?? t("webdeck.page", "Página");
    if (item.type === "soundpad" && item.refId.startsWith("soundpad-audio:")) {
      const index = Number(item.refId.replace("soundpad-audio:", ""));
      const audio = soundpadAudios.find((entry) => entry.index === index);
      return audio?.name || `SoundPad #${index}`;
    }
    if (item.type === "obs" && item.refId.startsWith("obs-")) {
      if (item.refId.startsWith("obs-action:")) {
        const action = item.refId.replace("obs-action:", "");
        switch (action) {
          case "startStream":
            return t("webdeck.obs.action.start_stream", "Iniciar stream");
          case "stopStream":
            return t("webdeck.obs.action.stop_stream", "Parar stream");
          case "toggleStream":
            return t("webdeck.obs.action.toggle_stream", "Alternar stream");
          case "startRecord":
            return t("webdeck.obs.action.start_record", "Iniciar gravação");
          case "stopRecord":
            return t("webdeck.obs.action.stop_record", "Parar gravação");
          case "toggleRecordPause":
            return t("webdeck.obs.action.toggle_record_pause", "Alternar pausa da gravação");
          case "pauseRecord":
            return t("webdeck.obs.action.pause_record", "Pausar gravação");
          case "resumeRecord":
            return t("webdeck.obs.action.resume_record", "Retomar gravação");
          default:
            return action;
        }
      }
      return item.refId.replace(/^obs-(scene|audio):/, "");
    }
    return appById.get(item.refId)?.name ?? t("webdeck.item.unknown", "Item");
  };

  const addCacheBuster = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const hasQuery = url.includes("?");
    return `${url}${hasQuery ? "&" : "?"}v=${iconVersion}`;
  };

  const resolveItemBackground = (item: WebDeckItem | null | undefined) => {
    if (!item) return null;
    let iconUrl: string | null = null;
    if (item.type === "page" && item.refId.startsWith("__auto_page_")) {
      iconUrl = pageById.get(item.refId)?.icon ?? null;
    } else if (item.icon) {
      iconUrl = item.icon;
    } else if (item.type === "back") {
      const targetPageId = item.refId || pageHistory[pageHistory.length - 1] || "";
      iconUrl = targetPageId ? pageById.get(targetPageId)?.icon ?? null : null;
    } else if (item.type === "page") {
      iconUrl = pageById.get(item.refId)?.icon ?? null;
    } else {
      iconUrl = appById.get(item.refId)?.icon ?? null;
    }
    return addCacheBuster(iconUrl);
  };

  const gridPresetValue = `${gridCols}x${gridRows}`;
  const selectedGridPreset = GRID_PRESETS.includes(gridPresetValue) ? gridPresetValue : GRID_CUSTOM_VALUE;

  const destinationOptions = useMemo(() => {
    if (itemForm.type === "back") {
      const pagesOptions = visiblePages
        .filter((page) => page.id !== currentPage?.id)
        .map((page) => ({ value: page.id, label: page.name }));
      if (isFirstPage) {
        return [{ value: "__history__", label: t("webdeck.back.history", "Voltar pelo historico") }, ...pagesOptions];
      }
      return pagesOptions;
    }
    if (itemForm.type === "page") return visiblePages.filter((page) => page.id !== currentPage?.id).map((page) => ({ value: page.id, label: page.name }));
    if (itemForm.type === "app") return apps.map((app) => ({ value: app.id, label: app.name }));
    if (itemForm.type === "soundpad") {
      const audios = soundpadAudios.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" })).map((audio) => ({ value: `soundpad-audio:${audio.index}`, label: `#${audio.index} ${normalizeLabel(audio.name, t("soundpad.unknown", "Sem nome"))}` }));
      return audios;
    }
    if (itemForm.type === "obs") {
      const scenes = obsScenes
        .slice()
        .sort((a, b) => a.sceneName.localeCompare(b.sceneName, "pt-BR", { sensitivity: "base" }))
        .map((scene) => ({ value: `obs-scene:${scene.sceneName}`, label: scene.sceneName }));
      const audios = obsAudioInputs
        .slice()
        .sort((a, b) => a.inputName.localeCompare(b.inputName, "pt-BR", { sensitivity: "base" }))
        .map((input) => ({ value: `obs-audio:${input.inputName}`, label: input.inputName }));
      const streamActions = [
        { value: "obs-action:startStream", label: t("webdeck.obs.action.start_stream", "Iniciar stream") },
        { value: "obs-action:stopStream", label: t("webdeck.obs.action.stop_stream", "Parar stream") },
        { value: "obs-action:toggleStream", label: t("webdeck.obs.action.toggle_stream", "Alternar stream") },
      ];
      const recordActions = [
        { value: "obs-action:startRecord", label: t("webdeck.obs.action.start_record", "Iniciar gravação") },
        { value: "obs-action:stopRecord", label: t("webdeck.obs.action.stop_record", "Parar gravação") },
        { value: "obs-action:toggleRecordPause", label: t("webdeck.obs.action.toggle_record_pause", "Alternar pausa da gravação") },
        { value: "obs-action:pauseRecord", label: t("webdeck.obs.action.pause_record", "Pausar gravação") },
        { value: "obs-action:resumeRecord", label: t("webdeck.obs.action.resume_record", "Retomar gravação") },
      ];
      switch (obsActionType) {
        case "audio":
          return audios;
        case "stream":
          return streamActions;
        case "record":
          return recordActions;
        default:
          return scenes;
      }
    }
    return [];
  }, [itemForm.type, visiblePages, currentPage?.id, apps, soundpadAudios, obsScenes, obsAudioInputs, t, isFirstPage, obsActionType]);

  useEffect(() => {
    if (!itemFormOpen) return;
    if (destinationOptions.length === 0) return;
    const hasSelected = destinationOptions.some((option) => option.value === itemForm.refId);
    if (hasSelected) return;
    setItemForm((prev) => ({ ...prev, refId: destinationOptions[0].value }));
  }, [itemFormOpen, destinationOptions, itemForm.refId]);

  return (
    <div className="w-full h-full p-2 select-none">
      <Card className={cn("relative p-4 bg-card/70 overflow-hidden", className)}>
        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-end gap-2">
              <Button rounded="xl" onClick={() => setCreatePageOpen(true)}><Plus className="h-4 w-4" /> {t("webdeck.page.create", "Criar Página")}</Button>
              <Button rounded="xl" variant="secondary" onClick={() => void loadPages(selectedPageId)} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                {t("common.refresh", "Atualizar")}
              </Button>
            </div>

            {!currentPage ? (
              <Card className="p-6 text-sm text-muted-foreground">{t("webdeck.empty", "Nenhuma pagina encontrada.")}</Card>
            ) : (
              <WebDeckGrid<WebDeckItem>
                pageId={currentPage.id}
                gridCols={currentPage.gridCols}
                gridRows={currentPage.gridRows}
                items={currentPage.items}
                mode="edit"
                emptyStyle={isCurrentAutoPage ? "placeholder" : "plus"}
                emptyLabel={t("webdeck.empty.icon", "Nenhum icone")}
                movingFromIndex={movingFromIndex}
                openDropdownSlot={openDropdownSlot}
                onDropdownSlotChange={setOpenDropdownSlot}
                onSlotClick={(index, item) => {
                  if (movingFromIndex != null) {
                    void moveTo(index);
                    return;
                  }
                  if (!item) {
                    if (!isCurrentAutoPage) {
                      void openItemEditor(index);
                    }
                    return;
                  }
                  void openItem(item);
                }}
                onEditItem={(index, item) => {
                  if (isCurrentAutoPage && (item.type === "back" || item.type === "page")) return;
                  setOpenDropdownSlot(null);
                  void openItemEditor(index);
                }}
                onMoveItem={(index) => {
                  if (isCurrentAutoPage) return;
                  setOpenDropdownSlot(null);
                  setMovingFromIndex(index);
                }}
                onRemoveItem={(index, item) => {
                  if (isCurrentAutoPage) return;
                  if (item.type === "back" && backItemsCount <= 1) return;
                  setOpenDropdownSlot(null);
                  void removeItem(index);
                }}
                canEditItem={(_index, item) => !(isCurrentAutoPage && (item.type === "back" || item.type === "page"))}
                canMoveItem={() => !isCurrentAutoPage}
                canRemoveItem={(_index, item) => !isCurrentAutoPage && !(item.type === "back" && backItemsCount <= 1)}
                resolveItemLabel={(item) => resolveItemLabel(item)}
                resolveItemBackground={(item) => resolveItemBackground(item)}
              />
            )}
          </div>

          <Card className="p-3 border-border/70 bg-card/70 h-fit">
            <div className="grid gap-2 p-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>{t("webdeck.express.title", "Servidor Express")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {expressEnabled ? t("webdeck.express.on", "Ativo") : t("webdeck.express.off", "Desativado")}
                  </p>
                </div>
                <Switch
                  checked={expressEnabled}
                  disabled={expressBusy}
                  onCheckedChange={(checked) => {
                    void applyExpressState(Boolean(checked));
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  rounded="xl"
                  value={expressPort}
                  onChange={(e) => setExpressPort(e.target.value)}
                  placeholder="59231"
                  disabled={expressBusy}
                />
                <Button
                  rounded="xl"
                  variant="secondary"
                  onClick={() => void applyExpressState(expressEnabled)}
                  disabled={expressBusy}
                >
                  {t("common.apply", "Aplicar")}
                </Button>
                <Button
                  rounded="xl"
                  variant="primary"
                  onClick={() => void openAccessInfo()}
                  disabled={expressBusy}
                >
                  {t("webdeck.express.open", "Abrir")}
                </Button>
              </div>
            </div>
            <div className="grid gap-3">
              <Label>{t("webdeck.pages", "Páginas")}</Label>
              <Select value={selectedPageForSelect} onValueChange={handlePageSelectChange}>
                <SelectTrigger rounded="xl" className="w-full"><SelectValue placeholder={t("webdeck.page.select", "Selecione uma pagina")} /></SelectTrigger>
                <SelectContent rounded="xl" className="more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">{visiblePages.map((page) => <SelectItem key={page.id} value={page.id}>{page.name}</SelectItem>)}</SelectContent>
              </Select>

              {currentPage && (
                <div className="grid gap-2">
                  <Label>{t("webdeck.page.preview", "Preview do icone")}</Label>
                  <div className="h-50 w-full rounded-xl border border-border/70 overflow-hidden bg-card/50">
                    {currentPage.icon ? <img src={currentPage.icon} alt={currentPage.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">{t("webdeck.page.no_icon", "Sem icone")}</div>}
                  </div>
                </div>
              )}

              <Label>{t("webdeck.grid", "Grid da pagina")}</Label>
              <Select value={selectedGridPreset} onValueChange={(value) => {
                if (value === GRID_CUSTOM_VALUE) return;
                const [c, r] = value.split("x");
                setGridCols(c);
                setGridRows(r);
              }} disabled={isCurrentAutoPage}>
                <SelectTrigger rounded="xl" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent rounded="xl" className="more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                  {GRID_PRESETS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  <SelectItem value={GRID_CUSTOM_VALUE}>{t("webdeck.grid.custom", "Custom")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input rounded="xl" value={gridCols} onChange={(e) => setGridCols(e.target.value)} disabled={isCurrentAutoPage} />
                <Input rounded="xl" value={gridRows} onChange={(e) => setGridRows(e.target.value)} disabled={isCurrentAutoPage} />
                <Button rounded="xl" onClick={() => void applyGrid()} disabled={isCurrentAutoPage}>{t("common.apply", "Aplicar")}</Button>
              </div>
              <div className="flex items-center gap-2">
                <Button rounded="xl" variant="outline-primary" onClick={() => { if (!currentPage) return; setEditPageName(currentPage.name); setEditPageIcon(currentPage.icon ?? ""); setEditPageOpen(true); }}>{t("common.edit", "Editar")}</Button>
                <Button rounded="xl" variant="outline-destructive" onClick={() => void deleteCurrentPage()} disabled={!currentPage || isCurrentAutoPage}>{t("common.delete", "Deletar")}</Button>
              </div>
            </div>
          </Card>
        </div>
      </Card>

      <Dialog open={editPageOpen} onOpenChange={setEditPageOpen}>
        <DialogContent className="w-[95vw] max-w-3xl select-none rounded-xl more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
          <DialogHeader><DialogTitle>{t("webdeck.page.edit", "Editar pagina")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Label>{t("common.name", "Nome")}</Label>
            <Input rounded="xl" value={editPageName} onChange={(e) => setEditPageName(e.target.value)} disabled={Boolean(currentPage?.isAutoPage)} />
            <Label>{t("webdeck.page.icon", "Ícone")}</Label>
            <div className="flex items-center gap-2">
              <Input rounded="xl" value={editPageIcon} onChange={(e) => setEditPageIcon(e.target.value)} />
              <Button rounded="xl" variant="outline-primary" onClick={() => void pickIconPath(setEditPageIcon)}>{t("common.choose", "Escolher")}</Button>
              <Button rounded="xl" variant="secondary" onClick={() => setEditPageIcon("")}>{t("common.remove", "Remover")}</Button>
            </div>
          </div>
          <DialogFooter>
            <Button rounded="xl" variant="ghost-destructive" onClick={() => setEditPageOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
            <Button rounded="xl" onClick={() => void savePageSettings()}>{t("common.save", "Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemFormOpen} onOpenChange={(open) => { setItemFormOpen(open); if (!open) { setEditingSlot(null); setEditingAutoItemKey(null); } }}>
        <DialogContent className="w-[95vw] select-none max-w-[95vw] max-h-[95vh] rounded-xl more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
          <DialogHeader><DialogTitle>{t("webdeck.item.configure", "Configurar item do grid")}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            {!isCurrentAutoPage ? (
              <div className="grid gap-2">
                <Label>{t("common.type", "Tipo")}</Label>
                <Select
                  value={itemForm.type}
                  onValueChange={(value: ItemEditorType) => {
                    if (value === "obs") setObsActionType("scene");
                    setItemForm((prev) => ({
                      ...prev,
                      type: value,
                      refId: "",
                      icon: prev.icon,
                    }));
                  }}
                >
                  <SelectTrigger rounded="xl" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent rounded="xl" className="more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                    <SelectItem value="page">{t("webdeck.item.type.page", "Página")}</SelectItem>
                    <SelectItem value="app">{t("webdeck.item.type.app", "App")}</SelectItem>
                    <SelectItem value="soundpad">{t("webdeck.item.type.soundpad", "SoundPad")}</SelectItem>
                    <SelectItem value="obs">{t("webdeck.item.type.obs", "OBS")}</SelectItem>
                    <SelectItem value="back">{t("webdeck.item.type.back", "Voltar")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {!isCurrentAutoPage ? (
              itemForm.type === "obs" ? (
                <div className="grid gap-2">
                  <Label>{t("webdeck.item.obs_action_type", "Tipo de ação do OBS")}</Label>
                  <Select
                    value={obsActionType}
                    onValueChange={(value: ObsActionType) => {
                      setObsActionType(value);
                      setItemForm((prev) => ({ ...prev, refId: "" }));
                    }}
                  >
                    <SelectTrigger rounded="xl" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent rounded="xl" className="more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                      <SelectItem value="audio">{t("webdeck.item.obs_action_type.audio", "Audio")}</SelectItem>
                      <SelectItem value="scene">{t("webdeck.item.obs_action_type.scene", "Cena")}</SelectItem>
                      <SelectItem value="stream">{t("webdeck.item.obs_action_type.stream", "Stream")}</SelectItem>
                      <SelectItem value="record">{t("webdeck.item.obs_action_type.record", "Gravação")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null
            ) : null}

            {!isCurrentAutoPage ? (
              <div className="grid gap-2">
                <Label>{t("webdeck.item.destination", "Destino")}</Label>
                <SearchableSelect
                  options={destinationOptions}
                  value={itemForm.refId || null}
                  onSelect={(value) => setItemForm((prev) => ({ ...prev, refId: value ?? "" }))}
                  placeholder={t("webdeck.item.destination.select", "Selecione o destino")}
                  searchPlaceholder={t("select.search_placeholder", "Buscar opcao...")}
                  emptyMessage={t("webdeck.item.destination.none", "Nenhuma opcao")}
                  triggerClassName="w-full rounded-xl"
                  contentClassName="more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white"
                  renderOption={(option) => <span className="truncate">{option.label}</span>}
                  renderValue={(option) => <span className="truncate">{option?.label ?? t("webdeck.item.destination.select", "Selecione o destino")}</span>}
                />
              </div>
            ) : null}

            {itemForm.type !== "app" ? (
              <div className="grid gap-2">
                <Label>{t("webdeck.item.icon.custom", "Ícone customizado (opcional)")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    rounded="xl"
                    value={itemForm.icon}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, icon: event.target.value }))}
                    placeholder="C:\\icon.png"
                  />
                  <Button rounded="xl" variant="outline-primary" onClick={() => void pickIconPath((value) => setItemForm((prev) => ({ ...prev, icon: value })))}>
                    {t("common.choose", "Escolher")}
                  </Button>
                  <Button rounded="xl" variant="secondary" onClick={() => setItemForm((prev) => ({ ...prev, icon: "" }))}>
                    {t("common.remove", "Remover")}
                  </Button>
                </div>
                <div className="h-50 w-full rounded-xl border border-border/70 overflow-hidden bg-card/50">
                  {itemIconPreview ? (
                    <img src={itemIconPreview} alt={t("webdeck.page.preview", "Preview")} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                      {t("webdeck.page.no_icon", "Sem icone")}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {!isCurrentAutoPage ? (
              <div className="grid gap-2">
                <Label>{t("webdeck.item.label", "Rótulo (opcional)")}</Label>
                <Input rounded="xl" value={itemForm.label} onChange={(e) => setItemForm((prev) => ({ ...prev, label: e.target.value }))} placeholder={t("webdeck.item.label.placeholder", "Nome personalizado")} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button rounded="xl" variant="ghost-destructive" onClick={() => setItemFormOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
            <Button rounded="xl" onClick={() => void saveItem()}>{t("common.save", "Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createPageOpen} onOpenChange={setCreatePageOpen}>
        <DialogContent className="max-w-xl select-none rounded-xl more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
          <DialogHeader><DialogTitle>{t("webdeck.page.create", "Criar Página")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Label>{t("common.name", "Nome")}</Label>
            <Input rounded="xl" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={t("webdeck.page.name", "Nome da pagina")} />
            <Label>{t("webdeck.page.icon", "Ícone")}</Label>
            <div className="flex items-center gap-2">
              <Input rounded="xl" value={createIcon} onChange={(e) => setCreateIcon(e.target.value)} placeholder="C:\\icon.gif" />
              <Button rounded="xl" variant="outline-primary" onClick={() => void pickIconPath(setCreateIcon)}>{t("common.choose", "Escolher")}</Button>
              <Button rounded="xl" variant="secondary" onClick={() => setCreateIcon("")}>{t("common.remove", "Remover")}</Button>
            </div>
            <div className="h-50 w-full rounded-xl border border-border/70 overflow-hidden bg-card/50">
              {createIconPreview ? (
                <img src={createIconPreview} alt={t("webdeck.page.preview", "Preview")} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                  {t("webdeck.page.no_icon", "Sem icone")}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button rounded="xl" variant="ghost-destructive" onClick={() => setCreatePageOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
            <Button rounded="xl" onClick={() => void createPage()}>{t("common.save", "Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openAccessModal} onOpenChange={setOpenAccessModal}>
        <DialogContent className="sm:max-w-[560px] select-none rounded-xl more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
          <DialogHeader><DialogTitle>{t("webdeck", "WebDeck")}</DialogTitle></DialogHeader>
          <Tabs value={accessTab} onValueChange={(value) => setAccessTab(value as any)}>
            <TabsList className="w-full flex flex-wrap gap-2 h-auto">
              <TabsTrigger value="local" asChild unstyled>
                <Button variant={accessTab == "local" ? "primary" : "secondary"} className="min-w-[140px] flex-1">
                  {t("webdeck.express.local", "Local")}
                </Button>
              </TabsTrigger>
              <TabsTrigger
                value="remote" asChild unstyled
                disabled={!Boolean(user?.id && user?.sessionId && remoteSocketConnected)}
              >
                  <Button variant={accessTab == "remote" ? "primary" : "secondary"} className="min-w-[140px] flex-1 relative">
                    {t("webdeck.express.remote", "Remoto")}
                    {hasPendingSessions ? (
                      <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                    ) : null}
                  </Button>
                </TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="grid gap-3">
              <Label><QrCode className="h-4 w-4" />{t("webdeck.express.qr", "QR Code")}</Label>
              <div className="h-64 w-full rounded-xl border border-border/70 overflow-hidden bg-card/50 flex items-center justify-center">
                {accessInfoLoading ? (
                  <span className="text-xs text-muted-foreground">{t("common.loading", "Carregando...")}</span>
                ) : accessInfo?.qrCodeDataUrl ? (
                  <img src={accessInfo.qrCodeDataUrl} alt="webdeck-access-qr" className="h-full w-full object-contain p-2" />
                ) : (
                  <span className="text-xs text-muted-foreground">{t("webdeck.express.qr.empty", "Sem QR Code")}</span>
                )}
              </div>

              <Label>{t("webdeck.express.local", "IP Local")}</Label>
              <Input rounded="xl" value={accessInfo?.localIpUrl ?? ""} readOnly />
            </TabsContent>

            <TabsContent value="remote" className="grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label>{t("webdeck.remote.manager.title", "Gerenciador remoto")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {remoteDeviceName ? `${t("webdeck.remote.device", "Dispositivo")}: ${remoteDeviceName}` : t("webdeck.remote.device.none", "Nenhum dispositivo encontrado.")}
                    </p>
                  </div>
                  <Button rounded="xl" variant="secondary" onClick={() => void refreshRemoteManager()} disabled={remoteManagerLoading}>
                    <RefreshCw className={cn("h-4 w-4", remoteManagerLoading ? "animate-spin" : "")} />
                  </Button>
                </div>
              </div>

              <Tabs value={remoteManagerTab} onValueChange={(value) => setRemoteManagerTab(value as any)}>
                <TabsList className="w-full flex flex-wrap gap-2 h-auto">
                  <TabsTrigger value="invites" asChild unstyled>
                    <Button variant={remoteManagerTab === "invites" ? "primary" : "secondary"} className="min-w-[140px] flex-1">
                      {t("webdeck.remote.invites.title", "Convites")}
                    </Button>
                  </TabsTrigger>
                  <TabsTrigger value="connections" asChild unstyled>
                    <Button variant={remoteManagerTab === "connections" ? "primary" : "secondary"} className="min-w-[140px] flex-1">
                      {t("webdeck.remote.connections.title", "Conectados")}
                    </Button>
                  </TabsTrigger>
                  <TabsTrigger value="sessions" asChild unstyled>
                    <Button variant={remoteManagerTab === "sessions" ? "primary" : "secondary"} className="min-w-[140px] flex-1 relative">
                      {t("webdeck.remote.sessions.title", "Sessões")}
                      {hasPendingSessions ? (
                        <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                      ) : null}
                    </Button>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invites" className="grid gap-3">
                  <p className="text-xs text-muted-foreground">
                    {t("webdeck.remote.invites.help", "Crie um convite e escolha quanto tempo a sessão ficará válida.")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={inviteDuration} onValueChange={(value) => setInviteDuration(value)}>
                      <SelectTrigger rounded="xl" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent rounded="xl" className="more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                        {inviteDurations.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button rounded="xl" onClick={() => void createInvite()} disabled={!remoteDeviceId}>
                      <Plus className="h-4 w-4" />
                      {t("webdeck.remote.invites.create", "Criar")}
                    </Button>
                  </div>

                  {remoteInvites.length === 0 ? (
                    <Card className="p-3 text-xs text-muted-foreground">
                      {t("webdeck.remote.invites.empty", "Nenhum convite ativo.")}
                    </Card>
                  ) : (
                    remoteInvites.map((invite) => {
                      const base = String(ApiSettings.url || "").trim();
                      const inviteUrl = base && base !== "/"
                        ? new URL(`/webdeck?token=${encodeURIComponent(invite.token)}`, base).toString()
                        : "";
                      return (
                        <Card key={invite.id} className="p-3 grid gap-2">
                          <div className="flex items-start w-full flex-col gap-2">
                            <div className="w-full">
                              <div className="text-xs text-muted-foreground">
                                {t("webdeck.remote.invites.expires", "Expira")}:
                                <span className="ml-1 text-foreground">
                                  {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : t("webdeck.remote.sessions.no_expiry", "Sem expiração")}
                                </span>
                              </div>
                              <Input className="w-full" rounded="xl" value={inviteUrl} readOnly />
                            </div>
                            <div className="w-full flex flex-wrap items-center justify-center gap-2">
                              <Button
                                rounded="xl"
                                variant="secondary"
                                onClick={async () => {
                                  if (!inviteUrl) return;
                                  try {
                                    await navigator.clipboard.writeText(inviteUrl);
                                    toast.success(t("webdeck.remote.invites.copied", "Link copiado."));
                                  } catch {
                                    toast.error(t("webdeck.remote.invites.copy_fail", "Falha ao copiar link."));
                                  }
                                }}
                              >
                                <Copy className="h-4 w-4" />
                                {t("webdeck.remote.invites.copy", "Copiar")}
                              </Button>
                              <Button rounded="xl" variant="secondary" onClick={() => void openInviteQr(inviteUrl)}>
                                <QrCode className="h-4 w-4" /> {t("webdeck.remote.invites.qr", "QR Code")}
                              </Button>
                              <Button rounded="xl" variant="outline-destructive" onClick={() => void revokeInvite(invite.id)}>
                                <X className="h-4 w-4" />
                                {t("webdeck.remote.invites.revoke", "Revogar")}
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="connections" className="grid gap-3">
                  {remoteConnections.length === 0 ? (
                    <Card className="p-3 text-xs text-muted-foreground">
                      {t("webdeck.remote.connections.empty", "Nenhum usuário conectado.")}
                    </Card>
                  ) : (
                    remoteConnections.map((connection) => {
                      const session = sessionByUserId.get(connection.userId) || null;
                      return (
                        <Card key={connection.userId} className="p-3 flex items-center justify-between gap-2">
                          <div className="flex items-start justify-between w-full gap-2">
                            <div className="min-w-0">
                              {connection.user ? (
                                <DropdownUp>
                                  <DropdownUpTrigger asChild>
                                    <div className="flex items-center gap-2 cursor-pointer">
                                      <img
                                        src={connection.user.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                                        alt={connection.user.displayName || connection.user.username}
                                        className="h-8 w-8 rounded-full border border-border/70"
                                      />
                                      <div>
                                        <div className="text-sm font-semibold">{connection.user.displayName || connection.user.username}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {t("webdeck.remote.connections.time", "Conectado há")}: {formatDuration((Date.now() + connectionsTick) - new Date(connection.connectedAt).getTime())}
                                        </div>
                                      </div>
                                    </div>
                                  </DropdownUpTrigger>
                                  <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                    <ProfilePreviewCard user={connection.user} noteEditable={false} size="dropdown" onMoreUserInfoClick={() => { }} />
                                  </DropdownUpContent>
                                </DropdownUp>
                              ) : (
                                <div className="text-sm">{t("webdeck.remote.connections.unknown", "Usuário")}</div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Button rounded="xl" variant="secondary" onClick={() => void disconnectUser(connection.userId)}>
                                <UserX className="h-4 w-4" />
                                {t("webdeck.remote.connections.disconnect", "Desconectar")}
                              </Button>
                              {session ? (
                                <Button rounded="xl" variant="outline-destructive" onClick={() => void revokeSession(session.id)}>
                                  <X className="h-4 w-4" />
                                  {t("webdeck.remote.connections.remove_permission", "Remover permissão")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="sessions" className="grid gap-3">
                  {remoteSessions.length === 0 ? (
                    <Card className="p-3 text-xs text-muted-foreground">
                      {t("webdeck.remote.sessions.empty", "Nenhuma sessão ativa.")}
                    </Card>
                  ) : (
                    remoteSessions.map((session) => (
                      <Card key={session.id} className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-start justify-between w-full gap-2">
                          <div className="min-w-0">
                            {session.user ? (
                              <DropdownUp>
                                <DropdownUpTrigger asChild>
                                  <div className="flex items-center gap-2 cursor-pointer">
                                    <img
                                      src={session.user.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                                      alt={session.user.displayName || session.user.username}
                                      className="h-8 w-8 rounded-full border border-border/70"
                                    />
                                    <div>
                                      <div className="text-sm font-semibold">{session.user.displayName || session.user.username}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {t("webdeck.remote.sessions.expires_in", "Expira em")}: {formatRemaining(session.expiresAt)}
                                      </div>
                                    </div>
                                  </div>
                                </DropdownUpTrigger>
                                <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                  <ProfilePreviewCard user={session.user} noteEditable={false} size="dropdown" onMoreUserInfoClick={() => { }} />
                                </DropdownUpContent>
                              </DropdownUp>
                            ) : (
                              <div className="text-sm">{t("webdeck.remote.sessions.unknown", "Usuário")}</div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {session.status === "pending" ? (
                              <>
                                <Button rounded="xl" onClick={() => void approveSession(session.id)}>
                                  <Check className="h-4 w-4" />
                                  {t("webdeck.remote.sessions.approve", "Aceitar")}
                                </Button>
                                <Button rounded="xl" variant="secondary" onClick={() => void denySession(session.id)}>
                                  <X className="h-4 w-4" />
                                  {t("webdeck.remote.sessions.deny", "Recusar")}
                                </Button>
                              </>
                            ) : (
                              <Button rounded="xl" variant="outline-destructive" onClick={() => void revokeSession(session.id)}>
                                <X className="h-4 w-4" />
                                {t("webdeck.remote.sessions.revoke", "Remover")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            {accessTab !== "remote" ? (
              <Button
                rounded="xl"
                variant="outline-primary"
                disabled={accessInfoLoading || !(accessInfo?.localIpUrl || accessInfo?.localhostUrl)}
                onClick={() => void openAccessUrlInBrowser()}
              >
                {t("webdeck.express.open_browser", "Abrir no navegador")}
              </Button>
            ) : null}
            <Button rounded="xl" onClick={() => setOpenAccessModal(false)}>{t("common.close", "Fechar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteQrOpen} onOpenChange={setInviteQrOpen}>
        <DialogContent className="max-w-md select-none rounded-xl more-dark border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
          <DialogHeader><DialogTitle>{t("webdeck.remote.invites.qr", "QR Code")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="h-64 w-full rounded-xl border border-border/70 overflow-hidden bg-card/50 flex items-center justify-center">
              {inviteQrDataUrl ? (
                <img src={inviteQrDataUrl} alt="webdeck-invite-qr" className="h-full w-full object-contain p-2" />
              ) : (
                <span className="text-xs text-muted-foreground">{t("webdeck.express.qr.empty", "Sem QR Code")}</span>
              )}
            </div>
            <Input rounded="xl" value={inviteQrUrl} readOnly />
          </div>
          <DialogFooter>
            <Button rounded="xl" onClick={() => setInviteQrOpen(false)}>{t("common.close", "Fechar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
