import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from '@/contexts/I18nContext';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import type { App, AppMetaDataSystem, AppTypes } from "@/types/apps";
import type { ObsAudioInput, ObsScene, SoundPadAudio } from "@/types/electron";

type FormState = {
  name: string;
  icon: string;
  type: AppTypes;
  executablePath: string;
  executableArgs: string;
  systemOs: AppMetaDataSystem["os"];
  systemCommand: AppMetaDataSystem["cmd"];
  systemArgs: string;
  soundpadAction: "play-sound" | "play-current-again" | "stop" | "toggle-pause";
  soundpadAudioIndex: string;
  webUrl: string;
  cmdCommand: string;
  cmdArgs: string;
  obsTarget: "stream" | "record" | "scene" | "audio";
  obsAction: "start" | "stop" | "toggle" | "pause" | "resume" | "switch" | "mute" | "unmute";
  obsSceneName: string;
  obsInputName: string;
};

type SoundPadFormHelpers = {
  soundPadAudios: SoundPadAudio[];
  soundPadAudiosLoading: boolean;
  soundPadPath: string;
  refreshSoundPadAudios: () => Promise<void>;
  obsScenes: ObsScene[];
  obsAudioInputs: ObsAudioInput[];
  obsLoading: boolean;
  refreshObsData: () => Promise<void>;
};

type AppTypeDefinition = {
  id: AppTypes;
  label: string;
  description: string;
  renderFields: (
    state: FormState,
    setState: React.Dispatch<React.SetStateAction<FormState>>,
    helpers: SoundPadFormHelpers
  ) => React.ReactNode;
  validate: (state: FormState) => string | null;
  buildMetaData: (state: FormState) => App["meta_data"];
};

const parseArgs = (raw: string): string[] | undefined => {
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
};

