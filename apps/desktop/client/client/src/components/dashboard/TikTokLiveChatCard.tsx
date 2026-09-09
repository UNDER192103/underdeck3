import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  CircleUserRound,
  Clock3,
  Eye,
  EyeOff,
  Gift,
  Hash,
  Heart,
  ImageOff,
  ImagePlus,
  Loader2,
  PlugZap,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Unplug,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useLiveChat } from "@/contexts/LiveChatContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LiveChatProviderIcon } from "@/components/icons/LiveChatProviderIcon";
import type { TikTokLiveChatAccountAppearance } from "@/types/electron";

const normalizeAccount = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?tiktok\.com\/@/i, "")
    .replace(/\/live\/?$/i, "")
    .replace(/^@/, "")
    .toLowerCase();

// The Events switch is persisted immediately, so it must not make the
// provider's manual-save form appear dirty. Keep the remaining account
// settings in this comparison (including the per-account live check).
const comparableAccountOverrides = (
  value: Record<string, TikTokLiveChatAccountAppearance> | undefined,
) =>
  Object.fromEntries(
    Object.entries(value ?? {}).map(([account, appearance]) => [account, {
      label: appearance?.label ?? "",
      icon: appearance?.icon ?? null,
      waitForLive: appearance?.waitForLive !== false,
    }]),
  );

