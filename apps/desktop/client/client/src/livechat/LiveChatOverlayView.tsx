import {
  Fragment,
  memo,
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
  CircleUserRound,
  Gift,
  Hash,
  Heart,
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
  UserPlus,
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
  "gift",
  "member",
  "like",
  "social",
  "join",
  "follow",
  "share",
  "subscribe",
  "streamEnd",
]);

function getOverlayScopeState(
  settings: LiveChatSettings | null | undefined,
  scope: "combined" | "twitch" | "tiktok",
) {
  return (
    settings?.overlay.scopeStates?.[scope] ?? {
      paused: Boolean(settings?.overlay.paused),
      locked: Boolean(settings?.overlay.locked),
      alwaysOnTop: settings?.overlay.alwaysOnTop !== false,
    }
  );
}

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
    event.author?.displayName ||
    event.author?.username ||
    (typeof args[1] === "string"
      ? args[1]
      : typeof args[0] === "string" && !String(args[0]).startsWith("#")
        ? args[0]
        : "");
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

function nestedImageUrl(value: unknown): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = nestedImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = nestedImageUrl(child);
    if (found) return found;
  }
  return null;
}

function TikTokBadges({ event, enabled }: { event: LiveChatEvent; enabled: boolean }) {
  if (!enabled || !event.author?.badges?.length) return null;
  return (
    <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
      {event.author.badges.slice(0, 6).map((badge, index) => {
        const url = nestedImageUrl(badge);
        return url ? (
          <img
            key={`${url}-${index}`}
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-4 w-auto object-contain"
          />
        ) : null;
      })}
    </span>
  );
}

