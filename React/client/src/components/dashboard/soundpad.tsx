import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, FileSearch, Play, Pause, Square, RotateCcw, Image as ImageIcon, Plus, ArrowLeft, ArrowRight, Settings2, Layers2, ScanText } from "lucide-react";
import { toast } from "sonner";
import type { SoundPadAudio, SoundPadExecResult, SoundPadVerifyResult } from "@/types/electron";
import type { App } from "@/types/apps";
import { AddAppModal } from "@/components/apps/create/AddAppModal";
import { AddShortcutModal } from "@/components/shortcuts/create/AddShortcutModal";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { useObserver } from "@/contexts/ObserverContext";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CATEGORY_ICON_CANDIDATES = [
  "folder.png",
  "folder.jpg",
  "folder.jpeg",
  "folder.ico",
  "icon.png",
  "icon.jpg",
  "icon.jpeg",
  "icon.ico",
];

function isSoundPadExePath(filePath: string) {
  const normalized = (filePath ?? "").trim().replace(/\//g, "\\");
  const fileName = normalized.split("\\").pop() ?? "";
  return fileName.toLowerCase() === "soundpad.exe";
}

function normalizePath(value: string) {
  return (value ?? "").replace(/\//g, "\\").trim();
}

function getFolderPathFromAudioPath(audioPath: string) {
  const normalized = normalizePath(audioPath);
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("\\");
}

function getFolderName(folderPath: string) {
  if (!folderPath) return "Sem categoria";
  const parts = normalizePath(folderPath).split("\\").filter(Boolean);
  return parts[parts.length - 1] ?? "Sem categoria";
}

function formatListLabel(value: string, fallback: string) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

type CategoryItem = {
  id: string;
  label: string;
  folderPath: string;
  count: number;
};

export default function SoundPad({
  className = "backdrop-blur supports-[backdrop-filter]:bg-background",
}: {
  className?: string;
}) {
  const { t } = useI18n();
  const { publish, subscribe } = useObserver();
  const { apps, createApp } = useUnderDeck();
  const [pathValue, setPathValue] = useState("");
  const [audios, setAudios] = useState<SoundPadAudio[]>([]);
  const [loadingAudios, setLoadingAudios] = useState(false);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string | null>>({});
  const [executingMap, setExecutingMap] = useState<Record<string, boolean>>({});
  const [createAppAudio, setCreateAppAudio] = useState<SoundPadAudio | null>(null);
  const [createAppOpen, setCreateAppOpen] = useState(false);
  const [openDropdownAudioKey, setOpenDropdownAudioKey] = useState<string | null>(null);
  const [createShortcutOpen, setCreateShortcutOpen] = useState(false);
  const [shortcutInitialAppId, setShortcutInitialAppId] = useState("");
  const [dialogState, setDialogState] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const showDialog = (title: string, message: string) => {
    setDialogState({ open: true, title, message });
  };

  const runAndNotify = async (
    operationKey: string,
    callback: () => Promise<SoundPadExecResult | SoundPadVerifyResult>,
    successTitle: string,
    failTitle: string
  ) => {
    setExecutingMap((prev) => ({ ...prev, [operationKey]: true }));
    try {
      const result = await callback();
      showDialog(result.ok ? successTitle : failTitle, result.message);
    } finally {
      setExecutingMap((prev) => {
        const next = { ...prev };
        delete next[operationKey];
        return next;
      });
    }
  };

  const runAndToast = async (
    operationKey: string,
    callback: () => Promise<SoundPadExecResult | SoundPadVerifyResult>,
    successTitle: string,
    failTitle: string
  ) => {
    setExecutingMap((prev) => ({ ...prev, [operationKey]: true }));
    try {
      const result = await callback();
      if (result.ok) {
        toast.success(successTitle, { description: result.message });
        return;
      }
      toast.error(failTitle, { description: result.message });
    } finally {
      setExecutingMap((prev) => {
        const next = { ...prev };
        delete next[operationKey];
        return next;
      });
    }
  };

  const refreshAudios = async () => {
    setLoadingAudios(true);
    try {
      const list = await window.underdeck.soundpad.listAudios();
      setAudios(Array.isArray(list) ? list : []);
    } finally {
      setLoadingAudios(false);
    }
  };

  const savePathIfValid = async (value: string) => {
    const normalized = value.trim();
    if (!isSoundPadExePath(normalized)) return false;
    return window.underdeck.soundpad.setPath(normalized);
  };

  const selectSoundPadExe = async () => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("soundpad.pick", "Selecionar SoundPad"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [{ name: "Executavel", extensions: ["exe"] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;

    setPathValue(selectedPath);
    if (!isSoundPadExePath(selectedPath)) {
      showDialog(
        t("soundpad.invalid.title", "Arquivo invalido"),
        t("soundpad.invalid.message", "Somente o arquivo soundpad.exe e aceito.")
      );
      return;
    }

    const saved = await window.underdeck.soundpad.setPath(selectedPath);
    if (!saved) {
      showDialog(
        t("soundpad.save_error.title", "Falha ao salvar"),
        t("soundpad.save_error.message", "Nao foi possivel salvar o caminho do SoundPad.")
      );
      return;
    }

    showDialog(
      t("soundpad.saved.title", "Caminho salvo"),
      t("soundpad.saved.message", "Caminho do SoundPad salvo com sucesso.")
    );
    publish({ id: "soundpad.setPath", channel: "soundpad", data: { path: selectedPath } });
  };

  const verifySoundPad = async () => {
    const current = pathValue.trim();
    if (!isSoundPadExePath(current)) {
      showDialog(
        t("soundpad.invalid.title", "Arquivo invalido"),
        t("soundpad.invalid.message", "Somente o arquivo soundpad.exe e aceito.")
      );
      return;
    }

    const saved = await savePathIfValid(current);
    if (!saved) {
      showDialog(
        t("soundpad.save_error.title", "Falha ao salvar"),
        t("soundpad.save_error.message", "Nao foi possivel salvar o caminho do SoundPad.")
      );
      return;
    }
    publish({ id: "soundpad.setPath", channel: "soundpad", data: { path: current } });

    setChecking(true);
    try {
      const result = await window.underdeck.soundpad.verify();
      showDialog(
        result.ok
          ? t("soundpad.verify_ok.title", "SoundPad verificado")
          : t("soundpad.verify_fail.title", "Falha na verificacao"),
        result.message
      );
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const savedPath = await window.underdeck.soundpad.getPath();
      setPathValue(savedPath ?? "");
      await refreshAudios();
    })();

    const unsubscribe = window.underdeck.soundpad.onAudiosChanged((nextAudios) => {
      setAudios(Array.isArray(nextAudios) ? nextAudios : []);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe("soundpad", async () => {
      const savedPath = await window.underdeck.soundpad.getPath();
      setPathValue(savedPath ?? "");
      await refreshAudios();
    });
    return () => {
      unsubscribe();
    };
  }, [subscribe]);

  const categories = useMemo<CategoryItem[]>(() => {
    const map = new Map<string, CategoryItem>();
    for (const audio of audios) {
      const folderPath = getFolderPathFromAudioPath(audio.path);
      const id = folderPath || "uncategorized";
      const current = map.get(id);
      if (current) {
        current.count += 1;
      } else {
        map.set(id, {
          id,
          label: getFolderName(folderPath),
          folderPath,
          count: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base", numeric: true })
    );
  }, [audios]);

  useEffect(() => {
    if (selectedCategory === "all") return;
    if (!categories.some((item) => item.id === selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    let active = true;

    const loadIcons = async () => {
      const pending = categories.filter((item) =>
        item.folderPath &&
        !(item.id in categoryIcons)
      );
      if (pending.length === 0) return;

      const nextEntries: Array<[string, string | null]> = [];

      for (const category of pending) {
        let found: string | null = null;
        for (const fileName of CATEGORY_ICON_CANDIDATES) {
          const candidatePath = `${category.folderPath}\\${fileName}`;
          const dataUrl = await window.underdeck.dialog.readFileAsDataUrl(candidatePath);
          if (dataUrl) {
            found = dataUrl;
            break;
          }
        }
        nextEntries.push([category.id, found]);
      }

      if (!active) return;
      setCategoryIcons((prev) => {
        const next = { ...prev };
        for (const [id, value] of nextEntries) {
          next[id] = value;
        }
        return next;
      });
    };

    void loadIcons();

    return () => {
      active = false;
    };
  }, [categories, categoryIcons]);

  const categoryFilteredAudios = useMemo(() => {
    if (selectedCategory === "all") return audios;
    return audios.filter((audio) => {
      const folderPath = getFolderPathFromAudioPath(audio.path);
      const id = folderPath || "uncategorized";
      return id === selectedCategory;
    });
  }, [audios, selectedCategory]);

  const filteredAudios = useMemo(() => {
    const q = search.trim().toLowerCase();
    const baseList = !q
      ? categoryFilteredAudios
      : categoryFilteredAudios.filter((audio) => {
      const name = (audio.name ?? "").toLowerCase();
      const artist = (audio.artist ?? "").toLowerCase();
      const filePath = (audio.path ?? "").toLowerCase();
      return name.includes(q) || artist.includes(q) || filePath.includes(q) || String(audio.index).includes(q);
    });
    return [...baseList].sort((a, b) => {
      const aName = formatListLabel(a.name, `#${a.index}`);
      const bName = formatListLabel(b.name, `#${b.index}`);
      const byName = aName.localeCompare(bName, "pt-BR", { sensitivity: "base", numeric: true });
      if (byName !== 0) return byName;
      const aArtist = formatListLabel(a.artist, "");
      const bArtist = formatListLabel(b.artist, "");
      const byArtist = aArtist.localeCompare(bArtist, "pt-BR", { sensitivity: "base", numeric: true });
      if (byArtist !== 0) return byArtist;
      return a.index - b.index;
    });
  }, [categoryFilteredAudios, search]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategory, search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAudios.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageAudios = filteredAudios.slice(pageStart, pageStart + pageSize);

  const playAudioAsync = (audio: SoundPadAudio) => {
    void window.underdeck.soundpad.playSound(audio.index)
      .then((result) => {
        if (result.ok) {
          toast.success(
            t("soundpad.play.ok", "Audio executado"),
            { description: `${audio.name || `#${audio.index}`}` }
          );
          return;
        }
        toast.error(t("soundpad.play.fail", "Falha ao executar audio"), {
          description: result.message,
        });
      })
      .catch(() => {
        toast.error(t("soundpad.play.fail", "Falha ao executar audio"));
      });
  };

  const findExistingSoundpadApp = (audio: SoundPadAudio) => {
    return apps.find((item) => {
      if (item.type !== 3) return false;
      if (!("action" in item.meta_data)) return false;
      return item.meta_data.action === "play-sound" && item.meta_data.soundIndex === audio.index;
    }) ?? null;
  };

  const ensureSoundpadAppForAudio = async (audio: SoundPadAudio) => {
    const existing = findExistingSoundpadApp(audio);
    if (existing) return existing;

    const appName = audio.name?.trim() || `SoundPad #${audio.index}`;
    const newApp: App = {
      id: crypto.randomUUID(),
      type: 3,
      position: 0,
      name: appName,
      icon: null,
      banner: null,
      description: "",
      meta_data: {
        action: "play-sound",
        soundIndex: audio.index,
      },
    };

    const created = await createApp(newApp);
    if (!created) return null;
    return created;
  };

  return (
    <div className="w-full h-full p-2 select-none">
      <Card className={cn("p-6 grid gap-4 bg-card/70", className)}>
        <div className="grid gap-2">
          <Label htmlFor="soundpad-path">{t("soundpad.path", "Diretorio do SoundPad")}</Label>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              id="soundpad-path"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={pathValue}
              onChange={(event) => setPathValue(event.target.value)}
              onBlur={async () => {
                const current = pathValue.trim();
                if (!isSoundPadExePath(current)) return;
                await window.underdeck.soundpad.setPath(current);
                publish({ id: "soundpad.setPath", channel: "soundpad", data: { path: current } });
              }}
              placeholder="C:\\Program Files\\Soundpad\\soundpad.exe"
            />
            <Button type="button" rounded="xl" onClick={selectSoundPadExe}>
              <FileSearch className="h-4 w-4" />
              {t("common.choose", "Escolher")}
            </Button>
            <Button type="button" rounded="xl" onClick={verifySoundPad} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4"/>}
              {t("soundpad.verify", "Verificar")}
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Input
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("soundpad.search", "Buscar audio...")}
            />
            <Button type="button" rounded="xl" onClick={refreshAudios} disabled={loadingAudios}>
              {loadingAudios ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("common.refresh", "Atualizar")}
            </Button>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-2">
              <Button
                type="button"
                rounded="xl"
                variant={selectedCategory === "all" ? "primary" : "secondary"}
                onClick={() => setSelectedCategory("all")}
              >
                {t("common.all", "Todos")} ({audios.length})
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  type="button"
                  rounded="xl"
                  variant={selectedCategory === category.id ? "primary" : "secondary"}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {categoryIcons[category.id] ? (
                    <img
                      src={categoryIcons[category.id] ?? ""}
                      alt={category.label}
                      className="h-4 w-4 rounded object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  <span className="truncate max-w-[180px]">{category.label}</span>
                  <span className="text-xs opacity-80">({category.count})</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {t("soundpad.pagination.total", "Total")}: {filteredAudios.length}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              rounded="xl"
              disabled={!!executingMap.repeat}
              onClick={() =>
                runAndToast(
                  "repeat",
                  () => window.underdeck.soundpad.repeatCurrent(),
                  t("soundpad.exec_ok.title", "Comando executado"),
                  t("soundpad.exec_fail.title", "Falha ao executar")
                )
              }
            >
              <RotateCcw className="h-4 w-4" />
              {t("soundpad.repeat_current", "Tocar atual de novo")}
            </Button>
            <Button
              type="button"
              rounded="xl"
              disabled={!!executingMap.stop}
              onClick={() =>
                runAndToast(
                  "stop",
                  () => window.underdeck.soundpad.stopSound(),
                  t("soundpad.exec_ok.title", "Comando executado"),
                  t("soundpad.exec_fail.title", "Falha ao executar")
                )
              }
            >
              <Square className="h-4 w-4" />
              {t("soundpad.stop", "Parar")}
            </Button>
            <Button
              type="button"
              rounded="xl"
              disabled={!!executingMap.pause}
              onClick={() =>
                runAndToast(
                  "pause",
                  () => window.underdeck.soundpad.togglePause(),
                  t("soundpad.exec_ok.title", "Comando executado"),
                  t("soundpad.exec_fail.title", "Falha ao executar")
                )
              }
            >
              <Pause className="h-4 w-4" />
              {t("soundpad.toggle_pause", "Toggle pause")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">{t("soundpad.pagination.per_page", "Por pagina")}</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger
                rounded="xl"
                className="w-[88px] border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                rounded="lg"
                className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white"
              >
                <SelectItem rounded="xl" value="10">10</SelectItem>
                <SelectItem rounded="xl" value="20">20</SelectItem>
                <SelectItem rounded="xl" value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2 overflow-y-auto pr-1">
          {pageAudios.length === 0 ? (
            <Card className="p-4 border-border/70 bg-card/70 more-dark">
              <p className="text-sm text-muted-foreground">
                {t("soundpad.empty", "Nenhum audio encontrado no SoundPad.")}
              </p>
            </Card>
          ) : (
            pageAudios.map((audio) => {
              return (
                <Card key={`${audio.index}-${audio.hash || audio.path}`} className="p-3 border-border/70 bg-card/70 more-dark">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">#{audio.index} - {formatListLabel(audio.name, t("soundpad.unknown", "Sem nome"))}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatListLabel(audio.artist, t("soundpad.no_artist", "Sem artista"))}
                        {audio.duration ? ` | ${audio.duration}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownUp
                        open={openDropdownAudioKey === `${audio.index}-${audio.hash || audio.path}`}
                        onOpenChange={(open) => setOpenDropdownAudioKey(open ? `${audio.index}-${audio.hash || audio.path}` : null)}
                      >
                        <DropdownUpTrigger asChild>
                          <button
                            type="button"
                            className="group/gear inline-flex h-8 w-8 items-center justify-center rounded-full border-none bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
                          >
                            <Settings2 className="h-4 w-4 transition-transform duration-300 group-hover/gear:rotate-45" />
                          </button>
                        </DropdownUpTrigger>
                        <DropdownUpContent
                          mode="automatic"
                          direction="down"
                          align="end"
                          className=" gap-1 rounded-xl border-border/70 bg-popover/95 p-1 shadow-xl backdrop-blur-md transparent:bg-black/85 select-none"
                        >
                          <Button
                            type="button"
                            variant="ghost-secondary"
                            rounded="xl"
                            onClick={() => playAudioAsync(audio)}
                            className="w-full"
                          >
                            <Play className="h-4 w-4" />
                            {t("common.play", "Tocar")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost-secondary"
                            rounded="xl"
                            onClick={() => {
                              setOpenDropdownAudioKey(null);
                              setCreateAppAudio(audio);
                              setCreateAppOpen(true);
                            }}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4" />
                            {t("soundpad.menu.add_to_apps", "Adicionar aos Aplicativos")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost-secondary"
                            rounded="xl"
                            onClick={async () => {
                              setOpenDropdownAudioKey(null);
                              const app = await ensureSoundpadAppForAudio(audio);
                              if (!app) {
                                toast.error(t("shortcuts.create.failed", "Falha ao preparar atalho para o SoundPad."));
                                return;
                              }
                              setShortcutInitialAppId(app.id);
                              setCreateShortcutOpen(true);
                            }}
                            className="w-full"
                          >
                            <Layers2 className="h-4 w-4" />
                            {t("soundpad.menu.create_shortcut", "Criar Tecla de Atalho")}
                          </Button>
                        </DropdownUpContent>
                      </DropdownUp>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            rounded="xl"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
          >
            <ArrowLeft />{t("common.previous", "Anterior")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            rounded="xl"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages}
          >
            {t("common.next", "Proximo")} <ArrowRight />
          </Button>
        </div>
      </Card>

      <AddAppModal
        trigger={null}
        open={createAppOpen}
        onOpenChange={(open) => {
          setCreateAppOpen(open);
          if (!open) setCreateAppAudio(null);
        }}
        initialState={{
          type: 3,
          soundpadAction: "play-sound",
          soundpadAudioIndex: createAppAudio ? String(createAppAudio.index) : "",
          name: "",
        }}
      />

      <AddShortcutModal
        trigger={null}
        open={createShortcutOpen}
        onOpenChange={(open) => {
          setCreateShortcutOpen(open);
          if (!open) setShortcutInitialAppId("");
        }}
        initialAppId={shortcutInitialAppId}
      />

      <Dialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md rounded-xl more-dark">
          <DialogHeader>
            <DialogTitle>{dialogState.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{dialogState.message}</p>
          <DialogFooter>
            <Button
              type="button"
              rounded="xl"
              onClick={() => setDialogState((prev) => ({ ...prev, open: false }))}
            >
              {t("common.close", "Fechar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