export function TikTokLiveChatCard() {
  const { t } = useI18n();
  const { state, refresh } = useLiveChat();
  const settings = state?.settings;
  const provider = state?.providers.tiktok;
  const [accounts, setAccounts] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<
    Record<string, TikTokLiveChatAccountAppearance>
  >({});
  const [autoConnectAccounts, setAutoConnectAccounts] = useState(true);
  const [reconnect, setReconnect] = useState(true);
  const [offlineInterval, setOfflineInterval] = useState("30");
  const [search, setSearch] = useState("");
  const [candidate, setCandidate] = useState("");
  const [candidateTouched, setCandidateTouched] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const autoPersistEventsRef = useRef(false);

  useEffect(() => {
    if (!settings) return;
    setAccounts(settings.tiktok.accounts);
    setAutoConnectAccounts(settings.tiktok.autoConnectAccounts);
    setReconnect(settings.tiktok.reconnect);
    setOfflineInterval(String(settings.tiktok.offlineCheckIntervalSeconds));
  }, [
    settings?.tiktok.accounts.join("|"),
    settings?.tiktok.autoConnectAccounts,
    settings?.tiktok.reconnect,
    settings?.tiktok.offlineCheckIntervalSeconds,
  ]);

  useEffect(() => {
    if (!settings) return;
    if (autoPersistEventsRef.current) {
      autoPersistEventsRef.current = false;
      return;
    }
    setOverrides(settings.tiktok.accountOverrides);
  }, [settings?.tiktok.accountOverrides]);

  const run = async (
    key: string,
    action: () => Promise<{ ok: boolean; message: string; code?: string }>,
  ) => {
    setBusy(key);
    try {
      const result = await action();
      const description = result.code
        ? t(result.code, result.message)
        : result.message;
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
      return result;
    } finally {
      setBusy(null);
    }
  };

  const patch = async (
    patchValue: Parameters<typeof window.underdeck.liveChat.updateSettings>[0],
  ) => {
    const result = await window.underdeck.liveChat.updateSettings(patchValue);
    if (!result.ok)
      toast.error(t("live_chat.settings.save_failed", "Não foi possível salvar."), {
        description: result.code ? t(result.code, result.message) : result.message,
      });
    await refresh();
    return result;
  };

  const normalized = normalizeAccount(candidate);
  const candidateError = !normalized
    ? t("live_chat.tiktok.account_required", "Informe a conta do TikTok.")
    : !/^[a-z0-9._]{2,30}$/.test(normalized)
      ? t("live_chat.tiktok.account_invalid", "Informe um usuário ou URL válida do TikTok.")
      : accounts.includes(normalized)
        ? t("live_chat.tiktok.account_duplicate", "Esta conta já foi adicionada.")
        : null;

  const addAccount = () => {
    setCandidateTouched(true);
    if (candidateError) return;
    setAccounts((current) => [...current, normalized]);
    setOverrides((current) => ({
      ...current,
      [normalized]: {
        label: "",
        icon: null,
        eventsEnabled: true,
        waitForLive: true,
      },
    }));
    setCandidate("");
    setCandidateTouched(false);
    setDialogOpen(false);
  };

  const updateAppearance = (
    account: string,
    value: Partial<TikTokLiveChatAccountAppearance>,
  ) =>
    setOverrides((current) => ({
      ...current,
      [account]: {
        label: current[account]?.label ?? "",
        icon: current[account]?.icon ?? null,
        eventsEnabled: current[account]?.eventsEnabled !== false,
        waitForLive: current[account]?.waitForLive !== false,
        ...value,
      },
    }));

  const setAccountEventsEnabled = async (account: string, eventsEnabled: boolean) => {
    const previous = overrides;
    const next = {
      ...overrides,
      [account]: {
        label: overrides[account]?.label ?? "",
        icon: overrides[account]?.icon ?? null,
        eventsEnabled,
        waitForLive: overrides[account]?.waitForLive !== false,
      },
    };
    setOverrides(next);
    autoPersistEventsRef.current = true;
    const result = await window.underdeck.liveChat.updateSettings({
      tiktok: { accountOverrides: next },
    });
    if (!result.ok) {
      autoPersistEventsRef.current = false;
      setOverrides(previous);
      toast.error(t("live_chat.settings.save_failed", "Não foi possível salvar."), {
        description: result.code ? t(result.code, result.message) : result.message,
      });
    }
  };

  const removeAccount = (account: string) => {
    setAccounts((current) => current.filter((item) => item !== account));
    setOverrides((current) => {
      const next = { ...current };
      delete next[account];
      return next;
    });
  };

  const selectIcon = async (account: string) => {
    const selected = await window.underdeck.dialog.selectFile({
      title: t("live_chat.tiktok.account_icon_select", "Selecionar imagem ou GIF da conta"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [{ name: t("common.images", "Imagens"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    const url = await window.underdeck.media.importFileToMediaUrl(
      selected,
      "live-chat-channel-icons",
    );
    if (url) updateAppearance(account, { icon: url });
  };

  const persist = () =>
    window.underdeck.liveChat.updateSettings({
      tiktok: {
        accounts,
        accountOverrides: overrides,
        autoConnectAccounts,
        reconnect,
        offlineCheckIntervalSeconds: Math.max(30, Number(offlineInterval) || 30),
      },
    });

  const hasChanges = Boolean(
    settings &&
      (JSON.stringify(accounts) !== JSON.stringify(settings.tiktok.accounts) ||
        JSON.stringify(comparableAccountOverrides(overrides)) !==
          JSON.stringify(comparableAccountOverrides(settings.tiktok.accountOverrides)) ||
        autoConnectAccounts !== settings.tiktok.autoConnectAccounts ||
        reconnect !== settings.tiktok.reconnect ||
        Math.max(30, Number(offlineInterval) || 30) !==
          settings.tiktok.offlineCheckIntervalSeconds),
  );

  const connectAll = () =>
    run("connect-all", async () => {
      if (hasChanges) {
        const saved = await persist();
        if (!saved.ok) return saved;
      }
      return window.underdeck.liveChat.connect("tiktok");
    });

  const applyAndReconnect = () =>
    run("reconnect-all", async () => {
      const saved = await persist();
      if (!saved.ok) return saved;
      await window.underdeck.liveChat.disconnect("tiktok");
      return window.underdeck.liveChat.connect("tiktok");
    });

  const filtered = useMemo(() => {
    const query = search.trim().replace(/^@/, "").toLowerCase();
    if (!query) return accounts;
    return accounts.filter(
      (account) =>
        account.includes(query) ||
        (overrides[account]?.label ?? "").toLowerCase().includes(query),
    );
  }, [accounts, overrides, search]);

  const statusText = provider?.connecting
    ? t("live_chat.status.connecting", "Conectando")
    : provider?.waitingForLive
      ? t("live_chat.status.waiting_live", "Aguardando live")
      : provider?.reconnecting
        ? t("live_chat.status.reconnecting", "Reconectando")
        : provider?.connected
          ? t("live_chat.status.connected", "Conectado")
          : t("live_chat.status.disconnected", "Desconectado");

  return (
    <Card className="grid gap-4 border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LiveChatProviderIcon provider="tiktok" className="size-5" />
          <div>
            <Label>TikTok</Label>
            <p className="text-xs text-muted-foreground">
              {t("live_chat.tiktok.description", "Uma conexão independente para cada conta monitorada.")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={provider?.connected ? "default" : "secondary"}>
            {provider?.connecting || provider?.reconnecting || provider?.waitingForLive ? (
              <Loader2 className="mr-1 animate-spin" />
            ) : (
              <Radio className="mr-1" />
            )}
            {statusText}
          </Badge>
          {provider?.connected || provider?.connecting || provider?.waitingForLive ? (
            <Button rounded="xl" variant="outline-destructive" disabled={busy === "disconnect-all"} onClick={() => void run("disconnect-all", () => window.underdeck.liveChat.disconnect("tiktok"))}>
              {busy === "disconnect-all" ? <Loader2 className="animate-spin" /> : <Unplug />}
              {t("live_chat.disconnect_all", "Desconectar todos")}
            </Button>
          ) : (
            <Button rounded="xl" disabled={busy === "connect-all" || !settings?.enabled || !settings?.tiktok.enabled} onClick={() => void connectAll()}>
              {busy === "connect-all" ? <Loader2 className="animate-spin" /> : <PlugZap />}
              {t("live_chat.connect_all", "Conectar todos")}
            </Button>
          )}
          <Switch checked={Boolean(settings?.tiktok.enabled)} disabled={!settings?.enabled} onCheckedChange={(enabled) => void patch({ tiktok: { enabled } })} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div>
            <Label>{t("live_chat.tiktok.auto_connect", "Conectar contas automaticamente")}</Label>
            <p className="text-xs text-muted-foreground">{t("live_chat.tiktok.auto_connect_desc", "Conecta as contas ao ativar o provedor ou adicionar uma nova conta.")}</p>
          </div>
          <Switch checked={autoConnectAccounts} onCheckedChange={setAutoConnectAccounts} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div>
            <Label>{t("live_chat.tiktok.reconnect", "Reconectar automaticamente")}</Label>
            <p className="text-xs text-muted-foreground">{t("live_chat.tiktok.reconnect_desc", "Tenta recuperar em 5 segundos após uma queda.")}</p>
          </div>
          <Switch checked={reconnect} onCheckedChange={setReconnect} />
        </div>
        <div className="grid gap-2 rounded-xl border p-3">
          <Label htmlFor="tiktok-offline-interval">{t("live_chat.tiktok.offline_interval", "Verificar contas offline a cada (segundos)")}</Label>
          <Input id="tiktok-offline-interval" rounded="xl" type="number" min={30} value={offlineInterval} onChange={(event) => setOfflineInterval(event.target.value)} />
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-border/70 bg-background/20 p-3">
        <Label>{t("live_chat.provider.overlay_display", "Exibição no overlay")}</Label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {([
            ["showTimestamp", Clock3, "live_chat.overlay.show_timestamp", "Mostrar horário"],
            ["showAvatar", CircleUserRound, "live_chat.overlay.show_avatar", "Mostrar avatar"],
            ["showBadges", Award, "live_chat.overlay.show_badges", "Mostrar badges"],
            ["showProvider", Radio, "live_chat.overlay.show_provider", "Mostrar provedor"],
            ["showChannel", Hash, "live_chat.overlay.show_channel", "Mostrar canal"],
            ["showJoinEvents", UserPlus, "live_chat.overlay.show_join_events", "Mostrar entradas"],
            ["showFollowEvents", Heart, "live_chat.overlay.show_follow_events", "Mostrar follows"],
            ["showLikeEvents", Heart, "live_chat.overlay.show_like_events", "Mostrar likes"],
            ["showGiftEvents", Gift, "live_chat.overlay.show_gift_events", "Mostrar gifts"],
          ] as const).map(([key, Icon, translation, fallback]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
              <div className="flex items-center gap-2"><Icon /><Label>{t(translation, fallback)}</Label></div>
              <Switch checked={settings?.tiktok.display[key] !== false} onCheckedChange={(value) => void patch({ tiktok: { display: { [key]: value } as any } })} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>{t("live_chat.tiktok.accounts", "Contas monitoradas")}</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input rounded="xl" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder={t("live_chat.tiktok.search_accounts", "Buscar conta ou rótulo...")} />
          </div>
          <Button type="button" rounded="xl" variant="outline-primary" className="shrink-0" onClick={() => setDialogOpen(true)}><Plus />{t("live_chat.tiktok.add_account", "Adicionar")}</Button>
        </div>
        <div className="grid max-h-80 min-h-9 gap-2 overflow-y-auto rounded-xl border p-4 [scrollbar-width:thin]">
          {filtered.length === 0 ? <span className="text-xs text-muted-foreground">{t("live_chat.tiktok.no_accounts", "Nenhuma conta encontrada.")}</span> : filtered.map((account) => {
            const appearance = overrides[account] ?? { label: "", icon: null, eventsEnabled: true, waitForLive: true };
            const accountState = provider?.accounts[account];
            const active = accountState?.connected || accountState?.connecting || accountState?.waitingForLive || accountState?.reconnecting;
            const accountStatusText = accountState?.connecting
              ? t("live_chat.status.connecting", "Conectando")
              : accountState?.waitingForLive
                ? t("live_chat.status.waiting_live", "Aguardando live")
                : accountState?.reconnecting
                  ? t("live_chat.status.reconnecting", "Reconectando")
                  : accountState?.connected
                    ? t("live_chat.status.connected", "Conectado")
                    : t("live_chat.status.disconnected", "Desconectado");
            const accountStatusBusy = Boolean(
              accountState?.connecting ||
                accountState?.waitingForLive ||
                accountState?.reconnecting,
            );
            return (
              <div key={account} className="grid gap-3 rounded-xl border border-border/70 bg-background/35 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {appearance.icon ? <img src={appearance.icon} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Hash /></span>}
                    <Badge variant={accountState?.connected ? "default" : "secondary"}>@{account}</Badge>
                    <Badge variant={accountState?.connected ? "default" : "secondary"}>
                      {accountStatusBusy ? <Loader2 className="animate-spin" /> : <Radio />}
                      {accountStatusText}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-xl border px-2 py-1.5">{appearance.eventsEnabled ? <Eye /> : <EyeOff />}<Label className="text-xs">{t("live_chat.twitch.channel_events", "Eventos")}</Label><Switch checked={appearance.eventsEnabled !== false} onCheckedChange={(eventsEnabled) => void setAccountEventsEnabled(account, eventsEnabled)} /></div>
                    <div className="flex items-center gap-2 rounded-xl border px-2 py-1.5"><Clock3 /><Label className="text-xs">{t("live_chat.tiktok.wait_live", "Aguardar live")}</Label><Switch checked={appearance.waitForLive !== false} onCheckedChange={(waitForLive) => updateAppearance(account, { waitForLive })} /></div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-end">
                  <Input rounded="xl" className="min-w-0 flex-1" value={appearance.label} onChange={(event) => updateAppearance(account, { label: event.target.value })} placeholder={t("live_chat.twitch.channel_label_placeholder", "Rótulo, emoji ou texto alternativo")} />
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Tooltip><TooltipTrigger asChild><Button type="button" rounded="xl" variant="outline-primary" onClick={() => void selectIcon(account)}><ImagePlus /></Button></TooltipTrigger><TooltipContent>{t("live_chat.twitch.channel_icon", "Imagem/GIF")}</TooltipContent></Tooltip>
                    {appearance.icon ? <Tooltip><TooltipTrigger asChild><Button type="button" rounded="xl" variant="outline-destructive" onClick={() => updateAppearance(account, { icon: null })}><ImageOff /></Button></TooltipTrigger><TooltipContent>{t("live_chat.twitch.remove_channel_icon", "Sem imagem")}</TooltipContent></Tooltip> : null}
                    {active ? <Tooltip><TooltipTrigger asChild><Button type="button" rounded="xl" variant="outline-destructive" onClick={() => void run(`disconnect-${account}`, () => window.underdeck.liveChat.disconnect("tiktok", account))}>{busy === `disconnect-${account}` ? <Loader2 className="animate-spin" /> : <Unplug />}</Button></TooltipTrigger><TooltipContent>{t("live_chat.disconnect", "Desconectar")}</TooltipContent></Tooltip> : <Tooltip><TooltipTrigger asChild><Button type="button" rounded="xl" variant="outline-primary" disabled={!settings?.enabled || !settings?.tiktok.enabled} onClick={() => void run(`connect-${account}`, async () => { if (hasChanges) { const saved = await persist(); if (!saved.ok) return saved; } return window.underdeck.liveChat.connect("tiktok", account); })}>{busy === `connect-${account}` ? <Loader2 className="animate-spin" /> : <PlugZap />}</Button></TooltipTrigger><TooltipContent>{t("live_chat.connect", "Conectar")}</TooltipContent></Tooltip>}
                    <Tooltip><TooltipTrigger asChild><Button type="button" rounded="xl" variant="outline-destructive" onClick={() => removeAccount(account)}><Trash2 /></Button></TooltipTrigger><TooltipContent>{t("live_chat.tiktok.remove_account", "Remover conta")}</TooltipContent></Tooltip>
                  </div>
                </div>
                {accountState?.lastError ? <p className="text-xs text-destructive">{accountState.lastError}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasChanges ? <div className="mr-auto flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-500"><TriangleAlert />{t("live_chat.settings.unsaved_changes", "Existem alterações pendentes. Salve para aplicá-las.")}</div> : null}
        {activeProvider(provider) && hasChanges ? <Button type="button" rounded="xl" variant="outline-primary" disabled={busy === "reconnect-all"} onClick={() => void applyAndReconnect()}>{busy === "reconnect-all" ? <Loader2 className="animate-spin" /> : <RotateCcw />}{t("live_chat.apply_reconnect", "Aplicar e reconectar")}</Button> : null}
        <Button type="button" rounded="xl" disabled={!hasChanges || busy === "save-tiktok"} onClick={() => void run("save-tiktok", persist)}>{busy === "save-tiktok" ? <Loader2 className="animate-spin" /> : <Save />}{t("common.save", "Salvar")}</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setCandidate(""); setCandidateTouched(false); } }}>
        <DialogContent className="border-border/80 bg-popover/95 backdrop-blur-2xl sm:max-w-md">
          <DialogHeader><DialogTitle>{t("live_chat.tiktok.add_account_title", "Adicionar conta TikTok")}</DialogTitle><DialogDescription>{t("live_chat.tiktok.add_account_desc", "Informe o @usuário ou a URL da live.")}</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label htmlFor="tiktok-account">{t("live_chat.tiktok.account", "Conta")}</Label><Input id="tiktok-account" rounded="xl" autoFocus value={candidate} aria-invalid={candidateTouched && Boolean(candidateError)} onChange={(event) => setCandidate(event.target.value)} onBlur={() => setCandidateTouched(true)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAccount(); } }} placeholder="@felipeee.oficial" />{candidateTouched && candidateError ? <p className="text-xs text-destructive">{candidateError}</p> : null}</div>
          <DialogFooter><Button type="button" rounded="xl" variant="outline-destructive" onClick={() => setDialogOpen(false)}><X />{t("common.cancel", "Cancelar")}</Button><Button type="button" rounded="xl" disabled={Boolean(candidateError)} onClick={addAccount}><Plus />{t("live_chat.tiktok.add_account", "Adicionar")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function activeProvider(
  provider:
    | {
        connected: boolean;
        connecting: boolean;
        reconnecting: boolean;
        waitingForLive: boolean;
      }
    | undefined,
) {
  return Boolean(
    provider?.connected ||
      provider?.connecting ||
      provider?.reconnecting ||
      provider?.waitingForLive,
  );
}
