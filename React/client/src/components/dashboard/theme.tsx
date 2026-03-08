import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { Card } from "@/components/ui/card";
import { Loader2, Layers, Sun, Moon, ImagePlus, Circle, RefreshCw, Search, Download, Check, Play, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BackgroundProps } from "@/components/ui/background";
import { Theme, useTheme } from "@/contexts/ThemeContext";
import { StoreItem } from "@/types/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SavedThemeWallpaper, ThemeDownloadProgress } from "@/types/electron";
import { ModalConfirm } from "@/components/ModalConfirm";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useObserver } from "@/contexts/ObserverContext";

function getBackgroundSource(background: BackgroundProps | null) {
  if (!background) return "";
  if (background.variant === "image") return background.imageSrc;
  if (background.variant === "video") return background.videoSrc;
  return "";
}


function detectBackgroundVariant(url: string, mediaType?: string | null): BackgroundProps {
  const lowerType = (mediaType ?? "").toLowerCase();
  const lowerUrl = url.toLowerCase().split("?")[0];
  const isVideo =
    lowerType.startsWith("video/") ||
    [".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"].some((ext) => lowerUrl.endsWith(ext));

  if (isVideo) {
    return { variant: "video", videoSrc: url };
  }
  return { variant: "image", imageSrc: url };
}

function inferMediaTypeFromPath(filePath: string) {
  const lower = filePath.toLowerCase();
  if ([".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"].some((ext) => lower.endsWith(ext))) {
    return "video/mp4";
  }
  return "image/png";
}

function toStoreKey(item: StoreItem) {
  return `${item.id}:${item.meta_data?.url ?? ""}`;
}

function isStoreMediaUrl(url: string) {
  return url.startsWith("underdeck-media://backgrounds-store/");
}

function isLocalMediaUrl(url: string) {
  return url.startsWith("underdeck-media://backgrounds-local/");
}

function getFileNameFromPath(value: string) {
  if (!value) return "";
  const normalized = value.split("?")[0].replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "";
}

