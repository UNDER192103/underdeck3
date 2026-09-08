import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Award,
  Clock3,
  Gift,
  Hash,
  Loader2,
  Lock,
  Menu,
  Pause,
  Pin,
  PinOff,
  Play,
  Radio,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useLiveChat } from "@/contexts/LiveChatContext";
import { Button } from "@/components/ui/button";
import { LiveChatProviderIcon } from "@/components/icons/LiveChatProviderIcon";
import { BackgroundComp } from "@/components/ui/background";
import { TwitchBadges } from "@/livechat/TwitchBadges";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  LiveChatChannelAppearance,
  LiveChatEvent,
  LiveChatSettings,
  TwitchChatTags,
} from "@/types/electron";

const DISPLAY_EVENTS = new Set([
  "message",
  "ban",
  "timeout",
  "messagedeleted",
  "sub",
  "resub",
  "subgift",
  "submysterygift",
  "anonsubgift",
  "anonsubmysterygift",
  "subscription",
  "primepaidupgrade",
  "giftpaidupgrade",
  "anongiftpaidupgrade",
  "raided",
  "hosted",
  "notice",
  "cheer",
  "bits",
]);

function renderTwitchMessage(message: string, tags?: TwitchChatTags) {
  const replacements = Object.entries(tags?.emotes ?? {})
    .flatMap(([id, positions]) =>
      positions.map((position) => {
        const [start, end] = position.split("-").map(Number);
        return { id, start, end };
      }),
    )
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .sort((a, b) => a.start - b.start);
  if (replacements.length === 0) return message;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  replacements.forEach((item, index) => {
    if (item.start > cursor)
      nodes.push(
        <Fragment key={`text-${index}`}>
          {message.slice(cursor, item.start)}
        </Fragment>,
      );
    nodes.push(
      <img
        key={`${item.id}-${item.start}`}
        className="mx-0.5 inline-block h-7 w-auto align-middle"
        src={`https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(item.id)}/default/dark/1.0`}
        alt={message.slice(item.start, item.end + 1)}
      />,
    );
    cursor = item.end + 1;
  });
  if (cursor < message.length)
    nodes.push(<Fragment key="text-last">{message.slice(cursor)}</Fragment>);
  return nodes;
}

function formatSystemEvent(
  event: LiveChatEvent,
  t: (key: string, fallback?: string) => string,
) {
  const args = event.args ?? [];
  const actor =
    typeof args[1] === "string"
      ? args[1]
      : typeof args[0] === "string" && !String(args[0]).startsWith("#")
        ? args[0]
        : "";
  const detail = actor ? `${actor} · ` : "";
  return `${detail}${t(`live_chat.event.${event.event}`, event.event)}`;
}

