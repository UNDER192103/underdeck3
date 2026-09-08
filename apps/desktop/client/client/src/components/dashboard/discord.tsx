import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleUserRound, Gamepad2, Loader2, Mic, MicOff, PlugZap, RefreshCw, Save, Unplug, Volume2, VolumeX, X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, InputPassword } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import type { DiscordState } from "@/types/electron";

export default function Discord({ className = "backdrop-blur" }: { className?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<DiscordState | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bridgeAvailable, setBridgeAvailable] = useState(() => Boolean(window.underdeck?.discord));

  const getDiscordApi = () => {
    const api = window.underdeck?.discord;
    if (!api) setBridgeAvailable(false);
    return api;
  };

  const formatDiscordError = (message: string | null | undefined) => {
    if (!message) return "";
    if (/invalid_scope/i.test(message)) {
      return t(
        "discord.error.rpc_scope_restricted",
        "O Discord recusou o escopo RPC desta aplicação. Para testar, sua conta precisa ter acesso autorizado ao RPC (aplicação aprovada ou conta adicionada como testadora/desenvolvedora)."
      );
    }
    return message;
  };

  const loadState = async () => {
    const discord = getDiscordApi();
    if (!discord) return;
    setLoading(true);
    try {
      const next = await discord.getState();
      setState(next);
      setClientId(next.settings.clientId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const discord = getDiscordApi();
    if (!discord) return;
    void loadState();
    return discord.onStateChanged((next) => {
      setState(next);
    });
  }, []);

  const saveSettings = async (connectAfterSave = false) => {
    const discord = getDiscordApi();
    if (!discord) return false;
    const normalizedId = clientId.trim();
    if (!normalizedId) {
      toast.error(t("discord.settings.client_id_required", "Informe o Client ID / Application ID."));
      return false;
    }
    if (!state?.settings.hasClientSecret && !clientSecret.trim()) {
      toast.error(t("discord.settings.client_secret_required", "Informe o Client Secret."));
      return false;
    }
    setSaving(true);
    try {
      const result = await discord.updateSettings({
        clientId: normalizedId,
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      });
      if (!result.ok) {
        toast.error(t("discord.settings.save_failed", "Não foi possível salvar a configuração."), { description: result.message });
        return false;
      }
      setClientSecret("");
      await loadState();
      toast.success(t("discord.settings.saved", "Configuração do Discord salva."));
      if (connectAfterSave) {
        const connectResult = await discord.connect();
        if (!connectResult.ok) toast.error(t("discord.connect_failed", "Não foi possível conectar ao Discord."), { description: formatDiscordError(connectResult.message) });
      }
      return true;
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (key: string, action: () => Promise<{ ok: boolean; message: string }>) => {
    if (!getDiscordApi()) return;
    setBusyAction(key);
    try {
      const result = await action();
      if (result.ok) toast.success(t("discord.action_success", "Ação do Discord executada."), { description: result.message });
      else toast.error(t("discord.action_failed", "Não foi possível executar a ação."), { description: formatDiscordError(result.message) });
    } finally {
      setBusyAction(null);
    }
  };

  const connected = Boolean(state?.connected);
  const connecting = Boolean(state?.connecting);

  return (
    <div className="h-full w-full p-2 select-none">
      <Card className={`grid gap-4 p-6 bg-card/70 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#5865F2]/15 text-[#7289da]">
              <DiscordIcon className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">{t("discord.title", "Discord")}</h2>
              <p className="text-xs text-muted-foreground">{t("discord.description", "Integração local com o Discord RPC.")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? "default" : "secondary"}>
              {connecting ? <Loader2 className="mr-1 size-3 animate-spin" /> : <span className="mr-1 size-1.5 rounded-full bg-current" />}
              {connecting ? t("discord.connecting", "Conectando") : connected ? t("discord.connected", "Conectado") : t("discord.disconnected", "Desconectado")}
            </Badge>
            <Button type="button" rounded="xl" variant="secondary" onClick={() => void loadState()} disabled={loading || !bridgeAvailable}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("common.refresh", "Atualizar")}
            </Button>
            {connected ? (
              <Button type="button" rounded="xl" variant="outline-destructive" onClick={() => void runAction("disconnect", () => window.underdeck.discord.disconnect())} disabled={busyAction === "disconnect" || !bridgeAvailable}>
                {busyAction === "disconnect" ? <Loader2 className="animate-spin" /> : <Unplug />}
                {t("discord.disconnect", "Desconectar")}
              </Button>
            ) : (
              <Button type="button" rounded="xl" onClick={() => void (state?.settings.hasClientSecret ? runAction("connect", () => window.underdeck.discord.connect()) : saveSettings(true))} disabled={connecting || busyAction === "connect" || saving || !bridgeAvailable}>
                {connecting || busyAction === "connect" || saving ? <Loader2 className="animate-spin" /> : <PlugZap />}
                {t("discord.connect", "Conectar")}
              </Button>
            )}
          </div>
        </div>

        {!bridgeAvailable && (
          <Card className="border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-foreground">
            {t("discord.bridge.unavailable", "A integração Discord foi atualizada. Reinicie o processo Electron para carregar o novo preload.")}
          </Card>
        )}

        <Tabs defaultValue="control" className="grid gap-4">
          <TabsList className="w-full grid grid-cols-3 rounded-xl">
            <TabsTrigger value="control"><DiscordIcon className="size-4" /> {t("discord.tab.control", "Controle")}</TabsTrigger>
            <TabsTrigger value="settings"><Save /> {t("discord.tab.settings", "Configuração")}</TabsTrigger>
            <TabsTrigger value="tutorial"><CircleUserRound /> {t("discord.tab.tutorial", "Tutorial")}</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="flex flex-col items-center justify-center gap-3 border-border/70 bg-card/70 p-4 text-center">
                {state?.user?.avatarUrl ? <img className="size-12 rounded-full object-cover" src={state.user.avatarUrl} alt="" /> : <CircleUserRound className="size-12 text-muted-foreground" />}
                <div className="min-w-0 text-center">
                  <p className="text-xs text-muted-foreground">{t("discord.user", "Usuário Discord")}</p>
                  <p className="truncate font-medium">{state?.user?.globalName || state?.user?.username || t("discord.not_available", "Não disponível")}</p>
                </div>
              </Card>
              <Card className="flex flex-col items-center justify-center gap-3 border-border/70 bg-card/70 p-4 text-center">
                {state?.application?.iconUrl ? <img className="size-12 rounded-xl object-cover" src={state.application.iconUrl} alt="" /> : <Gamepad2 className="size-12 text-muted-foreground" />}
                <div className="min-w-0 text-center">
                  <p className="text-xs text-muted-foreground">{t("discord.application", "Aplicação conectada")}</p>
                  <p className="truncate font-medium">{state?.application?.name || t("discord.not_available", "Não disponível")}</p>
                </div>
              </Card>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="flex flex-col items-center justify-center gap-3 border-border/70 bg-card/70 p-4 text-center">
                <div className="text-center">
                  <p className="font-medium">{t("discord.microphone", "Microfone")}</p>
                  <p className="text-xs text-muted-foreground">{state?.voice.mute ? t("discord.microphone.muted", "Microfone mutado") : t("discord.microphone.unmuted", "Microfone ativo")}</p>
                </div>
                <Button type="button" rounded="xl" variant={state?.voice.mute ? "destructive" : "secondary"} disabled={!connected || busyAction === "mute"} onClick={() => void runAction("mute", () => window.underdeck.discord.toggleMute())}>
                  {busyAction === "mute" ? <Loader2 className="animate-spin" /> : state?.voice.mute ? <MicOff /> : <Mic />}
                  {state?.voice.mute ? t("discord.unmute", "Desmutar") : t("discord.mute", "Mutar")}
                </Button>
              </Card>
              <Card className="flex flex-col items-center justify-center gap-3 border-border/70 bg-card/70 p-4 text-center">
                <div className="text-center">
                  <p className="font-medium">{t("discord.audio", "Áudio")}</p>
                  <p className="text-xs text-muted-foreground">{state?.voice.deaf ? t("discord.audio.deafened", "Áudio desativado") : t("discord.audio.active", "Áudio ativo")}</p>
                </div>
                <Button type="button" rounded="xl" variant={state?.voice.deaf ? "destructive" : "secondary"} disabled={!connected || busyAction === "deafen"} onClick={() => void runAction("deafen", () => window.underdeck.discord.toggleDeafen())}>
                  {busyAction === "deafen" ? <Loader2 className="animate-spin" /> : state?.voice.deaf ? <VolumeX /> : <Volume2 />}
                  {state?.voice.deaf ? t("discord.undeafen", "Ativar áudio") : t("discord.deafen", "Desativar áudio")}
                </Button>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="grid gap-4">
            <Card className="grid gap-4 border-border/70 bg-card/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>{t("discord.startup", "Conectar ao iniciar app")}</Label>
                  <p className="text-xs text-muted-foreground">{t("discord.startup.desc", "Reconecta usando a autorização salva quando o Discord estiver aberto.")}</p>
                </div>
                <Switch checked={Boolean(state?.settings.connectOnStartup)} disabled={!bridgeAvailable} onCheckedChange={(checked) => void window.underdeck.discord.updateSettings({ connectOnStartup: Boolean(checked) }).then(() => loadState())} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discord-client-id">{t("discord.settings.client_id", "Client ID / Application ID")}</Label>
                <Input id="discord-client-id" rounded="xl" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="123456789012345678" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discord-client-secret">{t("discord.settings.client_secret", "Client Secret")}</Label>
                <InputPassword id="discord-client-secret" rounded="xl" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={state?.settings.hasClientSecret ? t("discord.settings.secret_saved", "Já salvo — deixe vazio para manter") : "••••••••••••••••"} />
                <p className="text-xs text-muted-foreground">{t("discord.settings.secret_security", "O segredo é salvo criptografado pelo Windows e não é enviado ao servidor.")}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {state?.settings.hasClientSecret && <Button type="button" variant="outline-destructive" rounded="xl" disabled={!bridgeAvailable} onClick={() => void window.underdeck.discord.updateSettings({ clearClientSecret: true }).then(() => { setClientSecret(""); void loadState(); })}><X /> {t("discord.settings.clear", "Limpar credenciais")}</Button>}
                <Button type="button" rounded="xl" disabled={saving || !bridgeAvailable} onClick={() => void saveSettings(false)}>{saving ? <Loader2 className="animate-spin" /> : <Save />} {t("common.save", "Salvar")}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="tutorial" className="grid gap-4">
            <Card className="grid gap-3 border-border/70 bg-card/70 p-4 text-sm">
              <p className="font-medium">{t("discord.tutorial.title", "Como configurar a integração")}</p>
              <ol className="grid list-decimal gap-2 pl-5 text-muted-foreground">
                <li>{t("discord.tutorial.step1", "Abra o Discord Developer Portal e entre na sua conta.")}</li>
                <li>{t("discord.tutorial.step2", "Crie uma Application em New Application ou abra uma existente.")}</li>
                <li>{t("discord.tutorial.rpc_access", "O escopo RPC é restrito pelo Discord: para desenvolvimento, use uma conta com acesso à aplicação como desenvolvedora ou testadora; para distribuição, a aplicação precisa de aprovação do Discord.")}</li>
                <li>{t("discord.tutorial.step3", "Em OAuth2, copie o Client ID e o Client Secret.")}</li>
                <li>{t("discord.tutorial.step4", "Em OAuth2 > General, adicione http://127.0.0.1 em Redirects.")}</li>
                <li>{t("discord.tutorial.step5", "Cole as credenciais nesta aba, salve e clique em Conectar com o Discord aberto.")}</li>
              </ol>
              <Button type="button" rounded="xl" variant="outline-primary" className="w-fit" onClick={() => void window.underdeck.express.openExternal("https://discord.com/developers/applications")}>{t("discord.tutorial.open_portal", "Abrir Discord Developer Portal")}</Button>
            </Card>
          </TabsContent>
        </Tabs>

        {state?.lastError && <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formatDiscordError(state.lastError)}</Card>}
      </Card>
    </div>
  );
}