export default function ThemePage({
  className = "backdrop-blur supports-[backdrop-filter]:bg-background",
}: {
  className?: string;
}) {
  const { t } = useI18n();
  const { theme, setTheme, background, setBackground, listStoreBackgrounds } = useTheme();
  const { publish, subscribe } = useObserver();

  const [storeBackgrounds, setStoreBackgrounds] = useState<StoreItem[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedStoreKey, setSelectedStoreKey] = useState<string | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [savedStoreByKey, setSavedStoreByKey] = useState<Record<string, SavedThemeWallpaper>>({});
  const [localWallpaper, setLocalWallpaper] = useState<SavedThemeWallpaper | null>(null);

  const [downloadsByJobId, setDownloadsByJobId] = useState<Record<string, ThemeDownloadProgress>>({});
  const [jobToStoreKey, setJobToStoreKey] = useState<Record<string, string>>({});
  const [pendingUseJobIds, setPendingUseJobIds] = useState<Record<string, boolean>>({});
  const [useChoiceItem, setUseChoiceItem] = useState<StoreItem | null>(null);
  const [uninstallTargetKey, setUninstallTargetKey] = useState<string | null>(null);
  const [confirmUninstallLocal, setConfirmUninstallLocal] = useState(false);

  const storeByKey = useMemo(() => {
    const map: Record<string, StoreItem> = {};
    for (const item of storeBackgrounds) {
      map[toStoreKey(item)] = item;
    }
    return map;
  }, [storeBackgrounds]);

  const filteredStoreBackgrounds = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return storeBackgrounds;
    return storeBackgrounds.filter((item) => {
      const name = item.name?.toLowerCase() ?? "";
      const description = item.description?.toLowerCase() ?? "";
      return name.includes(q) || description.includes(q);
    });
  }, [searchValue, storeBackgrounds]);

  const availableStoreBackgrounds = useMemo(() => {
    return filteredStoreBackgrounds.filter((item) => {
      const key = toStoreKey(item);
      return !savedStoreByKey[key]?.exists;
    });
  }, [filteredStoreBackgrounds, savedStoreByKey]);

  const downloadedStoreWallpapers = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return Object.values(savedStoreByKey)
      .filter((item) => item.exists)
      .filter((saved) => {
        if (!q) return true;
        const storeItem = storeByKey[saved.key];
        const name = (storeItem?.name || saved.name || "").toLowerCase();
        const description = (storeItem?.description || "").toLowerCase();
        return name.includes(q) || description.includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [savedStoreByKey, searchValue, storeByKey]);

  const activeBackgroundSource = useMemo(() => getBackgroundSource(background), [background]);

  const activeLocalFileName = useMemo(() => {
    if (localWallpaper?.exists) {
      return getFileNameFromPath(localWallpaper.remoteUrl || localWallpaper.mediaUrl);
    }
    if (isLocalMediaUrl(activeBackgroundSource)) {
      return getFileNameFromPath(activeBackgroundSource);
    }
    return "";
  }, [activeBackgroundSource, localWallpaper]);

  const refreshSavedStoreWallpapers = async () => {
    const saved = await window.underdeck.theme.listSavedStoreWallpapers();
    const asMap: Record<string, SavedThemeWallpaper> = {};
    for (const item of saved) {
      asMap[item.key] = item;
    }
    setSavedStoreByKey(asMap);
  };

  const refreshLocalWallpaper = async () => {
    const item = await window.underdeck.theme.getLocalWallpaper();
    if (!item?.exists) {
      setLocalWallpaper(null);
      return;
    }
    setLocalWallpaper(item);
  };

  const loadStoreBackgrounds = async () => {
    setLoadingStore(true);
    try {
      const items = await listStoreBackgrounds();
      setStoreBackgrounds(items);
      await refreshSavedStoreWallpapers();
      await refreshLocalWallpaper();
      if (items.length === 0) {
        toast.info(t("theme.background.store_empty", "Nenhum background disponivel na loja."));
      }
    } catch {
      toast.error(t("theme.background.store_error", "Falha ao carregar backgrounds da loja."));
    } finally {
      setLoadingStore(false);
    }
  };

  const startStoreDownload = async (item: StoreItem, autoUseOnFinish = false) => {
    const remoteUrl = item.meta_data?.url;
    if (!remoteUrl) {
      toast.error(t("theme.background.invalid_url", "Wallpaper sem URL valida."));
      return null;
    }

    const mediaType = item.meta_data?.mediaType || item.meta_data?.mimeType || item.meta_data?.type || null;
    const { jobId } = await window.underdeck.theme.downloadStoreWallpaper({
      itemId: item.id,
      name: item.name,
      remoteUrl,
      mediaType,
    });
    setJobToStoreKey((prev) => ({ ...prev, [jobId]: toStoreKey(item) }));
    if (autoUseOnFinish) {
      setPendingUseJobIds((prev) => ({ ...prev, [jobId]: true }));
    }
    return jobId;
  };

  const handleUseStoreItem = async (item: StoreItem) => {
    const key = toStoreKey(item);
    const saved = savedStoreByKey[key];

    if (saved?.exists) {
      setSelectedStoreKey(key);
      const next = detectBackgroundVariant(saved.mediaUrl, saved.mediaType);
      setBackground(next);
      toast.success(t("theme.background.applied", "Wallpaper aplicado."));
      return;
    }
    setUseChoiceItem(item);
  };

  const handleSelectLocalBackground = async () => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("theme.background.pick", "Selecionar background"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [
        {
          name: t("common.media", "Midia"),
          extensions: ["mp4", "webm", "mkv", "mov", "avi", "png", "jpg", "jpeg", "webp", "gif", "bmp"],
        },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    const mediaType = inferMediaTypeFromPath(selectedPath);
    const savedLocal = await window.underdeck.theme.saveLocalBackground(selectedPath, mediaType);
    if (!savedLocal) {
      toast.error(t("theme.background.save_error", "Falha ao salvar wallpaper local."));
      return;
    }
    await refreshLocalWallpaper();
    const nextBackground = detectBackgroundVariant(savedLocal.mediaUrl, savedLocal.mediaType);
    setBackground(nextBackground);
    publish({ id: "theme.local.saved", channel: "theme-assets", data: { mediaUrl: savedLocal.mediaUrl } });
    toast.success(t("theme.background.saved", "Background salvo com sucesso."));
  };

  const uninstallStoreWallpaper = async (key: string) => {
    const removed = await window.underdeck.theme.uninstallStoreWallpaper(key);
    if (!removed) {
      toast.error(t("theme.background.uninstall_error", "Falha ao desinstalar wallpaper."));
      return;
    }

    await refreshSavedStoreWallpapers();
    const removedWallpaper = savedStoreByKey[key];
    if (removedWallpaper?.mediaUrl && activeBackgroundSource === removedWallpaper.mediaUrl) {
      setBackground({ variant: "neural" });
      publish({ id: "theme.store.uninstalled", channel: "theme-assets", data: { key } });
      toast.success(t("theme.background.neural_applied", "Background neural aplicado."));
      return;
    }
    publish({ id: "theme.store.uninstalled", channel: "theme-assets", data: { key } });
    toast.success(t("theme.background.uninstall_success", "Wallpaper desinstalado."));
  };

  const useLocalWallpaper = () => {
    if (!localWallpaper?.exists) return;
    const nextBackground = detectBackgroundVariant(localWallpaper.mediaUrl, localWallpaper.mediaType);
    setBackground(nextBackground);
    toast.success(t("theme.background.applied", "Wallpaper aplicado."));
  };

  const uninstallLocalWallpaper = async () => {
    const removed = await window.underdeck.theme.uninstallLocalWallpaper();
    if (!removed) {
      toast.error(t("theme.background.uninstall_error", "Falha ao desinstalar wallpaper."));
      return;
    }

    await refreshLocalWallpaper();
    if (isLocalMediaUrl(activeBackgroundSource)) {
      setBackground({ variant: "neural" });
      publish({ id: "theme.local.uninstalled", channel: "theme-assets" });
      toast.success(t("theme.background.neural_applied", "Background neural aplicado."));
      return;
    }
    publish({ id: "theme.local.uninstalled", channel: "theme-assets" });
    toast.success(t("theme.background.uninstall_success", "Wallpaper desinstalado."));
  };

  const handleUseDownloadedWallpaper = (saved: SavedThemeWallpaper) => {
    const nextBackground = detectBackgroundVariant(saved.mediaUrl, saved.mediaType);
    setSelectedStoreKey(saved.key);
    setBackground(nextBackground);
    toast.success(t("theme.background.applied", "Wallpaper aplicado."));
  };

  useEffect(() => {
    void loadStoreBackgrounds();
  }, []);

  useEffect(() => {
    void refreshSavedStoreWallpapers();
    void refreshLocalWallpaper();
  }, []);

  useEffect(() => {
    const unsubscribe = window.underdeck.theme.onDownloadProgress((payload) => {
      setDownloadsByJobId((prev) => ({ ...prev, [payload.jobId]: payload }));

      if (payload.status === "completed") {
        void refreshSavedStoreWallpapers();
        publish({ id: "theme.store.downloaded", channel: "theme-assets", data: { jobId: payload.jobId } });
      }
      if (payload.status === "failed") {
        toast.error(payload.error || t("theme.background.download_failed", "Falha ao baixar wallpaper."));
      }

      if (payload.status === "completed" && payload.mediaUrl && pendingUseJobIds[payload.jobId]) {
        const storeKey = jobToStoreKey[payload.jobId];
        const item = storeKey ? storeByKey[storeKey] : null;
        const mediaType = item?.meta_data?.mediaType || item?.meta_data?.mimeType || item?.meta_data?.type || null;
        setSelectedStoreKey(storeKey ?? null);
        const next = detectBackgroundVariant(payload.mediaUrl, mediaType);
        setBackground(next);
        toast.success(t("theme.background.applied", "Wallpaper aplicado."));
        setPendingUseJobIds((prev) => {
          const next = { ...prev };
          delete next[payload.jobId];
          return next;
        });
      }
    });
    return unsubscribe;
  }, [jobToStoreKey, pendingUseJobIds, storeByKey, t]);

  useEffect(() => {
    const unsubscribe = subscribe("theme-assets", async () => {
      await Promise.all([refreshSavedStoreWallpapers(), refreshLocalWallpaper()]);
    });
    return () => {
      unsubscribe();
    };
  }, [subscribe]);

  const activeDownloads = useMemo(() => {
    return Object.values(downloadsByJobId).filter((item) => item.status === "queued" || item.status === "downloading");
  }, [downloadsByJobId]);

  const localIsActive = isLocalMediaUrl(activeBackgroundSource);

  const localWallpaperCard = (
    <Card className="p-3 border-border/70 bg-card/70 more-dark">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{t("theme.background.local_card_title", "Arquivo local")}</p>
          <p className="text-xs text-muted-foreground truncate">
            {activeLocalFileName || t("theme.background.local_card_empty", "Nenhum arquivo local ativo")}
          </p>
        </div>
        {localIsActive && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          type="button"
          variant="outline-primary"
          rounded="xl"
          className="w-full min-w-0"
          onClick={handleSelectLocalBackground}
        >
          <ImagePlus className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("common.choose", "Selecionar")}</span>
        </Button>
        <Button
          type="button"
          variant="outline-primary"
          rounded="xl"
          className="w-full min-w-0"
          onClick={useLocalWallpaper}
          disabled={!localWallpaper?.exists || localIsActive}
        >
          <Play className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("common.use", "Usar")}</span>
        </Button>
        <Button
          type="button"
          variant="outline-destructive"
          rounded="xl"
          className="w-full min-w-0"
          onClick={() => setConfirmUninstallLocal(true)}
          disabled={!localWallpaper?.exists}
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("common.uninstall", "Desinstalar")}</span>
        </Button>
      </div>
    </Card>
  );

  useEffect(() => {
    if (!background) return;

    const currentSource = getBackgroundSource(background);
    if (!isStoreMediaUrl(currentSource)) return;

    const currentSaved = Object.values(savedStoreByKey).find(
      (saved) => saved.exists && saved.mediaUrl === currentSource
    );
    if (currentSaved) {
      setSelectedStoreKey(currentSaved.key);
    }
  }, [background, savedStoreByKey]);

  return (
    <div className="w-full h-full p-2 select-none">
      <Card className={cn("p-6 grid gap-4 bg-card/70", className)}>
        <div className="flex flex-col gap-2">
          <Label className="text-lg">{t("theme.label", "Tema")}</Label>
          <Select
            value={theme}
            onValueChange={(value: Theme) => {
              setTheme(value);
            }}
          >
            <SelectTrigger
              rounded="xl"
              className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
            >
              <SelectValue placeholder={t("settings.language.noLocales", "Nenhum idioma disponivel.")} />
            </SelectTrigger>
            <SelectContent
              rounded="lg"
              className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white"
            >
              <SelectItem rounded="lg" value="transparent">
                <div className="flex items-center justify-between">
                  <Layers size={20} className="mr-2" /> {t("theme.transparent", "Transparente")}
                </div>
              </SelectItem>
              <SelectItem rounded="lg" value="ligth">
                <div className="flex items-center justify-between">
                  <Sun size={20} className="mr-2" /> {t("theme.light", "Claro")}
                </div>
              </SelectItem>
              <SelectItem rounded="lg" value="dark">
                <div className="flex items-center justify-between">
                  <Moon size={20} className="mr-2" /> {t("theme.dark", "Escuro")}
                </div>
              </SelectItem>
              <SelectItem rounded="lg" value="black">
                <div className="flex items-center justify-between">
                  <Circle size={20} className="mr-2 fill-current" /> {t("theme.black", "Full Black")}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              rounded="xl"
              className="pl-9 border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("theme.background.search", "Buscar wallpaper...")}
            />
          </div>
          <Button
            type="button"
            variant="outline-primary"
            rounded="xl"
            onClick={loadStoreBackgrounds}
            disabled={loadingStore}
          >
            {loadingStore ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.refresh", "Atualizar")}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {localWallpaperCard}
          <Card className="p-3 border-border/70 bg-card/70 more-dark">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{t("theme.background.source_neural", "Neural")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("theme.background.neural_desc", "Usa o plano neural padrao.")}
                </p>
              </div>
              {background?.variant === "neural" && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
            </div>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                className="w-full"
                onClick={() => {
                  setBackground({ variant: "neural" });
                  toast.success(t("theme.background.neural_applied", "Background neural aplicado."));
                }}
                disabled={background?.variant === "neural"}
              >
                <Play className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("common.use", "Usar")}</span>
              </Button>
            </div>
          </Card>
        </div>

        {activeDownloads.length > 0 && (
          <div className="grid gap-2">
            <Label>{t("theme.background.downloading", "Baixando")}</Label>
            {activeDownloads.map((download) => (
              <Card key={download.jobId} className="p-3 bg-card/60 border-border/70">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{download.name}</span>
                  <span>{download.progress}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/20">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${download.progress}%` }} />
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-3">
          <Label>{t("theme.background.downloaded_label", "Wallpapers baixados")}</Label>
          <div className="max-h-[30vh] overflow-y-auto overflow-x-hidden pr-1">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {downloadedStoreWallpapers.map((saved) => {
                const savedItem = storeByKey[saved.key];
                const isSelected = activeBackgroundSource === saved.mediaUrl;
                return (
                  <Card key={saved.key} className="p-3 border-border/70 bg-card/70 more-dark">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{savedItem?.name || saved.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {savedItem?.description || t("theme.background.downloaded_local_desc", "Wallpaper baixado da loja")}
                        </p>
                      </div>
                      {isSelected && (<Check className="h-4 w-4 text-emerald-400 shrink-0" />)}
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline-primary"
                        rounded="xl"
                        className="w-full min-w-0"
                        onClick={() => handleUseDownloadedWallpaper(saved)}
                        disabled={isSelected}
                      >
                        <Play className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t("common.use", "Usar")}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline-destructive"
                        rounded="xl"
                        className="w-full min-w-0"
                        onClick={() => setUninstallTargetKey(saved.key)}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t("common.uninstall", "Desinstalar")}</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
              {downloadedStoreWallpapers.length === 0 && (
                <Card className="p-3 border-border/70 bg-card/60 md:col-span-2 xl:col-span-3">
                  <p className="text-sm text-muted-foreground">
                    {t("theme.background.no_downloaded", "Nenhum wallpaper baixado encontrado.")}
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <Label>{t("theme.background.available_label", "Disponiveis para baixar")}</Label>
          <div className="max-h-[58vh] overflow-y-auto overflow-x-hidden pr-1">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
	              {availableStoreBackgrounds.map((item) => {
	                  const key = toStoreKey(item);
	                  const saved = savedStoreByKey[key];
	                  const isSelected = selectedStoreKey === key;
	                  const remoteUrl = item.meta_data?.url ?? "";
	                  const isRemoteSelected = !!remoteUrl && activeBackgroundSource === remoteUrl;
	                  const runningJob = Object.entries(jobToStoreKey).find(([jobId, storeKey]) => {
                    if (storeKey !== key) return false;
                    const progress = downloadsByJobId[jobId];
                    return progress?.status === "queued" || progress?.status === "downloading";
                  });
                  const progress = runningJob ? downloadsByJobId[runningJob[0]] : null;

                  return (
                    <Card
                      key={`${item.id}-${item.name}-${item.meta_data?.url ?? ""}`}
                      className={cn(
                        "p-3 border-border/70 bg-card/70 more-dark"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                        </div>
                        {isSelected && (<Check className="h-4 w-4 text-emerald-400 shrink-0" />)}
                      </div>

                      {progress && (
                        <div className="mt-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.progress}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{progress.progress}%</p>
                        </div>
                      )}

                      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {!saved?.exists && (
                          <Button
                            type="button"
                            variant="outline-primary"
                            rounded="xl"
                            className="w-full min-w-0"
                            disabled={!!progress}
                            onClick={async () => {
                              await startStoreDownload(item, false);
                            }}
                          >
                            <Download className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t("common.download", "Baixar")}</span>
                          </Button>
                        )}
	                        <Button
	                          type="button"
	                          variant="outline-primary"
	                          rounded="xl"
	                          className="w-full min-w-0"
	                          disabled={!!progress || isRemoteSelected}
	                          onClick={async () => {
	                            await handleUseStoreItem(item);
	                          }}
                        >
                          <Play className="h-4 w-4 shrink-0" />
                          <span className="truncate">{t("common.use", "Usar")}</span>
                        </Button>
                        {saved?.exists && (
                          <Button
                            type="button"
                            variant="outline-destructive"
                            rounded="xl"
                            className="w-full min-w-0"
                            onClick={() => setUninstallTargetKey(key)}
                          >
                            <Trash2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t("common.uninstall", "Desinstalar")}</span>
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              {availableStoreBackgrounds.length === 0 && (
                <Card className="p-3 border-border/70 bg-card/60 md:col-span-2 xl:col-span-3">
                  <p className="text-sm text-muted-foreground">
                    {t("theme.background.no_available", "Não possui nenhum wallpaper disponivel para baixar.")}
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>

        <Dialog open={!!useChoiceItem} onOpenChange={(open) => !open && setUseChoiceItem(null)}>
          <DialogContent className="sm:max-w-[480px] select-none rounded-xl app-create-modal-content">
            <DialogHeader>
              <DialogTitle>{t("theme.background.use_mode_title", "Como deseja usar este wallpaper?")}</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">
              {useChoiceItem?.name}
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline-destructive"
                rounded="xl"
                onClick={() => setUseChoiceItem(null)}
              >
                {t("common.cancel", "Cancelar")}
              </Button>
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                disabled={!!(useChoiceItem?.meta_data?.url && activeBackgroundSource === useChoiceItem.meta_data.url)}
                onClick={() => {
                  if (!useChoiceItem) return;
                  const key = toStoreKey(useChoiceItem);
                  const remoteUrl = useChoiceItem.meta_data?.url;
                  if (!remoteUrl) return;
                  const mediaType =
                    useChoiceItem.meta_data?.mediaType ||
                    useChoiceItem.meta_data?.mimeType ||
                    useChoiceItem.meta_data?.type ||
                    null;
                  setSelectedStoreKey(key);
                  const next = detectBackgroundVariant(remoteUrl, mediaType);
                  setBackground(next);
                  toast.success(t("theme.background.applied", "Wallpaper aplicado."));
                  setUseChoiceItem(null);
                }}
              >
                {t("theme.background.use_remote", "Usar remoto")}
              </Button>
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                onClick={async () => {
                  if (!useChoiceItem) return;
                  const item = useChoiceItem;
                  setUseChoiceItem(null);
                  await startStoreDownload(item, true);
                }}
              >
                {t("theme.background.download_and_use", "Baixar e usar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ModalConfirm
          isOpen={!!uninstallTargetKey}
          title={t("theme.background.uninstall_title", "Desinstalar wallpaper")}
          content={t("theme.background.uninstall_content", "Deseja remover este wallpaper baixado?")}
          confirmText={t("common.uninstall", "Desinstalar")}
          cancelText={t("common.cancel", "Cancelar")}
          onResult={(confirmed) => {
            const key = uninstallTargetKey;
            setUninstallTargetKey(null);
            if (!confirmed || !key) return;
            void uninstallStoreWallpaper(key);
          }}
        />

        <ModalConfirm
          isOpen={confirmUninstallLocal}
          title={t("theme.background.uninstall_title", "Desinstalar wallpaper")}
          content={t("theme.background.uninstall_content", "Deseja remover este wallpaper baixado?")}
          confirmText={t("common.uninstall", "Desinstalar")}
          cancelText={t("common.cancel", "Cancelar")}
          onResult={(confirmed) => {
            setConfirmUninstallLocal(false);
            if (!confirmed) return;
            void uninstallLocalWallpaper();
          }}
        />
      </Card>
    </div>
  );
}
