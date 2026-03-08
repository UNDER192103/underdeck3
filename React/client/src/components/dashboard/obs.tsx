import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input, InputPassword } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DashboardPager } from "@/components/ui/dashboard-pager";
import { Loader2, Mic2, Radio, Video, RefreshCw } from "lucide-react";
import type { ObsAudioInput, ObsState } from "@/types/electron";

type ObsTab = "scenes" | "audio";

function formatListLabel(value: string, fallback: string) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export default function ObsStudio({
  className = "backdrop-blur supports-[backdrop-filter]:bg-background",
}: {
  className?: string;
}) {
  const { t } = useI18n();
  const [obsState, setObsState] = useState<ObsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualHost, setManualHost] = useState("127.0.0.1");
  const [manualPort, setManualPort] = useState("4455");
  const [manualPassword, setManualPassword] = useState("");
  const [sceneSearch, setSceneSearch] = useState("");
  const [audioSearch, setAudioSearch] = useState("");
  const [tab, setTab] = useState<ObsTab>("scenes");
  const [scenesPage, setScenesPage] = useState(1);
  const [audioPage, setAudioPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const lastManualSavedRef = useRef("");
  const lastManualInvalidRef = useRef("");

  const markBusy = (key: string, value: boolean) => {
    setBusyMap((prev) => {
      const next = { ...prev };
      if (value) {
        next[key] = true;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const loadState = async () => {
    setLoading(true);
    try {
      const state = await window.underdeck.obs.getState();
      setObsState(state);
      setManualHost(state.settings.host);
      setManualPort(String(state.settings.port));
      setManualPassword(state.settings.password);
      lastManualSavedRef.current = `${state.settings.host}|${state.settings.port}|${state.settings.password}`;
      lastManualInvalidRef.current = "";
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
    const unsubscribe = window.underdeck.obs.onStateChanged((state) => {
      setObsState(state);
    });
    return () => unsubscribe();
  }, []);

  const runObsAction = async (key: string, action: () => Promise<{ ok: boolean; message: string }>) => {
    markBusy(key, true);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(t("obs.action.ok", "Operacao executada"), { description: result.message });
      } else {
        toast.error(t("obs.action.fail", "Falha ao executar"), { description: result.message });
      }
      await window.underdeck.obs.refreshState();
    } finally {
      markBusy(key, false);
    }
  };

  const updateObsSettings = async (
    patch: Parameters<typeof window.underdeck.obs.updateSettings>[0],
    options?: Parameters<typeof window.underdeck.obs.updateSettings>[1]
  ) => {
    setSaving(true);
    try {
      const result = await window.underdeck.obs.updateSettings(patch, options);
      if (!result.ok) {
        toast.error(t("obs.settings.fail", "Falha ao salvar configuracoes"), {
          description: result.message,
        });
        return false;
      }
      await window.underdeck.obs.refreshState();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const switchConnectOnStartup = async (checked: boolean) => {
    await updateObsSettings({ connectOnStartup: checked });
  };

  const switchAutoDetect = async (checked: boolean) => {
    if (!obsState) return;
    if (!checked) {
      const fallbackHost = manualHost.trim() || obsState.resolvedConfig.host || "127.0.0.1";
      const manualPortNumber = Number(manualPort);
      const fallbackPort = Number.isFinite(manualPortNumber) && manualPortNumber >= 1 && manualPortNumber <= 65535
        ? manualPortNumber
        : (obsState.resolvedConfig.port || 4455);
      const fallbackPassword = manualPassword || obsState.resolvedConfig.password || "";

      setManualHost(fallbackHost);
      setManualPort(String(fallbackPort));
      setManualPassword(fallbackPassword);

      await updateObsSettings(
        { autoDetect: false, host: fallbackHost, port: fallbackPort, password: fallbackPassword },
        { reconnectIfConnected: false }
      );
      return;
    }
    await updateObsSettings({ autoDetect: true }, { reconnectIfConnected: true });
  };

  const applyManualSettings = async () => {
    const host = manualHost.trim();
    const password = manualPassword.trim();
    const port = Number(manualPort);
    if (!host || !password || !Number.isFinite(port) || port < 1 || port > 65535) {
      toast.error(t("obs.manual.invalid", "Host, porta ou senha invalidos."));
      return;
    }
    const ok = await updateObsSettings(
      { autoDetect: false, host, port, password },
      { reconnectIfConnected: true, requireValidManual: true }
    );
    if (ok) {
      toast.success(t("obs.manual.applied", "Configuracao manual aplicada."));
    }
  };

  useEffect(() => {
    if (!obsState) return;
    if (obsState.settings.autoDetect) return;

    const timer = window.setTimeout(async () => {
      const host = manualHost.trim();
      const password = manualPassword.trim();
      const port = Number(manualPort);
      const signature = `${host}|${port}|${password}`;

      if (!host || !password || !Number.isFinite(port) || port < 1 || port > 65535) {
        if (lastManualInvalidRef.current !== signature) {
          toast.error(t("obs.manual.invalid", "Host, porta ou senha invalidos."));
          lastManualInvalidRef.current = signature;
        }
        return;
      }

      if (lastManualSavedRef.current === signature) {
        return;
      }

      setSaving(true);
      try {
        const result = await window.underdeck.obs.updateSettings(
          { autoDetect: false, host, port, password },
          { reconnectIfConnected: true, requireValidManual: true }
        );
        if (!result.ok) {
          toast.error(t("obs.settings.fail", "Falha ao salvar configuracoes"), {
            description: result.message,
          });
          return;
        }
        lastManualSavedRef.current = signature;
        lastManualInvalidRef.current = "";
        await window.underdeck.obs.refreshState();
      } finally {
        setSaving(false);
      }
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [manualHost, manualPort, manualPassword, obsState?.settings.autoDetect, t]);

  const connected = Boolean(obsState?.connected);
  const connecting = Boolean(obsState?.connecting);
  const streamActive = Boolean(obsState?.streamActive);
  const recordActive = Boolean(obsState?.recordActive);
  const recordPaused = Boolean(obsState?.recordPaused);
  const settings = obsState?.settings;

  const filteredScenes = useMemo(() => {
    const allScenes = obsState?.scenes ?? [];
    const q = sceneSearch.trim().toLowerCase();
    const baseList = !q
      ? allScenes
      : allScenes.filter((scene) => scene.sceneName.toLowerCase().includes(q));
    return [...baseList].sort((a, b) =>
      formatListLabel(a.sceneName, "").localeCompare(
        formatListLabel(b.sceneName, ""),
        "pt-BR",
        { sensitivity: "base", numeric: true }
      )
    );
  }, [obsState?.scenes, sceneSearch]);

  const filteredAudioInputs = useMemo(() => {
    const allInputs = obsState?.audioInputs ?? [];
    const q = audioSearch.trim().toLowerCase();
    const baseList = !q
      ? allInputs
      : allInputs.filter((input) => {
      return (
        input.inputName.toLowerCase().includes(q) ||
        input.inputKind.toLowerCase().includes(q) ||
        input.inputUuid.toLowerCase().includes(q)
      );
    });
    return [...baseList].sort((a, b) =>
      formatListLabel(a.inputName, "").localeCompare(
        formatListLabel(b.inputName, ""),
        "pt-BR",
        { sensitivity: "base", numeric: true }
      )
    );
  }, [obsState?.audioInputs, audioSearch]);

  useEffect(() => {
    setScenesPage(1);
  }, [sceneSearch, pageSize, obsState?.scenes]);

  useEffect(() => {
    setAudioPage(1);
  }, [audioSearch, pageSize, obsState?.audioInputs]);

  const scenesTotalPages = Math.max(1, Math.ceil(filteredScenes.length / pageSize));
  const audiosTotalPages = Math.max(1, Math.ceil(filteredAudioInputs.length / pageSize));
  const scenesCurrentPage = Math.min(scenesPage, scenesTotalPages);
  const audiosCurrentPage = Math.min(audioPage, audiosTotalPages);
  const pagedScenes = filteredScenes.slice((scenesCurrentPage - 1) * pageSize, scenesCurrentPage * pageSize);
  const pagedAudios = filteredAudioInputs.slice((audiosCurrentPage - 1) * pageSize, audiosCurrentPage * pageSize);

  return (
    <div className="w-full h-full p-2 select-none">
      <Card className={cn("p-6 grid gap-4 bg-card/70", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={connected ? "default" : "secondary"}>
              {connected ? t("obs.connected", "Conectado") : t("obs.disconnected", "Desconectado")}
            </Badge>
            <Badge variant={streamActive ? "default" : "secondary"}>
              <Radio className="h-3 w-3 mr-1" />
              {streamActive ? t("obs.streaming.on", "Transmitindo") : t("obs.streaming.off", "Sem transmissao")}
            </Badge>
            <Badge variant={recordActive ? "default" : "secondary"}>
              <Video className="h-3 w-3 mr-1" />
              {recordActive
                ? recordPaused
                  ? t("obs.recording.paused", "Gravacao pausada")
                  : t("obs.recording.on", "Gravando")
                : t("obs.recording.off", "Sem gravacao")}
            </Badge>
            <Badge variant="outline">
              {t("obs.mode", "Modo")}: {settings?.autoDetect ? t("obs.auto", "Automatico") : t("obs.manual", "Manual")}
            </Badge>
            <Badge variant="outline">
              {obsState?.resolvedConfig.host}:{obsState?.resolvedConfig.port}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              rounded="xl"
              variant="secondary"
              onClick={() => void loadState()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("common.refresh", "Atualizar")}
            </Button>
            {connected ? (
              <Button
                type="button"
                rounded="xl"
                variant="outline-destructive"
                onClick={() => void runObsAction("disconnect", () => window.underdeck.obs.disconnect())}
                disabled={!!busyMap.disconnect || connecting}
              >
                {t("obs.disconnect", "Desconectar")}
              </Button>
            ) : (
              <Button
                type="button"
                rounded="xl"
                onClick={() => void runObsAction("connect", () => window.underdeck.obs.connect())}
                disabled={!!busyMap.connect || connecting}
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("obs.connect", "Conectar")}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 grid gap-3 border-border/70 bg-card/70">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("obs.startup", "Conectar ao iniciar app")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("obs.startup.desc", "Usa configuracao salva para conectar automaticamente.")}
                </p>
              </div>
              <Switch
                checked={Boolean(settings?.connectOnStartup)}
                onCheckedChange={(checked) => {
                  void switchConnectOnStartup(Boolean(checked));
                }}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t("obs.auto_detect", "Detectar configuracao automaticamente")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("obs.auto_detect.desc", "Le do AppData do OBS e reconecta se necessario.")}
                </p>
              </div>
              <Switch
                checked={Boolean(settings?.autoDetect)}
                onCheckedChange={(checked) => {
                  void switchAutoDetect(Boolean(checked));
                }}
                disabled={saving}
              />
            </div>
          </Card>

          <Card className="p-4 grid gap-3 border-border/70 bg-card/70">
            <Label>{t("obs.manual.connection", "Configuracao manual")}</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                rounded="xl"
                value={manualHost}
                onChange={(event) => setManualHost(event.target.value)}
                placeholder="127.0.0.1"
                disabled={Boolean(settings?.autoDetect)}
              />
              <Input
                rounded="xl"
                value={manualPort}
                onChange={(event) => setManualPort(event.target.value)}
                placeholder="4455"
                disabled={Boolean(settings?.autoDetect)}
              />
            </div>
            <InputPassword
              rounded="xl"
              type="password"
              value={manualPassword}
              onChange={(event) => setManualPassword(event.target.value)}
              placeholder={t("obs.password", "Senha do websocket")}
              disabled={Boolean(settings?.autoDetect)}
            />
            <Button
              type="button"
              rounded="xl"
              onClick={() => void applyManualSettings()}
              disabled={Boolean(settings?.autoDetect) || saving}
            >
              {t("obs.manual.apply", "Alterar conexao manual")}
            </Button>
          </Card>
        </div>

        <Card className="p-4 grid gap-3 border-border/70 bg-card/70">
          <Label>{t("obs.controls", "Controles de stream e gravacao")}</Label>
          <div className="flex flex-wrap gap-2">
            <Button rounded="xl" onClick={() => void runObsAction("startStream", () => window.underdeck.obs.startStream())} disabled={!!busyMap.startStream}>
              {t("obs.start_stream", "StartStream")}
            </Button>
            <Button rounded="xl" onClick={() => void runObsAction("stopStream", () => window.underdeck.obs.stopStream())} disabled={!!busyMap.stopStream}>
              {t("obs.stop_stream", "StopStream")}
            </Button>
            <Button rounded="xl" variant="secondary" onClick={() => void runObsAction("toggleStream", () => window.underdeck.obs.toggleStream())} disabled={!!busyMap.toggleStream}>
              {t("obs.toggle_stream", "ToggleStream")}
            </Button>
            <Button rounded="xl" onClick={() => void runObsAction("startRecord", () => window.underdeck.obs.startRecord())} disabled={!!busyMap.startRecord}>
              {t("obs.start_record", "StartRecord")}
            </Button>
            <Button rounded="xl" onClick={() => void runObsAction("stopRecord", () => window.underdeck.obs.stopRecord())} disabled={!!busyMap.stopRecord}>
              {t("obs.stop_record", "StopRecord")}
            </Button>
            <Button rounded="xl" variant="secondary" onClick={() => void runObsAction("toggleRecordPause", () => window.underdeck.obs.toggleRecordPause())} disabled={!!busyMap.toggleRecordPause}>
              {t("obs.toggle_record_pause", "ToggleRecordPause")}
            </Button>
            <Button rounded="xl" variant="secondary" onClick={() => void runObsAction("pauseRecord", () => window.underdeck.obs.pauseRecord())} disabled={!!busyMap.pauseRecord}>
              {t("obs.pause_record", "PauseRecord")}
            </Button>
            <Button rounded="xl" variant="secondary" onClick={() => void runObsAction("resumeRecord", () => window.underdeck.obs.resumeRecord())} disabled={!!busyMap.resumeRecord}>
              {t("obs.resume_record", "ResumeRecord")}
            </Button>
          </div>
        </Card>

        <Card className="p-4 grid gap-3 border-border/70 bg-card/70">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              rounded="xl"
              variant={tab === "scenes" ? "primary" : "secondary"}
              onClick={() => setTab("scenes")}
            >
              {t("obs.scenes", "Cenas")} ({obsState?.scenes.length ?? 0})
            </Button>
            <Button
              type="button"
              rounded="xl"
              variant={tab === "audio" ? "primary" : "secondary"}
              onClick={() => setTab("audio")}
            >
              <Mic2 className="h-4 w-4" />
              {t("obs.audio", "Entradas/Saidas de audio")} ({obsState?.audioInputs.length ?? 0})
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs">{t("soundpad.pagination.per_page", "Por pagina")}</Label>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger rounded="xl" className="w-[88px] border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tab === "scenes" && (
            <div className="grid gap-3">
              <Input
                rounded="xl"
                value={sceneSearch}
                onChange={(event) => setSceneSearch(event.target.value)}
                placeholder={t("obs.search.scene", "Buscar cena...")}
              />
              <div className="grid gap-2">
                {pagedScenes.length === 0 ? (
                  <Card className="p-4 border-border/70 bg-card/70">
                    <p className="text-sm text-muted-foreground">{t("obs.empty.scenes", "Nenhuma cena encontrada.")}</p>
                  </Card>
                ) : (
                  pagedScenes.map((scene) => (
                    <Card key={scene.sceneName} className="p-3 border-border/70 bg-card/70">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{formatListLabel(scene.sceneName, t("obs.scene.unknown", "Sem nome"))}</p>
                          <p className="text-xs text-muted-foreground">
                            #{scene.sceneIndex+1} {scene.isCurrentProgram ? `| ${t("obs.current_scene", "Cena atual")}` : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          rounded="xl"
                          variant={scene.isCurrentProgram ? "secondary" : "primary"}
                          onClick={() => void runObsAction(`scene-${scene.sceneName}`, () => window.underdeck.obs.setCurrentScene(scene.sceneName))}
                          disabled={scene.isCurrentProgram || !!busyMap[`scene-${scene.sceneName}`]}
                        >
                          {scene.isCurrentProgram ? t("obs.current", "Atual") : t("obs.switch_scene", "Trocar")}
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
              <DashboardPager
                page={scenesCurrentPage}
                totalPages={scenesTotalPages}
                onPageChange={setScenesPage}
                rounded="xl"
                prevLabel={t("common.previous", "Anterior")}
                nextLabel={t("common.next", "Proximo")}
              />
            </div>
          )}

          {tab === "audio" && (
            <div className="grid gap-3">
              <Input
                rounded="xl"
                value={audioSearch}
                onChange={(event) => setAudioSearch(event.target.value)}
                placeholder={t("obs.search.audio", "Buscar input de audio...")}
              />
              <div className="grid gap-2">
                {pagedAudios.length === 0 ? (
                  <Card className="p-4 border-border/70 bg-card/70">
                    <p className="text-sm text-muted-foreground">{t("obs.empty.audio", "Nenhum input de audio encontrado.")}</p>
                  </Card>
                ) : (
                  pagedAudios.map((input: ObsAudioInput) => (
                    <Card key={input.inputUuid || input.inputName} className="p-3 border-border/70 bg-card/70">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{formatListLabel(input.inputName, t("obs.audio.unknown", "Sem nome"))}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {input.inputKind} | {input.inputMuted ? t("obs.audio.muted", "Mutado") : t("obs.audio.unmuted", "Desmutado")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!input.inputMuted}
                            onCheckedChange={(checked) => {
                              void runObsAction(
                                `audio-${input.inputName}-${checked ? "on" : "off"}`,
                                () => window.underdeck.obs.setInputMute(input.inputName, !checked)
                              );
                            }}
                          />
                          <Button
                            type="button"
                            rounded="xl"
                            variant="secondary"
                            onClick={() => void runObsAction(`audio-toggle-${input.inputName}`, () => window.underdeck.obs.toggleInputMute(input.inputName))}
                            disabled={!!busyMap[`audio-toggle-${input.inputName}`]}
                          >
                            {t("obs.audio.toggle", "Toggle")}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
              <DashboardPager
                page={audiosCurrentPage}
                totalPages={audiosTotalPages}
                onPageChange={setAudioPage}
                rounded="xl"
                prevLabel={t("common.previous", "Anterior")}
                nextLabel={t("common.next", "Proximo")}
              />
            </div>
          )}
        </Card>

        {obsState?.lastError && (
          <Card className="p-3 border-destructive/40 bg-destructive/10">
            <p className="text-sm text-destructive">{obsState.lastError}</p>
          </Card>
        )}
      </Card>
    </div>
  );
}
