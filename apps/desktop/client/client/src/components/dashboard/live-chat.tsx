import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCheck,
  Clock3,
  CircleUserRound,
  Cog,
  Eye,
  EyeOff,
  Hash,
  Heart,
  ImageOff,
  ImagePlus,
  Loader2,
  Lock,
  MessageCircleMore,
  MonitorUp,
  Pause,
  Pin,
  PinOff,
  Play,
  PlugZap,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Unplug,
  Unlock,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useGlobalObserver } from "@/contexts/GlobalObserverContext";
import { LiveChatProvider, useLiveChat } from "@/contexts/LiveChatContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, InputPassword } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BackgroundComp } from "@/components/ui/background";
import { DiscordColorPicker } from "@/components/ui/DiscordColorPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type {
  LiveChatChannelAppearance,
  StoredThemeBackground,
  ThemeEffectBackgrounds,
} from "@/types/electron";

type LiveChatBackgroundVariant = StoredThemeBackground["variant"];
type ConfigurableEffect = Exclude<LiveChatBackgroundVariant, "image" | "video">;
type ConfigurableEffectBackground =
  | Extract<StoredThemeBackground, { variant: "neural" }>
  | Extract<StoredThemeBackground, { variant: "nebula" }>
  | Extract<StoredThemeBackground, { variant: "particles" }>
  | Extract<StoredThemeBackground, { variant: "color" }>;

const DEFAULT_LIVE_CHAT_BACKGROUNDS: Required<ThemeEffectBackgrounds> = {
  color: { variant: "color", backgroundColor: "#000000" },
  neural: {
    variant: "neural",
    neuralColors: {
      center: "#151964",
      middle: "#021A4B",
      edge: "#03091D",
      link: "#7DD3FC",
      dot: "#93C5FD",
    },
  },
  nebula: {
    variant: "nebula",
    nebulaColor: "#712CF9",
    nebulaExplosionColor: "#8B5CF6",
    nebulaBackgroundStart: "#0B0716",
    nebulaBackgroundEnd: "#1A0D35",
  },
  particles: {
    variant: "particles",
    particleColor: "#60A5FA",
    particleBackgroundColor: "#020617",
    particleCount: 36,
  },
};
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TikTokLiveChatCard } from "./TikTokLiveChatCard";