function getAppTypeDefinitions(
  t: (key: string, fallback?: string) => string
): AppTypeDefinition[] {
  return [
    {
      id: 1,
      label: t("apps.modal.type.installed", "1 - App instalado / executavel"),
      description: t("apps.modal.type.installed.desc", "Aplicativo instalado ou executavel local."),
      renderFields: (state, setState) => (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="app-exec-path">{t("apps.modal.exec_path", "Diretorio")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="app-exec-path"
                rounded="xl"
                className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                value={state.executablePath}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, executablePath: event.target.value }))
                }
                placeholder="C:\\Program Files\\App\\app.exe"
              />
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                onClick={async () => {
                  const selectedPath = await window.underdeck.dialog.selectFile({
                    title: t("apps.modal.pick_executable", "Selecionar executavel"),
                    buttonLabel: t("common.select", "Selecionar"),
                    filters: [
                      {
                        name: t("apps.modal.executables", "Executaveis"),
                        extensions: ["exe", "bat", "cmd", "lnk"],
                      },
                    ],
                  });
                  if (!selectedPath || Array.isArray(selectedPath)) return;
                  setState((prev) => ({ ...prev, executablePath: selectedPath }));
                }}
              >
                {t("common.choose", "Escolher")}
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="app-exec-args">{t("apps.modal.exec_args", "Argumentos (separados por virgula)")}</Label>
            <Input
              id="app-exec-args"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.executableArgs}
              onChange={(event) =>
                setState((prev) => ({ ...prev, executableArgs: event.target.value }))
              }
              placeholder="--silent, --minimized (opcional)"
            />
          </div>
        </div>
      ),
      validate: (state) =>
        state.executablePath.trim() ? null : t("apps.modal.exec_path_required", "Informe o diretorio do executavel."),
      buildMetaData: (state) => ({
        path: state.executablePath.trim(),
        args: parseArgs(state.executableArgs),
      }),
    },
    {
      id: 2,
      label: t("apps.modal.type.system", "2 - Sistema Operacional"),
      description: t("apps.modal.type.system.desc", "Comandos de sistema como midia, volume e similares."),
      renderFields: (state, setState) => (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>{t("apps.modal.system.command", "Comando")}</Label>
            <Select
              value={state.systemCommand}
              onValueChange={(value: AppMetaDataSystem["cmd"]) =>
                setState((prev) => ({ ...prev, systemCommand: value }))
              }
            >
              <SelectTrigger rounded="xl" className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                <SelectValue placeholder={t("apps.modal.system.select_command", "Selecione o comando")} />
              </SelectTrigger>
              <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                <SelectItem key="media-next" value="media-next">
                  {t("apps.modal.system.media_next", "Proxima faixa")}
                </SelectItem>
                <SelectItem key="media-previous" value="media-previous">
                  {t("apps.modal.system.media_previous", "Faixa anterior")}
                </SelectItem>
                <SelectItem key="media-play-pause" value="media-play-pause">
                  {t("apps.modal.system.media_play_pause", "Reproduzir / Pausar")}
                </SelectItem>
                <SelectItem key="media-pause" value="media-pause">
                  {t("apps.modal.system.media_pause", "Pausar")}
                </SelectItem>
                <SelectItem key="media-mute-unmute" value="media-mute-unmute">
                  {t("apps.modal.system.media_mute_unmute", "Silenciar / Ativar som")}
                </SelectItem>
                <SelectItem key="media-volume-up" value="media-volume-up">
                  {t("apps.modal.system.media_volume_up", "Aumentar volume")}
                </SelectItem>
                <SelectItem key="media-volume-down" value="media-volume-down">
                  {t("apps.modal.system.media_volume_down", "Diminuir volume")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="app-system-args">{t("apps.modal.system.args", "Argumentos (separados por virgula)")}</Label>
            <Input
              id="app-system-args"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.systemArgs}
              onChange={(event) =>
                setState((prev) => ({ ...prev, systemArgs: event.target.value }))
              }
              placeholder="arg1, arg2 (opcional)"
            />
          </div>
        </div>
      ),
      validate: () => null,
      buildMetaData: (state) => ({
        os: state.systemOs,
        cmd: state.systemCommand,
        args: parseArgs(state.systemArgs),
      }),
    },
    {
      id: 3,
      label: t("apps.modal.type.soundpad", "3 - Sound Pad"),
      description: t("apps.modal.type.soundpad.desc", "Use o app Sound Pad no Under Deck."),
      renderFields: (state, setState, helpers) => {
        const currentIndexValue = state.soundpadAudioIndex.trim();
        const selectedAudio = helpers.soundPadAudios.find((item) => String(item.index) === currentIndexValue);
        const selectedAudioOption = selectedAudio
          ? {
              value: String(selectedAudio.index),
              label: `#${selectedAudio.index} ${selectedAudio.name || t("soundpad.unknown", "Sem nome")}`,
              audio: selectedAudio,
            }
          : undefined;

        return (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t("apps.modal.soundpad.action", "Acao do SoundPad")}</Label>
              <Select
                value={state.soundpadAction}
                onValueChange={(value: FormState["soundpadAction"]) =>
                  setState((prev) => ({ ...prev, soundpadAction: value }))
                }
              >
                <SelectTrigger rounded="xl" className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                  <SelectValue placeholder={t("apps.modal.soundpad.select_action", "Selecione a acao")} />
                </SelectTrigger>
                <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                  <SelectItem value="play-sound">{t("apps.modal.soundpad.action.play_sound", "Executar audio")}</SelectItem>
                  <SelectItem value="play-current-again">{t("apps.modal.soundpad.action.play_current_again", "Tocar atual de novo")}</SelectItem>
                  <SelectItem value="stop">{t("apps.modal.soundpad.action.stop", "Parar")}</SelectItem>
                  <SelectItem value="toggle-pause">{t("apps.modal.soundpad.action.toggle_pause", "Toggle pause")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {state.soundpadAction === "play-sound" && (
              <div className="grid gap-2">
                <Label>{t("apps.modal.soundpad.audio", "Audio")}</Label>
                <SearchableSelect
                  options={helpers.soundPadAudios.map((audio) => ({
                    value: String(audio.index),
                    label: `#${audio.index} ${audio.name || t("soundpad.unknown", "Sem nome")} ${audio.artist || ""}`.trim(),
                    audio,
                  }))}
                  value={currentIndexValue || null}
                  onSelect={(value) =>
                    setState((prev) => ({ ...prev, soundpadAudioIndex: value ?? "" }))
                  }
                  placeholder={t("apps.modal.soundpad.select_audio", "Selecione o audio")}
                  searchPlaceholder={t("apps.modal.soundpad.search_audio", "Buscar audio...")}
                  emptyMessage={t("apps.modal.soundpad.no_audio", "Nenhum audio encontrado.")}
                  disabled={helpers.soundPadAudiosLoading}
                  isLoading={helpers.soundPadAudiosLoading}
                  loadingMessage={t("common.loading", "Carregando...")}
                  renderOption={(option) => {
                    const audio = option.audio as SoundPadAudio;
                    return (
                      <div className="min-w-0">
                        <p className="truncate text-sm">#{audio.index} - {audio.name || t("soundpad.unknown", "Sem nome")}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {(audio.artist || t("soundpad.no_artist", "Sem artista"))}
                          {audio.duration ? ` | ${audio.duration}` : ""}
                        </p>
                      </div>
                    );
                  }}
                  renderValue={(option) => {
                    const audio = (option as { audio: SoundPadAudio } | undefined)?.audio;
                    return (
                      <span className="truncate">
                        {audio
                          ? `#${audio.index} - ${audio.name || t("soundpad.unknown", "Sem nome")}`
                          : t("apps.modal.soundpad.select_audio", "Selecione o audio")}
                      </span>
                    );
                  }}
                />
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {helpers.soundPadPath
                      ? `${t("apps.modal.soundpad.path", "SoundPad")}: ${helpers.soundPadPath}`
                      : t("apps.modal.soundpad.path_missing", "Configure o caminho do SoundPad na tela SoundPad.")}
                  </span>
                  <Button
                    type="button"
                    variant="outline-primary"
                    rounded="xl"
                    onClick={() => void helpers.refreshSoundPadAudios()}
                    disabled={helpers.soundPadAudiosLoading}
                  >
                    {t("common.refresh", "Atualizar")}
                  </Button>
                </div>
                {selectedAudioOption?.audio?.path && (
                  <p className="truncate text-xs text-muted-foreground">{selectedAudioOption.audio.path}</p>
                )}
              </div>
            )}
          </div>
        );
      },
      validate: (state) => {
        if (state.soundpadAction !== "play-sound") return null;
        const indexValue = Number(state.soundpadAudioIndex);
        if (!Number.isFinite(indexValue) || indexValue <= 0) {
          return t("apps.modal.soundpad.audio_required", "Selecione um audio do SoundPad.");
        }
        return null;
      },
      buildMetaData: (state) => ({
        action: state.soundpadAction,
        soundIndex: state.soundpadAction === "play-sound" ? Number(state.soundpadAudioIndex) : undefined,
      }),
    },
    {
      id: 4,
      label: t("apps.modal.type.url", "4 - URL no navegador"),
      description: t("apps.modal.type.url.desc", "Abre uma URL no navegador padrao."),
      renderFields: (state, setState) => (
        <div className="grid gap-2">
          <Label htmlFor="app-web-url">URL</Label>
          <Input
            id="app-web-url"
            rounded="xl"
            className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
            value={state.webUrl}
            onChange={(event) =>
              setState((prev) => ({ ...prev, webUrl: event.target.value }))
            }
            placeholder="https://example.com"
          />
        </div>
      ),
      validate: (state) => (state.webUrl.trim() ? null : t("apps.modal.url_required", "Informe uma URL.")),
      buildMetaData: (state) => ({
        url: state.webUrl.trim(),
      }),
    },
    {
      id: 5,
      label: t("apps.modal.type.obs", "5 - OBS"),
      description: t("apps.modal.type.obs.desc", "Use o OBS Studio no Under Deck."),
      renderFields: (state, setState, helpers) => {
        const obsActionOptionsByTarget: Record<FormState["obsTarget"], Array<{ value: FormState["obsAction"]; label: string }>> = {
          stream: [
            { value: "start", label: t("apps.modal.obs.action.stream.start", "Iniciar stream") },
            { value: "stop", label: t("apps.modal.obs.action.stream.stop", "Parar stream") },
            { value: "toggle", label: t("apps.modal.obs.action.stream.toggle", "Alternar stream") },
          ],
          record: [
            { value: "start", label: t("apps.modal.obs.action.record.start", "Iniciar gravacao") },
            { value: "stop", label: t("apps.modal.obs.action.record.stop", "Parar gravacao") },
            { value: "toggle", label: t("apps.modal.obs.action.record.toggle", "Toggle pause") },
            { value: "pause", label: t("apps.modal.obs.action.record.pause", "Pausar gravacao") },
            { value: "resume", label: t("apps.modal.obs.action.record.resume", "Retomar gravacao") },
          ],
          scene: [
            { value: "switch", label: t("apps.modal.obs.action.scene.switch", "Trocar cena") },
          ],
          audio: [
            { value: "mute", label: t("apps.modal.obs.action.audio.mute", "Mutar audio") },
            { value: "unmute", label: t("apps.modal.obs.action.audio.unmute", "Desmutar audio") },
            { value: "toggle", label: t("apps.modal.obs.action.audio.toggle", "Alternar mute") },
          ],
        };

        const availableActions = obsActionOptionsByTarget[state.obsTarget];
        const selectedAction = availableActions.some((item) => item.value === state.obsAction)
          ? state.obsAction
          : availableActions[0].value;

        const selectedScene = helpers.obsScenes.find((item) => item.sceneName === state.obsSceneName);
        const selectedInput = helpers.obsAudioInputs.find((item) => item.inputName === state.obsInputName);

        return (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t("apps.modal.obs.target", "Destino OBS")}</Label>
              <Select
                value={state.obsTarget}
                onValueChange={(value: FormState["obsTarget"]) =>
                  setState((prev) => ({
                    ...prev,
                    obsTarget: value,
                    obsAction: obsActionOptionsByTarget[value][0].value,
                  }))
                }
              >
                <SelectTrigger rounded="xl" className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                  <SelectItem value="stream">{t("apps.modal.obs.target.stream", "Stream")}</SelectItem>
                  <SelectItem value="record">{t("apps.modal.obs.target.record", "Gravacao")}</SelectItem>
                  <SelectItem value="scene">{t("apps.modal.obs.target.scene", "Cena")}</SelectItem>
                  <SelectItem value="audio">{t("apps.modal.obs.target.audio", "Audio")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("apps.modal.obs.action", "Acao")}</Label>
              <Select
                value={selectedAction}
                onValueChange={(value: FormState["obsAction"]) =>
                  setState((prev) => ({ ...prev, obsAction: value }))
                }
              >
                <SelectTrigger rounded="xl" className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                  {availableActions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {state.obsTarget === "scene" && (
              <div className="grid gap-2">
                <Label>{t("apps.modal.obs.scene", "Cena")}</Label>
                <SearchableSelect
                  options={helpers.obsScenes.map((scene) => ({
                    value: scene.sceneName,
                    label: scene.sceneName,
                    scene,
                  }))}
                  value={state.obsSceneName || null}
                  onSelect={(value) => setState((prev) => ({ ...prev, obsSceneName: value ?? "" }))}
                  placeholder={t("apps.modal.obs.scene.select", "Selecione uma cena")}
                  searchPlaceholder={t("apps.modal.obs.scene.search", "Buscar cena...")}
                  emptyMessage={t("apps.modal.obs.scene.empty", "Nenhuma cena encontrada.")}
                  disabled={helpers.obsLoading}
                  isLoading={helpers.obsLoading}
                  loadingMessage={t("common.loading", "Carregando...")}
                  renderOption={(option) => <span className="truncate">{option.label}</span>}
                  renderValue={(option) => <span className="truncate">{option?.label ?? t("apps.modal.obs.scene.select", "Selecione uma cena")}</span>}
                />
                {selectedScene && (
                  <p className="text-xs text-muted-foreground">
                    #{selectedScene.sceneIndex} {selectedScene.isCurrentProgram ? `| ${t("apps.modal.obs.scene.current", "Atual")}` : ""}
                  </p>
                )}
              </div>
            )}

            {state.obsTarget === "audio" && (
              <div className="grid gap-2">
                <Label>{t("apps.modal.obs.audio", "Input de audio")}</Label>
                <SearchableSelect
                  options={helpers.obsAudioInputs.map((input) => ({
                    value: input.inputName,
                    label: input.inputName,
                    input,
                  }))}
                  value={state.obsInputName || null}
                  onSelect={(value) => setState((prev) => ({ ...prev, obsInputName: value ?? "" }))}
                  placeholder={t("apps.modal.obs.audio.select", "Selecione um input")}
                  searchPlaceholder={t("apps.modal.obs.audio.search", "Buscar input...")}
                  emptyMessage={t("apps.modal.obs.audio.empty", "Nenhum input encontrado.")}
                  disabled={helpers.obsLoading}
                  isLoading={helpers.obsLoading}
                  loadingMessage={t("common.loading", "Carregando...")}
                  renderOption={(option) => {
                    const input = option.input as ObsAudioInput;
                    return (
                      <div className="min-w-0">
                        <p className="truncate text-sm">{input.inputName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {input.inputKind} {input.inputMuted ? `| ${t("obs.audio.muted", "Mutado")}` : ""}
                        </p>
                      </div>
                    );
                  }}
                  renderValue={(option) => <span className="truncate">{option?.label ?? t("apps.modal.obs.audio.select", "Selecione um input")}</span>}
                />
                {selectedInput?.inputUuid && (
                  <p className="truncate text-xs text-muted-foreground">{selectedInput.inputUuid}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t("apps.modal.obs.data_hint", "Dados carregados do servico OBS da tela dashboard.")}</span>
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                onClick={() => void helpers.refreshObsData()}
                disabled={helpers.obsLoading}
              >
                {t("common.refresh", "Atualizar")}
              </Button>
            </div>
          </div>
        );
      },
      validate: (state) => {
        if (state.obsTarget === "scene" && !state.obsSceneName.trim()) {
          return t("apps.modal.obs.scene.required", "Selecione uma cena para o app OBS.");
        }
        if (state.obsTarget === "audio" && !state.obsInputName.trim()) {
          return t("apps.modal.obs.audio.required", "Selecione um input de audio para o app OBS.");
        }
        return null;
      },
      buildMetaData: (state) => ({
        target: state.obsTarget,
        action: state.obsAction,
        sceneName: state.obsTarget === "scene" ? state.obsSceneName.trim() : undefined,
        inputName: state.obsTarget === "audio" ? state.obsInputName.trim() : undefined,
      }),
    },
    {
      id: 6,
      label: t("apps.modal.type.cmd", "6 - CMD"),
      description: t("apps.modal.type.cmd.desc", "Executa um comando no Prompt de Comando."),
      renderFields: (state, setState) => (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="app-cmd-command">{t("apps.modal.cmd.command", "Comando")}</Label>
            <Input
              id="app-cmd-command"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.cmdCommand}
              onChange={(event) =>
                setState((prev) => ({ ...prev, cmdCommand: event.target.value }))
              }
              placeholder='echo hello && dir'
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="app-cmd-args">{t("apps.modal.cmd.args", "Argumentos (separados por virgula)")}</Label>
            <Input
              id="app-cmd-args"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.cmdArgs}
              onChange={(event) =>
                setState((prev) => ({ ...prev, cmdArgs: event.target.value }))
              }
              placeholder="/c, start notepad (opcional)"
            />
          </div>
        </div>
      ),
      validate: (state) =>
        state.cmdCommand.trim() ? null : t("apps.modal.cmd.command_required", "Informe o comando CMD."),
      buildMetaData: (state) => ({
        command: state.cmdCommand.trim(),
        args: parseArgs(state.cmdArgs),
      }),
    },
  ];
}