function eventSource(
  event: LiveChatEvent,
  settings: LiveChatSettings | undefined,
) {
  const channel = String(event.channel ?? "")
    .replace(/^#/, "")
    .toLowerCase();
  const appearance: LiveChatChannelAppearance | undefined =
    event.provider === "tiktok"
      ? settings?.tiktok.accountOverrides[channel]
      : settings?.twitch.channelOverrides[channel];
  return {
    channel,
    label: appearance?.label || channel,
    icon: appearance?.icon ?? event.channelAvatarUrl ?? null,
  };
}

function providerDisplay(
  settings: LiveChatSettings | undefined,
  provider: LiveChatEvent["provider"],
) {
  return provider === "tiktok"
    ? settings?.tiktok.display
    : settings?.twitch.display;
}

function EventSource({
  event,
  settings,
}: {
  event: LiveChatEvent;
  settings: LiveChatSettings | undefined;
}) {
  const source = eventSource(event, settings);
  const display = providerDisplay(settings, event.provider);
  const showProvider = display?.showProvider !== false;
  const showChannel = display?.showChannel !== false && source.channel;
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
          ) : null}
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
  const showTimestamp =
    providerDisplay(settings, event.provider)?.showTimestamp !== false;
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
        {providerDisplay(settings, event.provider)?.showAvatar !== false &&
        event.author?.avatarUrl ? (
          <img
            src={event.author.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="mt-0.5 size-5 shrink-0 rounded-full object-cover"
          />
        ) : null}
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

const ChatRow = memo(function ChatRow({
  event,
  settings,
}: {
  event: LiveChatEvent;
  settings: LiveChatSettings | undefined;
}) {
  const { t, locale } = useI18n();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(event.timestamp);
  const display = providerDisplay(settings, event.provider);
  const showTimestamp = display?.showTimestamp !== false;
  const showAvatar = display?.showAvatar !== false;
  const showBadges = display?.showBadges !== false;
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
        {showAvatar && event.author?.avatarUrl ? (
          <img
            src={event.author.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="mr-1 inline-block size-5 rounded-full object-cover align-middle"
          />
        ) : null}
        {formatSystemEvent(event, t)}
      </div>
    );
  }

  const displayName = String(
    event.author?.displayName ||
      event.author?.username ||
      event.tags?.["display-name"] ||
      event.tags?.username ||
      t("live_chat.overlay.unknown_user", "Usuário"),
  );
  const color = String(event.author?.color || event.tags?.color || "#a78bfa");
  return (
    <div className="break-words px-2 py-1 text-[15px] leading-6 text-white">
      {showTimestamp ? (
        <span className="mr-1.5 text-xs text-zinc-500">{time}</span>
      ) : null}
      <EventSource event={event} settings={settings} />
      {showAvatar && event.author?.avatarUrl ? (
        <img
          src={event.author.avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="mr-1 inline-block size-5 rounded-full object-cover align-middle"
        />
      ) : null}
      {event.provider === "twitch" ? (
        <TwitchBadges tags={event.tags} enabled={showBadges} />
      ) : (
        <TikTokBadges event={event} enabled={showBadges} />
      )}
      <span className="mr-1.5 font-bold" style={{ color }}>
        {displayName}:
      </span>
      <span>
        {event.provider === "twitch"
          ? renderTwitchMessage(event.message ?? "", event.tags)
          : event.message ?? ""}
      </span>
    </div>
  );
});

function MenuItems({ scope }: { scope: "combined" | "twitch" | "tiktok" }) {
  const { t } = useI18n();
  const { state, clear } = useLiveChat();
  const scopeState = getOverlayScopeState(state?.settings, scope);
  const paused = scopeState.paused;
  const locked = scopeState.locked;
  const alwaysOnTop = scopeState.alwaysOnTop;
  const activeDisplay =
    scope === "tiktok"
      ? state?.settings.tiktok.display
      : state?.settings.twitch.display;
  const showTimestamp = activeDisplay?.showTimestamp !== false;
  const showAvatar = activeDisplay?.showAvatar !== false;
  const showBadges = activeDisplay?.showBadges !== false;
  const showProvider = activeDisplay?.showProvider !== false;
  const showChannel = activeDisplay?.showChannel !== false;
  const showJoinEvents = activeDisplay?.showJoinEvents !== false;
  const showFollowEvents = activeDisplay?.showFollowEvents !== false;
  const tiktokDisplay =
    scope === "tiktok" ? state?.settings.tiktok.display : undefined;
  const showLikeEvents = tiktokDisplay?.showLikeEvents !== false;
  const showGiftEvents = tiktokDisplay?.showGiftEvents !== false;
  const updateDisplay = (patch: Record<string, boolean>) =>
    window.underdeck.liveChat.updateSettings((
      scope === "combined"
        ? { twitch: { display: patch }, tiktok: { display: patch } }
        : ({ [scope]: { display: patch } } as any)) as any,
    );
  const close = () => void window.underdeck.liveChat.closeOverlay(scope);
  const pause = () => void window.underdeck.liveChat.setOverlayPaused(!paused, scope);
  const lock = () => void window.underdeck.liveChat.setOverlayLocked(!locked, scope);
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
          void window.underdeck.liveChat.setOverlayAlwaysOnTop(!alwaysOnTop, scope)
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
          void updateDisplay({ showTimestamp: !showTimestamp })
        }
      >
        <Clock3 />
        {showTimestamp
          ? t("live_chat.overlay.hide_timestamp", "Ocultar horário")
          : t("live_chat.overlay.show_timestamp", "Mostrar horário")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => void updateDisplay({ showAvatar: !showAvatar })}
      >
        <CircleUserRound />
        {showAvatar
          ? t("live_chat.overlay.hide_avatar", "Ocultar avatar")
          : t("live_chat.overlay.show_avatar", "Mostrar avatar")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void updateDisplay({ showBadges: !showBadges })
        }
      >
        <Award />
        {showBadges
          ? t("live_chat.overlay.hide_badges", "Ocultar badges")
          : t("live_chat.overlay.show_badges", "Mostrar badges")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void updateDisplay({ showProvider: !showProvider })
        }
      >
        <Radio />
        {showProvider
          ? t("live_chat.overlay.hide_provider", "Ocultar provedor")
          : t("live_chat.overlay.show_provider", "Mostrar provedor")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void updateDisplay({ showChannel: !showChannel })
        }
      >
        <Hash />
        {showChannel
          ? t("live_chat.overlay.hide_channel", "Ocultar canal")
          : t("live_chat.overlay.show_channel", "Mostrar canal")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void updateDisplay({ showJoinEvents: !showJoinEvents })
        }
      >
        <UserPlus />
        {showJoinEvents
          ? t("live_chat.overlay.hide_join_events", "Ocultar entradas")
          : t("live_chat.overlay.show_join_events", "Mostrar entradas")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() =>
          void updateDisplay({ showFollowEvents: !showFollowEvents })
        }
      >
        <Heart />
        {showFollowEvents
          ? t("live_chat.overlay.hide_follow_events", "Ocultar follows")
          : t("live_chat.overlay.show_follow_events", "Mostrar follows")}
      </ContextMenuItem>
      {scope === "tiktok" ? (
        <>
          <ContextMenuItem
            onSelect={() =>
              void updateDisplay({ showLikeEvents: !showLikeEvents })
            }
          >
            <Heart />
            {showLikeEvents
              ? t("live_chat.overlay.hide_like_events", "Ocultar likes")
              : t("live_chat.overlay.show_like_events", "Mostrar likes")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              void updateDisplay({ showGiftEvents: !showGiftEvents })
            }
          >
            <Gift />
            {showGiftEvents
              ? t("live_chat.overlay.hide_gift_events", "Ocultar gifts")
              : t("live_chat.overlay.show_gift_events", "Mostrar gifts")}
          </ContextMenuItem>
        </>
      ) : null}
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
  const scopeState = getOverlayScopeState(state?.settings, scope);
  const paused = scopeState.paused;
  const locked = scopeState.locked;
  const alwaysOnTop = scopeState.alwaysOnTop;
  const activeDisplay =
    scope === "tiktok"
      ? state?.settings.tiktok.display
      : state?.settings.twitch.display;
  const showTimestamp = activeDisplay?.showTimestamp !== false;
  const showAvatar = activeDisplay?.showAvatar !== false;
  const showBadges = activeDisplay?.showBadges !== false;
  const showProvider = activeDisplay?.showProvider !== false;
  const showChannel = activeDisplay?.showChannel !== false;
  const showJoinEvents = activeDisplay?.showJoinEvents !== false;
  const showFollowEvents = activeDisplay?.showFollowEvents !== false;
  const tiktokDisplay =
    scope === "tiktok" ? state?.settings.tiktok.display : undefined;
  const showLikeEvents = tiktokDisplay?.showLikeEvents !== false;
  const showGiftEvents = tiktokDisplay?.showGiftEvents !== false;
  const updateDisplay = (patch: Record<string, boolean>) =>
    window.underdeck.liveChat.updateSettings(
      scope === "combined"
        ? { twitch: { display: patch }, tiktok: { display: patch } }
        : { [scope]: { display: patch } },
    );
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
          const overrides =
            event.provider === "tiktok"
              ? state?.settings.tiktok.accountOverrides
              : state?.settings.twitch.channelOverrides;
          const channel = String(event.channel ?? "")
            .replace(/^#/, "")
            .toLowerCase();
          const display = providerDisplay(state?.settings, event.provider);
          // Twitch calls this event `join`; TikTok calls the equivalent
          // presence event `member`.
          if ((event.event === "join" || event.event === "member") && display?.showJoinEvents === false) {
            return false;
          }
          if (event.event === "follow" && display?.showFollowEvents === false) {
            return false;
          }
          if (
            event.provider === "tiktok" &&
            event.event === "like" &&
            state?.settings.tiktok.display.showLikeEvents === false
          ) {
            return false;
          }
          if (
            event.provider === "tiktok" &&
            event.event === "gift" &&
            state?.settings.tiktok.display.showGiftEvents === false
          ) {
            return false;
          }
          return (
            overrides?.[channel]?.eventsEnabled !== false
          );
        })
        .slice(-maxMessages),
    [
      events,
      maxMessages,
      state?.settings.tiktok.accountOverrides,
      state?.settings.twitch.channelOverrides,
      state?.settings.twitch.display,
      state?.settings.tiktok.display,
    ],
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
                : scope === "tiktok"
                  ? "TikTok"
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
                    void window.underdeck.liveChat.setOverlayPaused(!paused, scope)
                  }
                >
                  {paused ? <Play /> : <Pause />}
                  {paused
                    ? t("live_chat.overlay.resume", "Retomar")
                    : t("live_chat.overlay.pause", "Pausar")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void updateDisplay({ showTimestamp: !showTimestamp })
                  }
                >
                  <Clock3 />
                  {showTimestamp
                    ? t("live_chat.overlay.hide_timestamp", "Ocultar horário")
                    : t("live_chat.overlay.show_timestamp", "Mostrar horário")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void updateDisplay({ showAvatar: !showAvatar })
                  }
                >
                  <CircleUserRound />
                  {showAvatar
                    ? t("live_chat.overlay.hide_avatar", "Ocultar avatar")
                    : t("live_chat.overlay.show_avatar", "Mostrar avatar")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void updateDisplay({ showBadges: !showBadges })
                  }
                >
                  <Award />
                  {showBadges
                    ? t("live_chat.overlay.hide_badges", "Ocultar badges")
                    : t("live_chat.overlay.show_badges", "Mostrar badges")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void window.underdeck.liveChat.setOverlayLocked(!locked, scope)
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
                       scope,
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
                    void updateDisplay({ showProvider: !showProvider })
                  }
                >
                  <Radio />
                  {showProvider
                    ? t("live_chat.overlay.hide_provider", "Ocultar provedor")
                    : t("live_chat.overlay.show_provider", "Mostrar provedor")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void updateDisplay({ showChannel: !showChannel })
                  }
                >
                  <Hash />
                  {showChannel
                    ? t("live_chat.overlay.hide_channel", "Ocultar canal")
                    : t("live_chat.overlay.show_channel", "Mostrar canal")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void updateDisplay({ showJoinEvents: !showJoinEvents })
                  }
                >
                  <UserPlus />
                  {showJoinEvents
                    ? t("live_chat.overlay.hide_join_events", "Ocultar entradas")
                    : t("live_chat.overlay.show_join_events", "Mostrar entradas")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void updateDisplay({ showFollowEvents: !showFollowEvents })
                  }
                >
                  <Heart />
                  {showFollowEvents
                    ? t("live_chat.overlay.hide_follow_events", "Ocultar follows")
                    : t("live_chat.overlay.show_follow_events", "Mostrar follows")}
                </DropdownMenuItem>
                {scope === "tiktok" ? (
                  <>
                    <DropdownMenuItem
                      onClick={() =>
                        void updateDisplay({ showLikeEvents: !showLikeEvents })
                      }
                    >
                      <Heart />
                      {showLikeEvents
                        ? t("live_chat.overlay.hide_like_events", "Ocultar likes")
                        : t("live_chat.overlay.show_like_events", "Mostrar likes")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void updateDisplay({ showGiftEvents: !showGiftEvents })
                      }
                    >
                      <Gift />
                      {showGiftEvents
                        ? t("live_chat.overlay.hide_gift_events", "Ocultar gifts")
                        : t("live_chat.overlay.show_gift_events", "Mostrar gifts")}
                    </DropdownMenuItem>
                  </>
                ) : null}
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
                    settings={state?.settings}
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