function LiveChatDashboardContent({
  className = "backdrop-blur",
}: {
  className?: string;
}) {
  const { t } = useI18n();
  const { subscribe } = useGlobalObserver();
  const { state, messages, loading, refresh, clear } = useLiveChat();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [twitchReconnect, setTwitchReconnect] = useState(true);
  const [channel, setChannel] = useState("");
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [channelTouched, setChannelTouched] = useState(false);
  const [channelSearch, setChannelSearch] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [channelOverrides, setChannelOverrides] = useState<
    Record<string, LiveChatChannelAppearance>
  >({});
  const [maxMessages, setMaxMessages] = useState("200");
  const [backgroundConfigVariant, setBackgroundConfigVariant] =
    useState<LiveChatBackgroundVariant | null>(null);
  const [effectConfig, setEffectConfig] =
    useState<ConfigurableEffectBackground | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const settings = state?.settings;
  const twitch = state?.providers.twitch;
  // The overlay is useful even before a provider is connected (for example
  // while configuring channels). Only the global service switch blocks it.
  const canOpenOverlay = Boolean(settings?.enabled);
  const overlayBackground =
    settings?.overlay.background ?? DEFAULT_LIVE_CHAT_BACKGROUNDS.color;

  useEffect(() => {
    if (!settings) return;
    setUsername(settings.twitch.username);
    setAnonymous(settings.twitch.anonymous);
    setTwitchReconnect(settings.twitch.reconnect);
    setChannels(settings.twitch.channels);
    setChannelOverrides(settings.twitch.channelOverrides);
    setMaxMessages(String(settings.overlay.maxMessages));
  }, [
    settings?.twitch.username,
    settings?.twitch.anonymous,
    settings?.twitch.reconnect,
    settings?.twitch.channels.join("|"),
    settings?.twitch.channelOverrides,
    settings?.overlay.maxMessages,
  ]);

  useEffect(() => {
    const refreshOverlay = async () => {
      const next = await window.underdeck.liveChat.getOverlayState();
      setOverlayOpen(next.open);
    };
    void refreshOverlay();
    return subscribe(
      "live-chat:overlay-changed",
      () => void refreshOverlay(),
      false,
    );
  }, [settings?.overlay.mode, subscribe]);

  const statusText = twitch?.connecting
    ? t("live_chat.status.connecting", "Conectando")
    : twitch?.reconnecting
      ? t("live_chat.status.reconnecting", "Reconectando")
      : twitch?.connected
        ? t("live_chat.status.connected", "Conectado")
        : t("live_chat.status.disconnected", "Desconectado");

  const run = async (
    key: string,
    action: () => Promise<{ ok: boolean; message: string }>,
  ) => {
    setBusy(key);
    try {
      const result = await action();
      const command = result as { ok: boolean; message: string; code?: string };
      const description = command.code
        ? t(command.code, command.message)
        : command.message;
      if (result.ok)
        toast.success(t("live_chat.action_success", "Ação concluída."), {
          description,
        });
      else
        toast.error(
          t("live_chat.action_failed", "Não foi possível concluir a ação."),
          { description },
        );
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const patchSettings = async (
    patch: Parameters<typeof window.underdeck.liveChat.updateSettings>[0],
  ) => {
    const result = await window.underdeck.liveChat.updateSettings(patch);
    if (!result.ok)
      toast.error(
        t("live_chat.settings.save_failed", "Não foi possível salvar."),
        {
          description: result.code
            ? t(result.code, result.message)
            : result.message,
        },
      );
    await refresh();
    return result;
  };

  const normalizedChannel = channel.trim().replace(/^[@#]/, "").toLowerCase();
  const channelValidationError = !normalizedChannel
    ? t("live_chat.twitch.channel_required", "Informe o nome do canal.")
    : !/^[a-z0-9_]{1,25}$/.test(normalizedChannel)
      ? t(
        "live_chat.twitch.channel_invalid",
        "Use somente letras, números e sublinhado, com até 25 caracteres.",
      )
      : channels.includes(normalizedChannel)
        ? t(
          "live_chat.twitch.channel_duplicate",
          "Este canal já foi adicionado.",
        )
        : null;

  const openChannelDialog = () => {
    setChannel("");
    setChannelTouched(false);
    setChannelDialogOpen(true);
  };

  const addChannel = () => {
    setChannelTouched(true);
    if (channelValidationError) return;
    setChannels((current) => [...current, normalizedChannel]);
    setChannel("");
    setChannelTouched(false);
    setChannelDialogOpen(false);
  };

  const updateChannelAppearance = (
    channelName: string,
    patch: Partial<LiveChatChannelAppearance>,
  ) => {
    setChannelOverrides((current) => ({
      ...current,
      [channelName]: {
        label: current[channelName]?.label ?? "",
        icon: current[channelName]?.icon ?? null,
        eventsEnabled: current[channelName]?.eventsEnabled !== false,
        ...patch,
      },
    }));
  };

  const setChannelEventsEnabled = (
    channelName: string,
    eventsEnabled: boolean,
  ) => {
    const next = {
      ...channelOverrides,
      [channelName]: {
        label: channelOverrides[channelName]?.label ?? "",
        icon: channelOverrides[channelName]?.icon ?? null,
        eventsEnabled,
      },
    };
    setChannelOverrides(next);
  };

  const removeChannel = (channelName: string) => {
    setChannels((current) => current.filter((value) => value !== channelName));
    setChannelOverrides((current) => {
      const next = { ...current };
      delete next[channelName];
      return next;
    });
  };

  const selectChannelIcon = async (channelName: string) => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t(
        "live_chat.twitch.channel_icon_select",
        "Selecionar imagem ou GIF do canal",
      ),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [
        {
          name: t("common.images", "Imagens"),
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
        },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    const mediaUrl = await window.underdeck.media.importFileToMediaUrl(
      selectedPath,
      "live-chat-channel-icons",
    );
    if (!mediaUrl) {
      toast.error(
        t(
          "live_chat.twitch.channel_icon_failed",
          "Não foi possível importar a imagem do canal.",
        ),
      );
      return;
    }
    updateChannelAppearance(channelName, { icon: mediaUrl });
  };

  const copyEffectBackground = (variant: ConfigurableEffect) => {
    const saved = settings?.overlay.backgroundPresets?.[variant];
    const active =
      overlayBackground.variant === variant ? overlayBackground : null;
    return structuredClone(
      saved ?? active ?? DEFAULT_LIVE_CHAT_BACKGROUNDS[variant],
    ) as ConfigurableEffectBackground;
  };

  const openBackgroundConfig = (variant = overlayBackground.variant) => {
    setBackgroundConfigVariant(variant);
    setEffectConfig(
      variant === "image" || variant === "video"
        ? null
        : copyEffectBackground(variant),
    );
  };

  const closeBackgroundConfig = () => {
    setBackgroundConfigVariant(null);
    setEffectConfig(null);
  };

  const selectOverlayBackgroundFile = async (variant: "image" | "video") => {
    const isVideo = variant === "video";
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: isVideo
        ? t("live_chat.overlay.background.select_video", "Selecionar vídeo")
        : t(
          "live_chat.overlay.background.select_image",
          "Selecionar imagem ou GIF",
        ),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [
        isVideo
          ? {
            name: t("live_chat.overlay.background.videos", "Vídeos"),
            extensions: ["mp4", "webm", "mkv", "mov", "avi", "m4v"],
          }
          : {
            name: t("common.images", "Imagens"),
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return false;
    const mediaUrl = await window.underdeck.media.importFileToMediaUrl(
      selectedPath,
      "live-chat-backgrounds",
    );
    if (!mediaUrl) {
      toast.error(
        t(
          "live_chat.overlay.background.import_failed",
          "Não foi possível importar o fundo.",
        ),
      );
      return false;
    }
    const result = await patchSettings({
      overlay: {
        background:
          variant === "video"
            ? { variant: "video", videoSrc: mediaUrl }
            : { variant: "image", imageSrc: mediaUrl },
      },
    });
    if (result.ok) closeBackgroundConfig();
    return result.ok;
  };

  const changeOverlayBackground = async (
    variant: LiveChatBackgroundVariant,
  ) => {
    if (variant === "image" || variant === "video") {
      openBackgroundConfig(variant);
      return;
    }
    await patchSettings({
      overlay: {
        background: copyEffectBackground(variant),
      },
    });
  };

  const applyEffectConfig = async () => {
    if (!effectConfig) return;
    const result = await patchSettings({
      overlay: {
        background: structuredClone(effectConfig),
        backgroundPresets: {
          ...(settings?.overlay.backgroundPresets ?? {}),
          [effectConfig.variant]: structuredClone(effectConfig),
        },
      },
    });
    if (result.ok) closeBackgroundConfig();
  };

  const gradientColors =
    effectConfig?.variant === "color"
      ? effectConfig.backgroundColors?.length
        ? effectConfig.backgroundColors
        : [
          effectConfig.backgroundColor ?? "#000000",
          effectConfig.backgroundColor ?? "#000000",
          effectConfig.backgroundColor ?? "#000000",
        ]
      : [];

  const updateGradientColor = (index: number, color: string) => {
    if (effectConfig?.variant !== "color") return;
    const nextColors = [...gradientColors];
    nextColors[index] = color;
    setEffectConfig({
      ...effectConfig,
      colorMode: "loop",
      backgroundColors: nextColors.slice(0, 3),
    });
  };

  const resetOverlayBackground = () =>
    patchSettings({
      overlay: {
        background: structuredClone(DEFAULT_LIVE_CHAT_BACKGROUNDS.color),
      },
    });

  const persistTwitch = async () => {
      const result = await window.underdeck.liveChat.updateSettings({
        twitch: {
          anonymous,
          reconnect: twitchReconnect,
          username: username.trim(),
          channels,
          channelOverrides,
          ...(password.trim() ? { password: password.trim() } : {}),
        },
      });
      if (result.ok) setPassword("");
      return result;
  };

  const saveTwitch = () => run("save", persistTwitch);

  const connectTwitch = () =>
    run("twitch-connect", async () => {
      if (twitchHasChanges) {
        const saved = await persistTwitch();
        if (!saved.ok) return saved;
      }
      return window.underdeck.liveChat.connect("twitch");
    });

  const applyAndReconnectTwitch = () =>
    run("twitch-reconnect", async () => {
      const saved = await persistTwitch();
      if (!saved.ok) return saved;
      await window.underdeck.liveChat.disconnect("twitch");
      return window.underdeck.liveChat.connect("twitch");
    });

  const toggleOverlay = async () => {
    setBusy("overlay");
    try {
      const current = await window.underdeck.liveChat.getOverlayState();
      const next = current.open
        ? await window.underdeck.liveChat.closeOverlay(current.scope)
        : await window.underdeck.liveChat.openOverlay();
      setOverlayOpen(next.open);
    } finally {
      setBusy(null);
    }
  };

  const changeOverlayMode = async (mode: "combined" | "separate") => {
    await Promise.all([
      window.underdeck.liveChat.closeOverlay("combined"),
      window.underdeck.liveChat.closeOverlay("twitch"),
      window.underdeck.liveChat.closeOverlay("tiktok"),
    ]);
    setOverlayOpen(false);
    await patchSettings({ overlay: { mode } });
  };

  const joined = useMemo(
    () => twitch?.joinedChannels ?? [],
    [twitch?.joinedChannels],
  );
  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().replace(/^#/, "").toLowerCase();
    if (!query) return channels;
    return channels.filter((item) => {
      const label = channelOverrides[item]?.label ?? "";
      return item.includes(query) || label.toLowerCase().includes(query);
    });
  }, [channelOverrides, channelSearch, channels]);
  const twitchHasChanges = Boolean(
    settings &&
    (anonymous !== settings.twitch.anonymous ||
      twitchReconnect !== settings.twitch.reconnect ||
      username.trim() !== settings.twitch.username.trim() ||
      password.trim().length > 0 ||
      JSON.stringify(channels) !== JSON.stringify(settings.twitch.channels) ||
      JSON.stringify(channelOverrides) !==
      JSON.stringify(settings.twitch.channelOverrides)),
  );

  return (
    <div className="h-full w-full select-none p-2">
      <Card className={`grid gap-4 bg-card/70 p-6 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-400">
              <MessageCircleMore />
            </span>
            <div>
              <h2 className="font-semibold">
                {t("live_chat.title", "Chat ao vivo")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t(
                  "live_chat.description",
                  "Chats de transmissões reunidos em um overlay local.",
                )}
              </p>
            </div>
          </div>
        </div>

        <Card className="grid gap-4 border-border/70 bg-card/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>
                {t("live_chat.service.enabled", "Ativar Chat ao vivo")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "live_chat.service.enabled_desc",
                  "Desativar encerra todos os provedores e não consome recursos.",
                )}
              </p>
            </div>
            <Switch
              checked={Boolean(settings?.enabled)}
              onCheckedChange={(enabled) => void patchSettings({ enabled })}
            />
          </div>

          <div className="grid gap-4 border-t border-border/70 pt-4">
            <div className="flex items-center gap-2">
              <MonitorUp />
              <div>
                <Label>{t("live_chat.overlay.title", "Overlay do chat")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "live_chat.overlay.description",
                    "Janela preta e sem bordas, com posição e tamanho salvos.",
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("live_chat.overlay.mode", "Organização")}</Label>
                <Select
                  value={settings?.overlay.mode ?? "combined"}
                  onValueChange={(mode) =>
                    void changeOverlayMode(mode as "combined" | "separate")
                  }
                >
                  <SelectTrigger rounded="xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combined">
                      {t("live_chat.overlay.combined", "Todos juntos")}
                    </SelectItem>
                    <SelectItem value="separate">
                      {t("live_chat.overlay.separate", "Separado por provedor")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="live-chat-max">
                  {t(
                    "live_chat.overlay.max_messages",
                    "Mensagens mantidas na memória",
                  )}
                </Label>
                <Input
                  id="live-chat-max"
                  rounded="xl"
                  type="number"
                  min={10}
                  max={1000}
                  value={maxMessages}
                  onChange={(event) => setMaxMessages(event.target.value)}
                  onBlur={() =>
                    void patchSettings({
                      overlay: { maxMessages: Number(maxMessages || 200) },
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>
                  {t(
                    "live_chat.overlay.background.title",
                    "Fundo do overlay",
                  )}
                </Label>

                <div className="relative h-30 overflow-hidden rounded-xl border border-border/70 bg-black">
                  <BackgroundComp
                    {...overlayBackground}
                    fullScreen={false}
                    className="rounded-xl"
                  />
                  <span className="absolute bottom-2 left-2 z-10 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
                    {t("live_chat.overlay.background.preview", "Prévia")}
                  </span>
                </div>

                <div className="grid content-start gap-2">
                  <div className="grid w-full min-w-0 gap-2 lg:grid-cols-3">
                    <Select
                      value={overlayBackground.variant}
                      onValueChange={(variant) =>
                        void changeOverlayBackground(
                          variant as LiveChatBackgroundVariant,
                        )
                      }
                    >
                      <SelectTrigger className="min-w-0 w-full" rounded="xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="color">
                          {t("live_chat.overlay.background.color", "Cor")}
                        </SelectItem>
                        <SelectItem value="neural">
                          {t("live_chat.overlay.background.neural", "Neural")}
                        </SelectItem>
                        <SelectItem value="nebula">
                          {t("live_chat.overlay.background.nebula", "Nebulosa")}
                        </SelectItem>
                        <SelectItem value="particles">
                          {t(
                            "live_chat.overlay.background.particles",
                            "Partículas",
                          )}
                        </SelectItem>
                        <SelectItem value="image">
                          {t(
                            "live_chat.overlay.background.image",
                            "Imagem/GIF",
                          )}
                        </SelectItem>
                        <SelectItem value="video">
                          {t("live_chat.overlay.background.video", "Vídeo")}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      rounded="xl"
                      variant="default"
                      onClick={() => void resetOverlayBackground()}
                    >
                      <RotateCcw />
                      {t(
                        "live_chat.overlay.background.reset",
                        "Redefinir para preto",
                      )}
                    </Button>

                    <Button
                      type="button"
                      rounded="xl"
                      variant="outline-primary"
                      onClick={() => openBackgroundConfig()}
                    >
                      <Cog />
                      {t(
                        "live_chat.overlay.background.configure",
                        "Configurar",
                      )}
                    </Button>

                    <Button
                      rounded="xl"
                      variant={settings?.overlay.paused ? "default" : "secondary"}
                      onClick={() =>
                        void window.underdeck.liveChat.setOverlayPaused(
                          !settings?.overlay.paused,
                        )
                      }
                    >
                      {settings?.overlay.paused ? <Play /> : <Pause />}
                      {settings?.overlay.paused
                        ? t("live_chat.overlay.resume", "Retomar")
                        : t("live_chat.overlay.pause", "Pausar")}
                    </Button>

                    <Button
                      rounded="xl"
                      variant={settings?.overlay.locked ? "secondary" : "default"}
                      onClick={() =>
                        void window.underdeck.liveChat.setOverlayLocked(
                          !settings?.overlay.locked,
                        )
                      }
                    >
                      {settings?.overlay.locked ? <Unlock /> : <Lock />}
                      {settings?.overlay.locked
                        ? t("live_chat.overlay.unlock", "Desfixar")
                        : t("live_chat.overlay.lock", "Fixar")}
                    </Button>

                    <Button
                      rounded="xl"
                      variant={
                        settings?.overlay.alwaysOnTop ? "secondary" : "default"
                      }
                      onClick={() =>
                        void window.underdeck.liveChat.setOverlayAlwaysOnTop(
                          !settings?.overlay.alwaysOnTop,
                        )
                      }
                    >
                      {settings?.overlay.alwaysOnTop ? <PinOff /> : <Pin />}
                      {settings?.overlay.alwaysOnTop
                        ? t(
                          "live_chat.overlay.disable_always_on_top",
                          "Desativar sempre no topo",
                        )
                        : t(
                          "live_chat.overlay.enable_always_on_top",
                          "Ativar sempre no topo",
                        )}
                    </Button>

                    <Button
                      rounded="xl"
                      variant="destructive"
                      onClick={() => void clear()}
                    >
                      <Trash2 /> {t("live_chat.overlay.clear", "Limpar")}
                    </Button>

                    <Button
                      rounded="xl"
                      variant={overlayOpen ? "destructive" : "default"}
                      disabled={
                        loading ||
                        busy === "overlay" ||
                        (!overlayOpen && !canOpenOverlay)
                      }
                      onClick={() => void toggleOverlay()}
                    >
                      {busy === "overlay" ? (
                        <Loader2 className="animate-spin" />
                      ) : overlayOpen ? (
                        <X />
                      ) : (
                        <MonitorUp />
                      )}
                      {overlayOpen
                        ? t("live_chat.overlay.close", "Fechar overlay")
                        : t("live_chat.overlay.open", "Abrir overlay")}
                    </Button>

                    <Button
                      rounded="xl"
                      variant="secondary"
                      disabled={true}
                      className="cursor-not-allowed text-muted-foreground"
                    >
                      {t("live_chat.overlay.buffer", "Mensagens nesta tela")}:{" "}
                      {messages.length}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="grid gap-4 border-border/70 bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <img
                  src="../assets/icons/twitch.png"
                  alt=""
                  className="size-5 object-contain"
                />
                <div>
                  <Label>Twitch</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "live_chat.twitch.description",
                      "Uma conexão para todos os canais configurados.",
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant={twitch?.connected ? "default" : "secondary"}>
                  {twitch?.connecting || twitch?.reconnecting ? (
                    <Loader2 className="mr-1 animate-spin" />
                  ) : (
                    <Radio className="mr-1" />
                  )}
                  {statusText}
                </Badge>
                {twitch?.connected ? (
                  <Button
                    rounded="xl"
                    variant="outline-destructive"
                    disabled={busy === "twitch-disconnect"}
                    onClick={() =>
                      void run("twitch-disconnect", () =>
                        window.underdeck.liveChat.disconnect("twitch"),
                      )
                    }
                  >
                    {busy === "twitch-disconnect" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Unplug />
                    )}
                    {t("live_chat.disconnect", "Desconectar")}
                  </Button>
                ) : (
                  <Button
                    rounded="xl"
                    disabled={
                      busy === "twitch-connect" ||
                      !settings?.enabled ||
                      !settings?.twitch.enabled
                    }
                    onClick={() => void connectTwitch()}
                  >
                    {busy === "twitch-connect" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <PlugZap />
                    )}
                    {t("live_chat.connect", "Conectar")}
                  </Button>
                )}
                <Switch
                  checked={Boolean(settings?.twitch.enabled)}
                  disabled={!settings?.enabled}
                  onCheckedChange={(enabled) =>
                    void patchSettings({ twitch: { enabled } })
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <Label>
                    {t("live_chat.twitch.anonymous", "Modo anônimo")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "live_chat.twitch.anonymous_desc",
                      "Ignora usuário e senha salvos.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={anonymous}
                  onCheckedChange={setAnonymous}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <Label>
                    {t(
                      "live_chat.twitch.reconnect",
                      "Reconectar automaticamente",
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "live_chat.twitch.reconnect_desc",
                      "Tenta recuperar a conexão após uma queda.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={twitchReconnect}
                  onCheckedChange={setTwitchReconnect}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="live-chat-username">
                  {t("live_chat.twitch.username", "Usuário (opcional)")}
                </Label>
                <Input
                  id="live-chat-username"
                  rounded="xl"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={anonymous}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="live-chat-password">
                  {t("live_chat.twitch.password", "Senha/token (opcional)")}
                </Label>
                <InputPassword
                  id="live-chat-password"
                  rounded="xl"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={anonymous}
                  placeholder={
                    settings?.twitch.hasPassword
                      ? t(
                        "live_chat.twitch.password_saved",
                        "Já salvo — deixe vazio para manter",
                      )
                      : "oauth:..."
                  }
                />
              </div>
            </div>

            <div className="grid gap-2 rounded-xl border border-border/70 bg-background/20 p-3">
              <Label>
                {t("live_chat.provider.overlay_display", "Exibição no overlay")}
              </Label>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    {settings?.twitch.display.showSelfMessages ? <Eye /> : <EyeOff />}
                    <Label>
                      {t(
                        "live_chat.overlay.show_self",
                        "Mostrar minhas mensagens",
                      )}
                    </Label>
                  </div>
                  <Switch
                    checked={Boolean(settings?.twitch.display.showSelfMessages)}
                    onCheckedChange={(showSelfMessages) =>
                      void patchSettings({ twitch: { display: { showSelfMessages } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <Clock3 />
                    <Label>
                      {t("live_chat.overlay.show_timestamp", "Mostrar horário")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showTimestamp !== false}
                    onCheckedChange={(showTimestamp) =>
                      void patchSettings({ twitch: { display: { showTimestamp } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <CircleUserRound />
                    <Label>
                      {t("live_chat.overlay.show_avatar", "Mostrar avatar")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showAvatar !== false}
                    onCheckedChange={(showAvatar) =>
                      void patchSettings({ twitch: { display: { showAvatar } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <Award />
                    <Label>
                      {t("live_chat.overlay.show_badges", "Mostrar badges")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showBadges !== false}
                    onCheckedChange={(showBadges) =>
                      void patchSettings({ twitch: { display: { showBadges } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <Radio />
                    <Label>
                      {t("live_chat.overlay.show_provider", "Mostrar provedor")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showProvider !== false}
                    onCheckedChange={(showProvider) =>
                      void patchSettings({ twitch: { display: { showProvider } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <Hash />
                    <Label>
                      {t("live_chat.overlay.show_channel", "Mostrar canal")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showChannel !== false}
                    onCheckedChange={(showChannel) =>
                      void patchSettings({ twitch: { display: { showChannel } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <UserPlus />
                    <Label>
                      {t("live_chat.overlay.show_join_events", "Mostrar entradas")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showJoinEvents !== false}
                    onCheckedChange={(showJoinEvents) =>
                      void patchSettings({ twitch: { display: { showJoinEvents } } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <Heart />
                    <Label>
                      {t("live_chat.overlay.show_follow_events", "Mostrar follows")}
                    </Label>
                  </div>
                  <Switch
                    checked={settings?.twitch.display.showFollowEvents !== false}
                    onCheckedChange={(showFollowEvents) =>
                      void patchSettings({ twitch: { display: { showFollowEvents } } })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>
                {t("live_chat.twitch.channels", "Canais monitorados")}
              </Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="live-chat-channel-search"
                    rounded="xl"
                    value={channelSearch}
                    onChange={(event) => setChannelSearch(event.target.value)}
                    className="pl-9"
                    placeholder={t(
                      "live_chat.twitch.search_channels",
                      "Buscar canal ou rótulo...",
                    )}
                  />
                </div>
                <Button
                  type="button"
                  rounded="xl"
                  variant="outline-primary"
                  className="shrink-0"
                  onClick={openChannelDialog}
                >
                  <Plus className="shrink-0" />
                  <span>{t("live_chat.twitch.add_channel", "Adicionar")}</span>
                </Button>
              </div>
              <div className="grid max-h-80 min-h-9 gap-2 overflow-y-auto rounded-xl border p-4 [scrollbar-width:thin]">
                {channels.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t(
                      "live_chat.twitch.no_channels",
                      "Nenhum canal adicionado.",
                    )}
                  </span>
                ) : filteredChannels.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t(
                      "live_chat.twitch.no_channel_results",
                      "Nenhum canal encontrado.",
                    )}
                  </span>
                ) : (
                  filteredChannels.map((item) => {
                    const appearance = channelOverrides[item] ?? {
                      label: "",
                      icon: null,
                      eventsEnabled: true,
                    };
                    return (
                      <div
                        key={item}
                        className="grid gap-3 rounded-xl border border-border/70 bg-background/35 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {appearance.icon ? (
                              <img
                                src={appearance.icon}
                                alt=""
                                className="size-10 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                                <Hash />
                              </span>
                            )}
                            <Badge
                              variant={
                                joined.includes(item) ? "default" : "secondary"
                              }
                              className="min-w-0 truncate"
                            >
                              #{item}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 rounded-xl border border-border/70 px-2 py-1.5">
                            {appearance.eventsEnabled !== false ? (
                              <Eye className="size-4" />
                            ) : (
                              <EyeOff className="size-4" />
                            )}
                            <Label className="text-xs">
                              {t("live_chat.twitch.channel_events", "Eventos")}
                            </Label>
                            <Switch
                              checked={appearance.eventsEnabled !== false}
                              onCheckedChange={(eventsEnabled) =>
                                setChannelEventsEnabled(item, eventsEnabled)
                              }
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:flex-row md:items-end">
                          <div className="grid min-w-0 flex-1 gap-1.5">
                            {/*
                            <Label
                              htmlFor={`live-chat-channel-label-${item}`}
                              className="text-xs"
                            >
                              {t(
                                "live_chat.twitch.channel_label",
                                "Rótulo do canal",
                              )}
                            </Label>
                            */}
                            <Input
                              id={`live-chat-channel-label-${item}`}
                              rounded="xl"
                              value={appearance.label}
                              onChange={(event) =>
                                updateChannelAppearance(item, {
                                  label: event.target.value,
                                })
                              }
                              placeholder={t(
                                "live_chat.twitch.channel_label_placeholder",
                                "Rótulo, emoji ou texto alternativo",
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  rounded="xl"
                                  variant="outline-primary"
                                  onClick={() => void selectChannelIcon(item)}
                                >
                                  <ImagePlus />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t(
                                  "live_chat.twitch.channel_icon",
                                  "Imagem/GIF",
                                )}
                              </TooltipContent>
                            </Tooltip>
                            {appearance.icon ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    rounded="xl"
                                    variant="outline-destructive"
                                    onClick={() =>
                                      updateChannelAppearance(item, {
                                        icon: null,
                                      })
                                    }
                                  >
                                    <ImageOff />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t(
                                    "live_chat.twitch.remove_channel_icon",
                                    "Sem imagem",
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  rounded="xl"
                                  variant="outline-destructive"
                                  onClick={() => removeChannel(item)}
                                >
                                  <Trash2 />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t(
                                  "live_chat.twitch.remove_channel",
                                  "Remover canal",
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Dialog
              open={channelDialogOpen}
              onOpenChange={(open) => {
                setChannelDialogOpen(open);
                if (!open) {
                  setChannel("");
                  setChannelTouched(false);
                }
              }}
            >
              <DialogContent className="border-border/80 bg-popover/95 backdrop-blur-2xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {t("live_chat.twitch.add_channel_title", "Adicionar canal")}
                  </DialogTitle>
                  <DialogDescription>
                    {t(
                      "live_chat.twitch.add_channel_desc",
                      "Informe o nome usado na URL do canal da Twitch.",
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                  <Label htmlFor="live-chat-channel">
                    {t("live_chat.twitch.channel_name", "Nome do canal")}
                  </Label>
                  <Input
                    id="live-chat-channel"
                    rounded="xl"
                    autoFocus
                    value={channel}
                    aria-invalid={
                      channelTouched && Boolean(channelValidationError)
                    }
                    onChange={(event) => setChannel(event.target.value)}
                    onBlur={() => setChannelTouched(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addChannel();
                      }
                    }}
                    placeholder={t(
                      "live_chat.twitch.channel_placeholder",
                      "nome_do_canal",
                    )}
                  />
                  {channelTouched && channelValidationError ? (
                    <p className="text-xs text-destructive">
                      {channelValidationError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "live_chat.twitch.channel_example",
                        "Exemplo: ironmouse ou @ironmouse",
                      )}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    rounded="xl"
                    variant="outline-destructive"
                    onClick={() => setChannelDialogOpen(false)}
                  >
                    <X /> {t("common.cancel", "Cancelar")}
                  </Button>
                  <Button
                    type="button"
                    rounded="xl"
                    disabled={Boolean(channelValidationError)}
                    onClick={addChannel}
                  >
                    <Plus /> {t("live_chat.twitch.add_channel", "Adicionar")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {twitchHasChanges ? (
                <div className="mr-auto flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-500">
                  <TriangleAlert className="size-4" />
                  {t(
                    "live_chat.settings.unsaved_changes",
                    "Existem alterações pendentes. Salve para aplicá-las.",
                  )}
                </div>
              ) : null}
              {settings?.twitch.hasPassword ? (
                <Button
                  type="button"
                  rounded="xl"
                  variant="outline-destructive"
                  disabled={busy === "clear-credentials"}
                  onClick={() =>
                    void run("clear-credentials", () =>
                      window.underdeck.liveChat.updateSettings({
                        twitch: { clearPassword: true, username: "" },
                      }),
                    )
                  }
                >
                  {busy === "clear-credentials" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}{" "}
                  {t(
                    "live_chat.twitch.clear_credentials",
                    "Limpar credenciais",
                  )}
                </Button>
              ) : null}
              {twitch?.connected && twitchHasChanges ? (
                <Button
                  type="button"
                  rounded="xl"
                  variant="outline-primary"
                  disabled={busy === "twitch-reconnect"}
                  onClick={() => void applyAndReconnectTwitch()}
                >
                  {busy === "twitch-reconnect" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RotateCcw />
                  )}
                  {t(
                    "live_chat.apply_reconnect",
                    "Aplicar e reconectar",
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                rounded="xl"
                disabled={busy === "save" || !twitchHasChanges}
                onClick={() => void saveTwitch()}
              >
                {busy === "save" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}{" "}
                {t("common.save", "Salvar")}
              </Button>
            </div>
          </Card>

          <Dialog
            open={backgroundConfigVariant !== null}
            onOpenChange={(open) => !open && closeBackgroundConfig()}
          >
            <DialogContent className="max-h-[calc(100dvh-3rem)] overflow-y-auto border-border/80 bg-popover/95 p-5 backdrop-blur-2xl sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>
                  {backgroundConfigVariant === "neural" &&
                    t("theme.effects.neural_title", "Personalizar Neural")}
                  {backgroundConfigVariant === "nebula" &&
                    t("theme.effects.nebula_title", "Personalizar Nebulosa")}
                  {backgroundConfigVariant === "particles" &&
                    t(
                      "theme.effects.particles_title",
                      "Personalizar Partículas",
                    )}
                  {backgroundConfigVariant === "color" &&
                    t("theme.effects.gradient_title", "Personalizar cores")}
                  {backgroundConfigVariant === "image" &&
                    t(
                      "live_chat.overlay.background.configure_image",
                      "Configurar imagem ou GIF",
                    )}
                  {backgroundConfigVariant === "video" &&
                    t(
                      "live_chat.overlay.background.configure_video",
                      "Configurar vídeo",
                    )}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "live_chat.overlay.background.configure_description",
                    "Cada tipo de fundo mantém sua própria configuração.",
                  )}
                </p>
              </DialogHeader>

              {effectConfig?.variant === "neural" && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.center", "Centro")}
                    value={effectConfig.neuralColors?.center ?? "#151964"}
                    onChange={(center) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          center,
                        },
                      })
                    }
                    onChangeWithAlpha={(center) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          center,
                        },
                      })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.middle", "Meio")}
                    value={effectConfig.neuralColors?.middle ?? "#021A4B"}
                    onChange={(middle) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          middle,
                        },
                      })
                    }
                    onChangeWithAlpha={(middle) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          middle,
                        },
                      })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.edge", "Borda")}
                    value={effectConfig.neuralColors?.edge ?? "#03091D"}
                    onChange={(edge) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          edge,
                        },
                      })
                    }
                    onChangeWithAlpha={(edge) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          edge,
                        },
                      })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t(
                      "theme.effects.connection_lines",
                      "Linhas de conexão",
                    )}
                    value={effectConfig.neuralColors?.link ?? "#7DD3FC"}
                    onChange={(link) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          link,
                        },
                      })
                    }
                    onChangeWithAlpha={(link) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          link,
                        },
                      })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.dots", "Pontos")}
                    value={effectConfig.neuralColors?.dot ?? "#93C5FD"}
                    onChange={(dot) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          dot,
                        },
                      })
                    }
                    onChangeWithAlpha={(dot) =>
                      setEffectConfig({
                        ...effectConfig,
                        neuralColors: {
                          ...effectConfig.neuralColors,
                          dot,
                        },
                      })
                    }
                  />
                </div>
              )}

              {effectConfig?.variant === "nebula" && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.nebula", "Nebulosa")}
                    value={effectConfig.nebulaColor ?? "#712CF9"}
                    onChange={(nebulaColor) =>
                      setEffectConfig({ ...effectConfig, nebulaColor })
                    }
                    onChangeWithAlpha={(nebulaColor) =>
                      setEffectConfig({ ...effectConfig, nebulaColor })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.explosion", "Explosão")}
                    value={effectConfig.nebulaExplosionColor ?? "#8B5CF6"}
                    onChange={(nebulaExplosionColor) =>
                      setEffectConfig({
                        ...effectConfig,
                        nebulaExplosionColor,
                      })
                    }
                    onChangeWithAlpha={(nebulaExplosionColor) =>
                      setEffectConfig({
                        ...effectConfig,
                        nebulaExplosionColor,
                      })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.background_start", "Fundo inicial")}
                    value={effectConfig.nebulaBackgroundStart ?? "#0B0716"}
                    onChange={(nebulaBackgroundStart) =>
                      setEffectConfig({
                        ...effectConfig,
                        nebulaBackgroundStart,
                      })
                    }
                    onChangeWithAlpha={(nebulaBackgroundStart) =>
                      setEffectConfig({
                        ...effectConfig,
                        nebulaBackgroundStart,
                      })
                    }
                  />
                  <DiscordColorPicker
                    showAlpha
                    label={t("theme.effects.background_end", "Fundo final")}
                    value={effectConfig.nebulaBackgroundEnd ?? "#1A0D35"}
                    onChange={(nebulaBackgroundEnd) =>
                      setEffectConfig({
                        ...effectConfig,
                        nebulaBackgroundEnd,
                      })
                    }
                    onChangeWithAlpha={(nebulaBackgroundEnd) =>
                      setEffectConfig({
                        ...effectConfig,
                        nebulaBackgroundEnd,
                      })
                    }
                  />
                </div>
              )}

              {effectConfig?.variant === "particles" && (
                <div className="grid gap-5">
                  <div className="grid grid-cols-2 gap-4">
                    <DiscordColorPicker
                      showAlpha
                      label={t("theme.effects.particles", "Partículas")}
                      value={effectConfig.particleColor ?? "#60A5FA"}
                      onChange={(particleColor) =>
                        setEffectConfig({ ...effectConfig, particleColor })
                      }
                      onChangeWithAlpha={(particleColor) =>
                        setEffectConfig({ ...effectConfig, particleColor })
                      }
                    />
                    <DiscordColorPicker
                      showAlpha
                      label={t("theme.effects.background", "Fundo")}
                      value={effectConfig.particleBackgroundColor ?? "#020617"}
                      onChange={(particleBackgroundColor) =>
                        setEffectConfig({
                          ...effectConfig,
                          particleBackgroundColor,
                        })
                      }
                      onChangeWithAlpha={(particleBackgroundColor) =>
                        setEffectConfig({
                          ...effectConfig,
                          particleBackgroundColor,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label>
                        {t(
                          "theme.effects.particle_count",
                          "Quantidade de partículas",
                        )}
                      </Label>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {effectConfig.particleCount ?? 36}
                      </span>
                    </div>
                    <Slider
                      value={[effectConfig.particleCount ?? 36]}
                      min={6}
                      max={180}
                      step={1}
                      onValueChange={([particleCount]) => {
                        if (particleCount !== undefined)
                          setEffectConfig({
                            ...effectConfig,
                            particleCount,
                          });
                      }}
                    />
                  </div>
                </div>
              )}

              {effectConfig?.variant === "color" && (
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map((index) => (
                    <DiscordColorPicker
                      key={index}
                      showAlpha
                      label={`${t("theme.effects.color", "Cor")} ${index + 1}`}
                      value={
                        gradientColors[index] ??
                        effectConfig.backgroundColor ??
                        "#000000"
                      }
                      onChange={(color) => updateGradientColor(index, color)}
                      onChangeWithAlpha={(color) =>
                        updateGradientColor(index, color)
                      }
                    />
                  ))}
                </div>
              )}

              {backgroundConfigVariant === "image" ||
                backgroundConfigVariant === "video" ? (
                <div className="grid gap-3 rounded-xl border border-border/70 bg-background/40 p-4">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "live_chat.overlay.background.file_description",
                      "O arquivo será copiado para o armazenamento do aplicativo.",
                    )}
                  </p>
                  <Button
                    type="button"
                    rounded="xl"
                    onClick={() =>
                      void selectOverlayBackgroundFile(backgroundConfigVariant)
                    }
                  >
                    <ImagePlus />
                    {backgroundConfigVariant === "video"
                      ? t(
                        "live_chat.overlay.background.select_video",
                        "Selecionar vídeo",
                      )
                      : t(
                        "live_chat.overlay.background.select_image",
                        "Selecionar imagem ou GIF",
                      )}
                  </Button>
                </div>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                {effectConfig ? (
                  <>
                    <Button
                      type="button"
                      variant="outline-secondary"
                      rounded="xl"
                      onClick={() =>
                        setEffectConfig(
                          structuredClone(
                            DEFAULT_LIVE_CHAT_BACKGROUNDS[effectConfig.variant],
                          ),
                        )
                      }
                    >
                      <RotateCcw />
                      {t("theme.effects.restore", "Restaurar padrão")}
                    </Button>
                    <Button
                      type="button"
                      rounded="xl"
                      onClick={() => void applyEffectConfig()}
                    >
                      <CheckCheck />
                      {t("theme.effects.apply", "Aplicar efeito")}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline-secondary"
                    rounded="xl"
                    onClick={closeBackgroundConfig}
                  >
                    <X />
                    {t("common.cancel", "Cancelar")}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <TikTokLiveChatCard />

        {twitch?.lastError ? (
          <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {twitch.lastError}
          </Card>
        ) : null}
      </Card>
    </div>
  );
}

export default function LiveChatDashboard(props: { className?: string }) {
  return (
    <LiveChatProvider>
      <LiveChatDashboardContent {...props} />
    </LiveChatProvider>
  );
}