function fillTemplate(
  value: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (current, [key, replacement]) =>
      current.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function eventSource(
  event: LiveChatEvent,
  settings: LiveChatSettings | undefined,
) {
  const channel = String(event.channel ?? "")
    .replace(/^#/, "")
    .toLowerCase();
  const appearance: LiveChatChannelAppearance | undefined =
    settings?.twitch.channelOverrides[channel];
  return {
    channel,
    label: appearance?.label || (!appearance?.icon ? channel : ""),
    icon: appearance?.icon ?? null,
  };
}

function EventSource({
  event,
  settings,
}: {
  event: LiveChatEvent;
  settings: LiveChatSettings | undefined;
}) {
  const source = eventSource(event, settings);
  const showProvider = settings?.overlay.showProvider !== false;
  const showChannel = settings?.overlay.showChannel !== false && source.channel;
  if (!showProvider && !showChannel) return null;

  return (
    <span className="mr-1.5 inline-flex items-center gap-1 align-middle text-[11px] font-semibold text-zinc-400">
      {showProvider ? (
        <LiveChatProviderIcon provider={event.provider} className="size-3.5" />
      ) : null}
      {showChannel ? (
        <span className="inline-flex min-w-0 items-center gap-1 rounded bg-white/5 px-1 py-0.5">
          {source.icon ? (
            <img
              src={source.icon}
              alt=""
              className="size-4 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <Hash className="size-3" />
          )}
          {source.label ? (
            <span className="max-w-28 truncate">{source.label}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function giftDetails(
  event: LiveChatEvent,
  t: (key: string, fallback?: string) => string,
) {
  const args = event.args ?? [];
  const anonymous = event.event.startsWith("anon");
  const mystery = event.event.includes("mysterygift");
  const gifter = anonymous
    ? t("live_chat.gift.anonymous", "Anônimo")
    : String(args[1] || t("live_chat.overlay.unknown_user", "Usuário"));
  const recipientIndex = anonymous ? 2 : 3;
  const countIndex = anonymous ? 1 : 2;
  const methodsIndex = mystery ? (anonymous ? 2 : 3) : anonymous ? 3 : 4;
  const tagsIndex = methodsIndex + 1;
  const methods = objectValue(args[methodsIndex]);
  const tags = objectValue(args[tagsIndex]);
  const plan = String(methods.plan || tags["msg-param-sub-plan"] || "1000");
  const planName = String(tags["msg-param-sub-plan-name"] || "").trim();
  const tier = plan.includes("Prime")
    ? "Prime"
    : plan === "1000"
      ? t("live_chat.gift.tier_1", "Nível 1")
      : plan === "2000"
        ? t("live_chat.gift.tier_2", "Nível 2")
        : plan === "3000"
          ? t("live_chat.gift.tier_3", "Nível 3")
          : planName || t("live_chat.gift.tier_1", "Nível 1");
  const count = Math.max(1, Number(args[countIndex]) || 1);
  const total = Number(
    tags["msg-param-sender-count"] || tags["msg-param-mass-gift-count"],
  );
  return {
    anonymous,
    mystery,
    gifter,
    recipient: String(
      args[recipientIndex] || t("live_chat.gift.community", "comunidade"),
    ),
    count,
    tier,
    total: Number.isFinite(total) && total > 0 ? total : null,
  };
}

function GiftEventCard({
  event,
  settings,
}: {
  event: LiveChatEvent;
  settings: LiveChatSettings | undefined;
}) {
  const { t, locale } = useI18n();
  const details = giftDetails(event, t);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(event.timestamp);
  const showTimestamp = settings?.overlay.showTimestamp !== false;
  const message = details.mystery
    ? fillTemplate(
        t(
          "live_chat.gift.community_message",
          "{gifter} está presenteando {count} inscrições {tier} para a comunidade!",
        ),
        {
          gifter: details.gifter,
          count: details.count,
          tier: details.tier,
        },
      )
    : fillTemplate(
        t(
          "live_chat.gift.recipient_message",
          "{gifter} deu uma inscrição {tier} de presente para {recipient}!",
        ),
        {
          gifter: details.gifter,
          tier: details.tier,
          recipient: details.recipient,
        },
      );

  return (
    <div className="border-l-4 border-fuchsia-400 bg-zinc-900/95 px-2.5 py-2 text-sm text-zinc-100">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        {showTimestamp ? (
          <span className="mr-1 text-[11px] text-zinc-500">{time}</span>
        ) : null}
        <EventSource event={event} settings={settings} />
      </div>
      <div className="flex items-start gap-2">
        <Gift className="mt-0.5 size-5 shrink-0 text-fuchsia-300" />
        <div className="min-w-0">
          <p className="break-words leading-5">{message}</p>
          {details.total ? (
            <p className="mt-1 text-xs text-fuchsia-200">
              {fillTemplate(
                t(
                  "live_chat.gift.sender_total",
                  "Total de presentes deste usuário: {total}",
                ),
                { total: details.total },
              )}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatRow({ event }: { event: LiveChatEvent }) {
  const { t, locale } = useI18n();
  const { state } = useLiveChat();
  const settings = state?.settings;
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(event.timestamp);
  const showTimestamp = settings?.overlay.showTimestamp !== false;
  const showBadges = settings?.overlay.showBadges !== false;
  if (event.event.includes("subgift") || event.event.includes("mysterygift")) {
    return <GiftEventCard event={event} settings={settings} />;
  }
  if (event.event !== "message") {
    return (
      <div className="border-l-2 border-violet-500 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300">
        {showTimestamp ? (
          <span className="mr-2 text-zinc-500">{time}</span>
        ) : null}
        <EventSource event={event} settings={settings} />
        {formatSystemEvent(event, t)}
      </div>
    );
  }

  const displayName = String(
    event.tags?.["display-name"] ||
      event.tags?.username ||
      t("live_chat.overlay.unknown_user", "Usuário"),
  );
  const color = String(event.tags?.color || "#a78bfa");
  return (
    <div className="break-words px-2 py-1 text-[15px] leading-6 text-white">
      {showTimestamp ? (
        <span className="mr-1.5 text-xs text-zinc-500">{time}</span>
      ) : null}
      <EventSource event={event} settings={settings} />
      {event.provider === "twitch" ? (
        <TwitchBadges tags={event.tags} enabled={showBadges} />
      ) : null}
      <span className="mr-1.5 font-bold" style={{ color }}>
        {displayName}:
      </span>
      <span>{renderTwitchMessage(event.message ?? "", event.tags)}</span>
    </div>
  );
}

function MenuItems({ scope }: { scope: "combined" | "twitch" | "tiktok" }) {
  const { t } = useI18n();
  const { state, clear } = useLiveChat();
  const paused = Boolean(state?.settings.overlay.paused);
  const locked = Boolean(state?.settings.overlay.locked);
  const alwaysOnTop = state?.settings.overlay.alwaysOnTop !== false;
  const showTimestamp = state?.settings.overlay.showTimestamp !== false;
  const showBadges = state?.settings.overlay.showBadges !== false;
  const showProvider = state?.settings.overlay.showProvider !== false;
  const showChannel = state?.settings.overlay.showChannel !== false;
  const close = () => void window.underdeck.liveChat.closeOverlay(scope);
  const pause = () => void window.underdeck.liveChat.setOverlayPaused(!paused);
  const lock = () => void window.underdeck.liveChat.setOverlayLocked(!locked);
  return (
    <>
      <ContextMenuItem onSelect={pause}>
        {paused ? <Play /> : <Pause />}
        {paused
          ? t("live_chat.overlay.resume", "Retomar")
          : t("live_chat.overlay.pause", "Pausar")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={lock}>
        {locked ? <Unlock /> : <Lock />}
        {locked
          ? t("live_chat.overlay.unlock", "Desfixar")
          : t("live_chat.overlay.lock", "Fixar")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void window.underdeck.liveChat.setOverlayAlwaysOnTop(!alwaysOnTop)
        }
      >
        {alwaysOnTop ? <PinOff /> : <Pin />}
        {alwaysOnTop
          ? t(
              "live_chat.overlay.disable_always_on_top",
              "Desativar sempre no topo",
            )
          : t(
              "live_chat.overlay.enable_always_on_top",
              "Ativar sempre no topo",
            )}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void window.underdeck.liveChat.updateSettings({
            overlay: { showTimestamp: !showTimestamp },
          })
        }
      >
        <Clock3 />
        {showTimestamp
          ? t("live_chat.overlay.hide_timestamp", "Ocultar horário")
          : t("live_chat.overlay.show_timestamp", "Mostrar horário")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void window.underdeck.liveChat.updateSettings({
            overlay: { showBadges: !showBadges },
          })
        }
      >
        <Award />
        {showBadges
          ? t("live_chat.overlay.hide_badges", "Ocultar badges")
          : t("live_chat.overlay.show_badges", "Mostrar badges")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void window.underdeck.liveChat.updateSettings({
            overlay: { showProvider: !showProvider },
          })
        }
      >
        <Radio />
        {showProvider
          ? t("live_chat.overlay.hide_provider", "Ocultar provedor")
          : t("live_chat.overlay.show_provider", "Mostrar provedor")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void window.underdeck.liveChat.updateSettings({
            overlay: { showChannel: !showChannel },
          })
        }
      >
        <Hash />
        {showChannel
          ? t("live_chat.overlay.hide_channel", "Ocultar canal")
          : t("live_chat.overlay.show_channel", "Mostrar canal")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void clear()}>
        <Trash2 />
        {t("live_chat.overlay.clear", "Limpar")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={close}>
        <X />
        {t("common.close", "Fechar")}
      </ContextMenuItem>
    </>
  );
}

export default function LiveChatOverlayView({
  scope,
}: {
  scope: "combined" | "twitch" | "tiktok";
}) {
  const { t } = useI18n();
  const { state, events, clear } = useLiveChat();
  const [hovered, setHovered] = useState(false);
  const scrollViewportRef = useRef<HTMLElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const paused = Boolean(state?.settings.overlay.paused);
  const locked = Boolean(state?.settings.overlay.locked);
  const alwaysOnTop = state?.settings.overlay.alwaysOnTop !== false;
  const showTimestamp = state?.settings.overlay.showTimestamp !== false;
  const showBadges = state?.settings.overlay.showBadges !== false;
  const showProvider = state?.settings.overlay.showProvider !== false;
  const showChannel = state?.settings.overlay.showChannel !== false;
  const maxMessages = state?.settings.overlay.maxMessages ?? 200;
  const background = state?.settings.overlay.background ?? {
    variant: "color" as const,
    backgroundColor: "#000000",
  };
  const displayEvents = useMemo(
    () =>
      events
        .filter((event) => DISPLAY_EVENTS.has(event.event))
        .filter((event) => {
          if (event.provider !== "twitch") return true;
          const channel = String(event.channel ?? "")
            .replace(/^#/, "")
            .toLowerCase();
          return (
            state?.settings.twitch.channelOverrides[channel]?.eventsEnabled !==
            false
          );
        })
        .slice(-maxMessages),
    [events, maxMessages, state?.settings.twitch.channelOverrides],
  );

  const scrollToLatest = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    scrollToLatest();
    const frameId = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frameId);
  }, [displayEvents, scrollToLatest]);

  useEffect(() => {
    const content = scrollContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToLatest]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <main
          className="relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <BackgroundComp {...background} />
          <header
            className="relative z-10 flex h-9 shrink-0 items-center gap-2 border-b border-white/10 bg-black/80 px-2 backdrop-blur-sm"
            style={
              { WebkitAppRegion: locked ? "no-drag" : "drag" } as CSSProperties
            }
          >
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-300">
              {scope === "combined"
                ? t("live_chat.title", "Chat ao vivo")
                : "Twitch"}
            </span>
            {paused ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                {t("live_chat.overlay.paused", "Pausado")}
              </span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  rounded="full"
                  variant="ghost"
                  className={`size-7 transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}
                  style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                  aria-label={t(
                    "live_chat.overlay.controls",
                    "Controles do overlay",
                  )}
                >
                  <Menu />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="black bg-zinc-950 text-white"
              >
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.setOverlayPaused(!paused)
                  }
                >
                  {paused ? <Play /> : <Pause />}
                  {paused
                    ? t("live_chat.overlay.resume", "Retomar")
                    : t("live_chat.overlay.pause", "Pausar")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.updateSettings({
                      overlay: { showTimestamp: !showTimestamp },
                    })
                  }
                >
                  <Clock3 />
                  {showTimestamp
                    ? t("live_chat.overlay.hide_timestamp", "Ocultar horário")
                    : t("live_chat.overlay.show_timestamp", "Mostrar horário")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.updateSettings({
                      overlay: { showBadges: !showBadges },
                    })
                  }
                >
                  <Award />
                  {showBadges
                    ? t("live_chat.overlay.hide_badges", "Ocultar badges")
                    : t("live_chat.overlay.show_badges", "Mostrar badges")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.setOverlayLocked(!locked)
                  }
                >
                  {locked ? <Unlock /> : <Lock />}
                  {locked
                    ? t("live_chat.overlay.unlock", "Desfixar")
                    : t("live_chat.overlay.lock", "Fixar")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.setOverlayAlwaysOnTop(
                      !alwaysOnTop,
                    )
                  }
                >
                  {alwaysOnTop ? <PinOff /> : <Pin />}
                  {alwaysOnTop
                    ? t(
                        "live_chat.overlay.disable_always_on_top",
                        "Desativar sempre no topo",
                      )
                    : t(
                        "live_chat.overlay.enable_always_on_top",
                        "Ativar sempre no topo",
                      )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.updateSettings({
                      overlay: { showProvider: !showProvider },
                    })
                  }
                >
                  <Radio />
                  {showProvider
                    ? t("live_chat.overlay.hide_provider", "Ocultar provedor")
                    : t("live_chat.overlay.show_provider", "Mostrar provedor")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.updateSettings({
                      overlay: { showChannel: !showChannel },
                    })
                  }
                >
                  <Hash />
                  {showChannel
                    ? t("live_chat.overlay.hide_channel", "Ocultar canal")
                    : t("live_chat.overlay.show_channel", "Mostrar canal")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void clear()}>
                  <Trash2 />
                  {t("live_chat.overlay.clear", "Limpar")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    void window.underdeck.liveChat.closeOverlay(scope)
                  }
                >
                  <X />
                  {t("common.close", "Fechar")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <section
            ref={scrollViewportRef}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1 [overflow-anchor:none] [scrollbar-color:#52525b_#000] [scrollbar-width:thin]"
          >
            <div ref={scrollContentRef} className="min-h-full">
              {displayEvents.length === 0 ? (
                <div className="grid h-full min-h-[calc(100vh-2.25rem)] place-items-center px-6 text-center text-sm text-zinc-500">
                  <div className="rounded-xl bg-black/60 p-4 backdrop-blur-sm">
                    <Loader2 size={40} className="mx-auto mb-2 animate-spin" />
                    <p>
                      {paused
                        ? t(
                            "live_chat.overlay.paused_hint",
                            "O chat está pausado.",
                          )
                        : t(
                            "live_chat.overlay.waiting",
                            "Aguardando mensagens do chat...",
                          )}
                    </p>
                  </div>
                </div>
              ) : (
                displayEvents.map((event) => (
                  <ChatRow
                    key={`${event.id}-${event.timestamp}-${event.event}`}
                    event={event}
                  />
                ))
              )}
            </div>
          </section>
        </main>
      </ContextMenuTrigger>
      <ContextMenuContent className="black bg-zinc-950 text-white">
        <MenuItems scope={scope} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