const DEFAULT_FORM_STATE: FormState = {
  name: "",
  icon: "",
  type: 1,
  executablePath: "",
  executableArgs: "",
  systemOs: "windows",
  systemCommand: "media-play-pause",
  systemArgs: "",
  soundpadAction: "play-sound",
  soundpadAudioIndex: "",
  webUrl: "",
  cmdCommand: "",
  cmdArgs: "",
  obsTarget: "stream",
  obsAction: "start",
  obsSceneName: "",
  obsInputName: "",
};

interface AddAppModalProps {
  appToEdit?: App | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialState?: Partial<FormState>;
}

export function AddAppModal({
  appToEdit = null,
  trigger,
  open: controlledOpen,
  onOpenChange,
  initialState,
}: AddAppModalProps) {
  const { createApp, updateApp } = useUnderDeck();
  const { t } = useI18n();
  const [localOpen, setLocalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<FormState>(DEFAULT_FORM_STATE);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [soundPadAudios, setSoundPadAudios] = useState<SoundPadAudio[]>([]);
  const [soundPadAudiosLoading, setSoundPadAudiosLoading] = useState(false);
  const [soundPadPath, setSoundPadPath] = useState("");
  const [obsScenes, setObsScenes] = useState<ObsScene[]>([]);
  const [obsAudioInputs, setObsAudioInputs] = useState<ObsAudioInput[]>([]);
  const [obsLoading, setObsLoading] = useState(false);
  const previewRequestIdRef = useRef(0);
  const open = typeof controlledOpen === "boolean" ? controlledOpen : localOpen;

  const setDialogOpen = (nextOpen: boolean) => {
    if (typeof controlledOpen !== "boolean") {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const refreshSoundPadAudios = async () => {
    setSoundPadAudiosLoading(true);
    try {
      const [audios, pathValue] = await Promise.all([
        window.underdeck.soundpad.listAudios(),
        window.underdeck.soundpad.getPath(),
      ]);
      setSoundPadAudios(Array.isArray(audios) ? audios : []);
      setSoundPadPath(pathValue ?? "");
    } finally {
      setSoundPadAudiosLoading(false);
    }
  };

  const refreshObsData = async () => {
    setObsLoading(true);
    try {
      await window.underdeck.obs.connect();
      const [scenes, audioInputs] = await Promise.all([
        window.underdeck.obs.listScenes(),
        window.underdeck.obs.listAudioInputs(),
      ]);
      setObsScenes(Array.isArray(scenes) ? scenes : []);
      setObsAudioInputs(Array.isArray(audioInputs) ? audioInputs : []);
    } finally {
      setObsLoading(false);
    }
  };

  const appTypeDefinitions = useMemo(() => getAppTypeDefinitions(t), [t]);

  const currentType = useMemo(
    () => appTypeDefinitions.find((item) => item.id === state.type),
    [appTypeDefinitions, state.type]
  );
  const isEditing = !!appToEdit;

  const resetForm = () => {
    if (!appToEdit) {
      setState({ ...DEFAULT_FORM_STATE, ...(initialState ?? {}) });
      setIconPreview(null);
      return;
    }

    const nextState: FormState = {
      name: appToEdit.name ?? "",
      icon: "",
      type: appToEdit.type,
      executablePath: "",
      executableArgs: "",
      systemOs: "windows",
      systemCommand: "media-play-pause",
      systemArgs: "",
      soundpadAction: "play-sound",
      soundpadAudioIndex: "",
      webUrl: "",
      cmdCommand: "",
      cmdArgs: "",
      obsTarget: "stream",
      obsAction: "start",
      obsSceneName: "",
      obsInputName: "",
    };

    if (appToEdit.type === 1 && "path" in appToEdit.meta_data) {
      nextState.executablePath = appToEdit.meta_data.path ?? "";
      nextState.executableArgs = Array.isArray(appToEdit.meta_data.args) ? appToEdit.meta_data.args.join(", ") : "";
    }
    if (appToEdit.type === 2 && "cmd" in appToEdit.meta_data) {
      nextState.systemOs = appToEdit.meta_data.os ?? "windows";
      nextState.systemCommand = appToEdit.meta_data.cmd ?? "media-play-pause";
      nextState.systemArgs = Array.isArray(appToEdit.meta_data.args) ? appToEdit.meta_data.args.join(", ") : "";
    }
    if (appToEdit.type === 4 && "url" in appToEdit.meta_data) {
      nextState.webUrl = appToEdit.meta_data.url ?? "";
    }
    if (appToEdit.type === 6 && "command" in appToEdit.meta_data) {
      nextState.cmdCommand = appToEdit.meta_data.command ?? "";
      nextState.cmdArgs = Array.isArray(appToEdit.meta_data.args) ? appToEdit.meta_data.args.join(", ") : "";
    }
    if (appToEdit.type === 3) {
      const soundpadMeta = appToEdit.meta_data as App["meta_data"] & {
        action?: "play-sound" | "play-current-again" | "stop" | "toggle-pause";
        soundIndex?: number;
        path?: string;
      };
      if ("action" in soundpadMeta) {
        nextState.soundpadAction = soundpadMeta.action ?? "play-sound";
        nextState.soundpadAudioIndex =
          typeof soundpadMeta.soundIndex === "number"
            ? String(soundpadMeta.soundIndex)
            : "";
      } else {
        nextState.soundpadAction = "play-sound";
        nextState.soundpadAudioIndex = String(soundpadMeta.path ?? "");
      }
    }
    if (appToEdit.type === 5) {
      const meta = appToEdit.meta_data as App["meta_data"] & {
        target?: string;
        action?: string;
        type?: string;
        sceneName?: string;
        inputName?: string;
        path?: string;
      };
      const target = String(meta?.target ?? meta?.type ?? "stream").toLowerCase();
      if (target === "record" || target === "scene" || target === "audio") {
        nextState.obsTarget = target;
      } else {
        nextState.obsTarget = "stream";
      }

      const action = String(meta?.action ?? "start").toLowerCase();
      if (action === "stop" || action === "toggle" || action === "pause" || action === "resume" || action === "switch" || action === "mute" || action === "unmute") {
        nextState.obsAction = action;
      } else {
        nextState.obsAction = "start";
      }

      nextState.obsSceneName = String(meta?.sceneName ?? (meta?.type === "scene" ? meta?.path : "") ?? "");
      nextState.obsInputName = String(meta?.inputName ?? (meta?.type === "input" ? meta?.path : "") ?? "");
    }

    setState(nextState);
    setIconPreview(appToEdit.icon ?? null);
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, appToEdit, initialState]);

  useEffect(() => {
    if (!open) return;
    if (state.type !== 3) return;
    void refreshSoundPadAudios();
  }, [open, state.type]);

  useEffect(() => {
    if (!open) return;
    if (state.type !== 5) return;
    void refreshObsData();
  }, [open, state.type]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = window.underdeck.soundpad.onAudiosChanged((nextAudios) => {
      setSoundPadAudios(Array.isArray(nextAudios) ? nextAudios : []);
    });
    return () => {
      unsubscribe();
    };
  }, [open]);

  const handleSelectIcon = async () => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("apps.modal.pick_icon", "Selecionar icone"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [
        {
          name: t("common.images", "Imagens"),
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg"],
        },
      ],
    });

    if (!selectedPath || Array.isArray(selectedPath)) return;
    setState((prev) => ({ ...prev, icon: selectedPath }));

    const previewDataUrl = await window.underdeck.dialog.readFileAsDataUrl(selectedPath);
    setIconPreview(previewDataUrl ?? null);
  };

  useEffect(() => {
    const iconValue = state.icon.trim();
    const requestId = ++previewRequestIdRef.current;

    if (!iconValue) {
      setIconPreview(appToEdit?.icon ?? null);
      return;
    }

    const isRemoteOrRenderableUrl =
      iconValue.startsWith("http://") ||
      iconValue.startsWith("https://") ||
      iconValue.startsWith("data:") ||
      iconValue.startsWith("underdeck-media://") ||
      iconValue.startsWith("file://");

    if (isRemoteOrRenderableUrl) {
      setIconPreview(iconValue);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const previewDataUrl = await window.underdeck.dialog.readFileAsDataUrl(iconValue);
      if (previewRequestIdRef.current !== requestId) return;
      setIconPreview(previewDataUrl ?? null);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state.icon, appToEdit]);

  const handleCreate = async () => {
    if (!currentType) return;
    if (!state.name.trim()) {
      toast.error(t("apps.modal.name_required", "Informe o nome do app."));
      return;
    }
    const errorMessage = currentType.validate(state);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    const newApp: App = {
      id: appToEdit?.id ?? crypto.randomUUID(),
      type: state.type,
      position: appToEdit?.position ?? 0,
      name: state.name.trim(),
      icon: state.icon.trim() || appToEdit?.icon || null,
      banner: null,
      description: "",
      meta_data: currentType.buildMetaData(state),
    };

    setSaving(true);
    try {
      const createdApp = isEditing
        ? await updateApp(newApp)
        : await createApp(newApp);
      if (!createdApp) {
        return;
      }
      setDialogOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setDialogOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      {(() => {
        const resolvedTrigger = trigger === undefined ? (
          <Button variant="outline-primary" rounded="xl">
            <Plus className="h-4 w-4" />
            {t("common.add", "Adicionar")}
          </Button>
        ) : trigger;

        if (!resolvedTrigger) return null;
        return <DialogTrigger asChild>{resolvedTrigger}</DialogTrigger>;
      })()}
      <DialogContent className="max-w-xl rounded-xl app-create-modal-content select-none">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t("apps.modal.edit_title", "Editar Aplicativo")
              : t("apps.modal.add_title", "Adicionar Aplicativo")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="app-name">{t("common.name", "Nome")}</Label>
            <Input
              id="app-name"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.name}
              onChange={(event) =>
                setState((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder={t("apps.modal.name_placeholder", "Nome do aplicativo")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="app-icon">{t("apps.modal.icon_label", "Icone (URL/Base64/Diretorio)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="app-icon"
                rounded="xl"
                className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                value={state.icon}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, icon: event.target.value }))
                }
                placeholder={
                  isEditing
                    ? t("apps.modal.icon_placeholder_edit", "Novo diretorio do icone (opcional)")
                    : t("apps.modal.icon_placeholder_add", "C:\\icon.png (opcional)")
                }
              />
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                onClick={handleSelectIcon}
              >
                <ImagePlus className="h-4 w-4" />
                {t("common.choose", "Escolher")}
              </Button>
            </div>
            {iconPreview && (
              <div className="w-fill">
                <img
                  src={iconPreview}
                  alt={t("apps.modal.icon_preview", "Preview do icone")}
                  className="h-60 w-full rounded-xl border border-border/70 bg-black/20 object-cover"
                />
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("common.type", "Tipo")}</Label>
            <Select
              value={String(state.type)}
              onValueChange={(value) =>
                setState((prev) => ({ ...prev, type: Number(value) as AppTypes }))
              }
            >
              <SelectTrigger rounded="xl" className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                <SelectValue placeholder={t("apps.modal.type_select", "Selecione o tipo")} />
              </SelectTrigger>
              <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                {appTypeDefinitions.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentType && (
              <p className="text-xs text-muted-foreground">{currentType.description}</p>
            )}
          </div>

          {currentType?.renderFields(state, setState, {
            soundPadAudios,
            soundPadAudiosLoading,
            soundPadPath,
            refreshSoundPadAudios,
            obsScenes,
            obsAudioInputs,
            obsLoading,
            refreshObsData,
          })}
        </div>

        <DialogFooter className="">
          <Button
            variant="ghost-destructive"
            rounded="xl"
            onClick={() => setDialogOpen(false)}
            disabled={saving}
          >
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button rounded="xl" onClick={handleCreate} disabled={saving}>
            {saving ? t("common.saving", "Salvando...") : t("common.save", "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
