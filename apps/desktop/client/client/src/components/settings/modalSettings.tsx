import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { Loader2, LogIn, LogOut, Pencil, Layers2, Trash2, Languages, Palette, Music2, Radio, Download, SlidersHorizontal, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Img } from "@/components/ui/img";
import { ModalConfirm, ModalConfirmProps } from "@/components/ModalConfirm";
import { UserProfileEditorModal } from "@/components/user/UserProfileEditorModal";
import { useI18n } from "@/contexts/I18nContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import Theme from '@/components/dashboard/theme';
import SoundPad from '@/components/dashboard/soundpad';
import ObsStudio from '@/components/dashboard/obs';
import { toast } from "sonner";
import { useGlobalObserver } from "@/contexts/GlobalObserverContext";
import UpdatePage from '@/components/dashboard/update';
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModalSettings({ isOpen, onClose }: UserProfileModalProps) {
  const { modalLogin, logout, user } = useUser();
  const { t, locale, locales, setLocale, importLocaleFile, removeLocale } = useI18n();
  const [currentSection, setCurrentSection] = useState<"theme" | "language" | "obs" | "soundpad" | "overlay" | "updates" | "advanced">("updates");
  const [isImportingLocale, setIsImportingLocale] = useState(false);
  const [removingLocale, setRemovingLocale] = useState<string | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayKeys, setOverlayKeys] = useState<string[]>([]);
  const [overlayCloseOnBlur, setOverlayCloseOnBlur] = useState(true);
  const [isCapturingOverlayKeys, setIsCapturingOverlayKeys] = useState(false);
  const [isShortcutsEnabled, setIsShortcutsEnabled] = useState(false);
  const [modalConfirm, setModalConfirm] = useState<ModalConfirmProps>({
    isOpen: false,
    title: "",
    content: "",
    onResult: () => undefined,
  });
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const { publish, subscribe } = useGlobalObserver();
  const [windowsSettings, setWindowsSettings] = useState({
    autoStart: true,
    enableNotifications: true,
  });
  const [electronSettings, setElectronSettings] = useState({
    startMinimized: true,
    closeToTray: true,
    devTools: false,
    openLinksInBrowser: false,
  });
  const [updatesAutoDownload, setUpdatesAutoDownload] = useState(true);
  const [obsStartOnStartup, setObsStartOnStartup] = useState(false);
  const [logsSettings, setLogsSettings] = useState({
    enabled: false,
    app: false,
    shortcuts: false,
    obs: false,
    soundpad: false,
    webdeck: false,
    socket: false,
    updates: false,
  });

  const modalLogout = () => {
    setModalConfirm({
      isOpen: true,
      title: t("settings.logout.title", "Deseja deslogar?"),
      content: t("settings.logout.content", "Tem certeza que deseja sair?"),
      onResult: async (result) => {
        if (result) {
          await logout();
        }
      },
    });
  };

  const handleImportLocale = async () => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("settings.language.pick_file", "Selecionar arquivo de traducao"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;

    setIsImportingLocale(true);
    try {
      await importLocaleFile(selectedPath);
      toast.success(t("settings.language.importSuccess"));
    } catch {
      toast.error(t("settings.language.importError"));
    } finally {
      setIsImportingLocale(false);
    }
  };

  const handleRemoveLocale = (targetLocale: string, targetName: string) => {
    setModalConfirm({
      isOpen: true,
      title: t("settings.language.remove.title", "Remover traducao"),
      content: t("settings.language.remove.content", `Deseja remover a traducao ${targetName}?`),
      onResult: async (result) => {
        if (!result) return;
        setRemovingLocale(targetLocale);
        try {
          const removed = await removeLocale(targetLocale);
          if (!removed) {
            toast.error(t("settings.language.removeError", "Falha ao remover idioma."));
            return;
          }
          toast.success(t("settings.language.removeSuccess", "Idioma removido com sucesso."));
        } catch {
          toast.error(t("settings.language.removeError", "Falha ao remover idioma."));
        } finally {
          setRemovingLocale(null);
        }
      },
    });
  };

  const externalLocales = locales.filter((item) => item.source === "external");

  const refreshOverlaySettings = async () => {
    try {
      const [overlaySettings, shortcutsStarted] = await Promise.all([
        window.underdeck.overlay.getSettings(),
        window.underdeck.shortcuts.isStarted(),
      ]);
      setOverlayEnabled(Boolean(overlaySettings?.enabled));
      setOverlayKeys(Array.isArray(overlaySettings?.keys) ? overlaySettings.keys : []);
      setOverlayCloseOnBlur(
        typeof overlaySettings?.closeOnBlur === "boolean" ? overlaySettings.closeOnBlur : true
      );
      setIsShortcutsEnabled(Boolean(shortcutsStarted));
    } catch {
      setOverlayEnabled(false);
      setOverlayKeys([]);
      setOverlayCloseOnBlur(true);
      setIsShortcutsEnabled(false);
    }
  };

  const refreshAdvancedSettings = async () => {
    try {
      const [windows, electron, updatesState, obsSettings, logs] = await Promise.all([
        window.underdeck.appSettings.getWindows(),
        window.underdeck.appSettings.getElectron(),
        window.underdeck.updates.getState(),
        window.underdeck.obs.getSettings(),
        window.underdeck.logs.getSettings(),
      ]);

      setWindowsSettings({
        autoStart: Boolean(windows?.autoStart),
        enableNotifications: Boolean(windows?.enableNotifications),
      });

      setElectronSettings({
        startMinimized: Boolean(electron?.startMinimized),
        closeToTray: Boolean(electron?.closeToTray),
        devTools: Boolean(electron?.devTools),
        openLinksInBrowser: Boolean(electron?.openLinksInBrowser),
      });

      setUpdatesAutoDownload(Boolean(updatesState?.autoDownloadEnabled));
      setObsStartOnStartup(Boolean(obsSettings?.connectOnStartup));
      setLogsSettings({
        enabled: Boolean(logs?.enabled),
        app: Boolean(logs?.app),
        shortcuts: Boolean(logs?.shortcuts),
        obs: Boolean(logs?.obs),
        soundpad: Boolean(logs?.soundpad),
        webdeck: Boolean(logs?.webdeck),
        socket: Boolean(logs?.socket),
        updates: Boolean(logs?.updates),
      });
    } catch {
      // ignore refresh errors and keep current UI state
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void refreshOverlaySettings();
    void refreshAdvancedSettings();
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = subscribe("overlay", async () => {
      if (!isOpen) return;
      await refreshOverlaySettings();
    });
    return () => {
      unsubscribe();
    };
  }, [isOpen, subscribe]);

  const handleOverlayEnabled = async (enabled: boolean) => {
    setOverlayEnabled(enabled);
    try {
      const next = await window.underdeck.overlay.updateSettings({ enabled });
      setOverlayEnabled(Boolean(next?.enabled));
      setOverlayKeys(Array.isArray(next?.keys) ? next.keys : []);
      publish({ id: "overlay.settings.enabled", channel: "overlay", sourceId: "OVERLAY_SETTINGS", data: { enabled: Boolean(next?.enabled) } });
    } catch {
      setOverlayEnabled(!enabled);
      toast.error(t("settings.overlay.save_error", "Falha ao salvar configuracao do Overlay."));
    }
  };

  const handleOverlayCloseOnBlur = async (closeOnBlur: boolean) => {
    setOverlayCloseOnBlur(closeOnBlur);
    try {
      const next = await window.underdeck.overlay.updateSettings({ closeOnBlur });
      const resolved = typeof next?.closeOnBlur === "boolean" ? next.closeOnBlur : closeOnBlur;
      setOverlayCloseOnBlur(resolved);
      publish({ id: "overlay.settings.closeOnBlur", channel: "overlay", sourceId: "OVERLAY_SETTINGS", data: { closeOnBlur: resolved } });
    } catch {
      setOverlayCloseOnBlur(!closeOnBlur);
      toast.error(t("settings.overlay.save_error", "Falha ao salvar configuracao do Overlay."));
    }
  };

  const handleCaptureOverlayKeys = async () => {
    if (!isShortcutsEnabled) {
      toast.error(t("shortcuts.capture.enable_service", "Ative o servico de atalhos para capturar teclas."));
      return;
    }
    setIsCapturingOverlayKeys(true);
    try {
      const combo = await window.underdeck.shortcuts.getComboKeys();
      if (!combo.length) {
        toast.error(t("shortcuts.capture.none", "Nenhuma tecla capturada."));
        return;
      }
      const next = await window.underdeck.overlay.updateSettings({ keys: combo });
      setOverlayEnabled(Boolean(next?.enabled));
      setOverlayKeys(Array.isArray(next?.keys) ? next.keys : []);
      publish({ id: "overlay.settings.keys", channel: "overlay", sourceId: "OVERLAY_SETTINGS", data: { keys: Array.isArray(next?.keys) ? next.keys : [] } });
    } catch {
      toast.error(t("settings.overlay.capture_error", "Falha ao capturar sequencia."));
    } finally {
      setIsCapturingOverlayKeys(false);
    }
  };

  const handleWindowsSettings = async (patch: Partial<typeof windowsSettings>) => {
    const previous = windowsSettings;
    setWindowsSettings({ ...windowsSettings, ...patch });
    try {
      const next = await window.underdeck.appSettings.setWindows(patch);
      setWindowsSettings({
        autoStart: Boolean(next?.autoStart),
        enableNotifications: Boolean(next?.enableNotifications),
      });
    } catch {
      setWindowsSettings(previous);
      toast.error(t("settings.advanced.save_error", "Falha ao salvar configuracao."));
    }
  };

  const handleElectronSettings = async (patch: Partial<typeof electronSettings>) => {
    const previous = electronSettings;
    setElectronSettings({ ...electronSettings, ...patch });
    try {
      const next = await window.underdeck.appSettings.setElectron(patch);
      setElectronSettings({
        startMinimized: Boolean(next?.startMinimized),
        closeToTray: Boolean(next?.closeToTray),
        devTools: Boolean(next?.devTools),
        openLinksInBrowser: Boolean(next?.openLinksInBrowser),
      });
    } catch {
      setElectronSettings(previous);
      toast.error(t("settings.advanced.save_error", "Falha ao salvar configuracao."));
    }
  };

  const handleUpdatesAutoDownload = async (enabled: boolean) => {
    const previous = updatesAutoDownload;
    setUpdatesAutoDownload(enabled);
    try {
      const next = await window.underdeck.updates.setAutoDownload(enabled);
      setUpdatesAutoDownload(Boolean(next?.autoDownloadEnabled));
    } catch {
      setUpdatesAutoDownload(previous);
      toast.error(t("settings.advanced.save_error", "Falha ao salvar configuracao."));
    }
  };

  const handleShortcutsService = async (enabled: boolean) => {
    const previous = isShortcutsEnabled;
    setIsShortcutsEnabled(enabled);
    try {
      const started = await window.underdeck.shortcuts.setEnabled(enabled);
      setIsShortcutsEnabled(Boolean(started));
    } catch {
      setIsShortcutsEnabled(previous);
      toast.error(t("settings.advanced.save_error", "Falha ao salvar configuracao."));
    }
  };

  const handleObsService = async (enabled: boolean) => {
    const previous = obsStartOnStartup;
    setObsStartOnStartup(enabled);
    try {
      const result = await window.underdeck.obs.updateSettings({ connectOnStartup: enabled });
      if (!result?.ok) throw new Error(result?.message || "obs settings failed");
      setObsStartOnStartup(enabled);
    } catch {
      setObsStartOnStartup(previous);
      toast.error(t("settings.advanced.save_error", "Falha ao salvar configuracao."));
    }
  };

  const handleLogsSettings = async (patch: Partial<typeof logsSettings>) => {
    const previous = logsSettings;
    const nextLocal = { ...logsSettings, ...patch };
    setLogsSettings(nextLocal);
    try {
      const updated = await window.underdeck.logs.setSettings(patch);
      setLogsSettings({
        enabled: Boolean(updated?.enabled),
        app: Boolean(updated?.app),
        shortcuts: Boolean(updated?.shortcuts),
        obs: Boolean(updated?.obs),
        soundpad: Boolean(updated?.soundpad),
        webdeck: Boolean(updated?.webdeck),
        socket: Boolean(updated?.socket),
        updates: Boolean(updated?.updates),
      });
    } catch (error: any) {
      console.log(error);
      setLogsSettings(previous);
      toast.error(t("settings.advanced.save_error", "Falha ao salvar configuracao."));
    }
  };

  const openLogFile = async (category: keyof Omit<typeof logsSettings, "enabled">) => {
    try {
      await window.underdeck.logs.openLogFile(category);
    } catch {
      toast.error(t("settings.logs.open_error"));
    }
  };

  const handleClearAllLogs = async () => {
    try {
      await window.underdeck.logs.clearLogs();
      toast.success(t("settings.logs.clear_all_success"));
    } catch {
      toast.error(t("settings.logs.clear_all_error"));
    }
  };

  const handleClearLogFile = async (category: keyof Omit<typeof logsSettings, "enabled">) => {
    try {
      await window.underdeck.logs.clearLogFile(category);
      toast.success(t("settings.logs.clear_category_success"));
    } catch {
      toast.error(t("settings.logs.clear_category_error"));
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          showCloseButton={true}
          className="sm:max-w-[75%] select-none h-[80vh] rounded-xl bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-0"
        >
          <div className="w-full h-full flex justify-between">
            <div className="flex flex-col w-75 border-r">
              <div className="w-full p-3 select-none">
                {user ? (
                  <div
                    className="flex p-2 rounded-xl hover:bg-secondary/30 cursor-pointer gap-1 items-center"
                    onClick={() => setShowProfileEditor(true)}
                  >
                    <Img
                      src={user.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                      alt={t("user.profile.avatar_alt", "Avatar")}
                      size="avatar-sm"
                      rounded="full"
                      draggable={false}
                    />
                    <div className="flex flex-col">
                      <span>{(user.displayName || user.username).toUpperCase()}</span>
                      <span className="flex gap-1 text-sm text-foreground items-center">
                        <Pencil size={16} /> {t("user.profile.edit", "Editar perfil")}
                      </span>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline-primary" rounded="xl" className="w-full h-13" onClick={modalLogin}>
                    <LogIn size={16} />
                    <div className="flex items-center gap-2">
                      <span>{t("auth.login", "Login")}</span>
                    </div>
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <span className="p-5">{t("settings.title", "Configurações")}</span>
                <div className="p-2 space-y-1 transition-colors overflow-y-auto">
                  <Button
                    variant={currentSection === "updates" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("updates")}
                  >
                    <Download size={16} />
                    {t("sidebar.updates", "Atualizações")}
                  </Button>
                  <Button
                    variant={currentSection === "advanced" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("advanced")}
                  >
                    <SlidersHorizontal size={16} />
                    {t("settings.advanced.title", "Avancado")}
                  </Button>
                  <Button
                    variant={currentSection === "language" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("language")}
                  >
                    <Languages size={16} />
                    {t("settings.section.language", "Idioma")}
                  </Button>
                  <Button
                    variant={currentSection === "obs" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("obs")}
                  >
                    <Radio size={16} />
                    {t("sidebar.obsstudio", "Obs Studio")}
                  </Button>
                  <Button
                    variant={currentSection === "overlay" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("overlay")}
                  >
                    <Layers2 size={16} />
                    {t("settings.overlay.title", "Overlay")}
                  </Button>
                  <Button
                    variant={currentSection === "soundpad" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("soundpad")}
                  >
                    <Music2 size={16} />
                    {t("sidebar.soudpad", "Sound Pad")}
                  </Button>
                  <Button
                    variant={currentSection === "theme" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("theme")}
                  >
                    <Palette size={16} />
                    {t("theme.label", "Tema")}
                  </Button>
                  {user && (
                    <Button
                      variant="ghost-destructive"
                      rounded="xl"
                      className="w-full text-left flex justify-start"
                      onClick={modalLogout}
                    >
                      <LogOut size={16} />
                      <div className="flex items-left gap-2">
                        <span>{t("auth.logout", "Sair")}</span>
                      </div>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full border-l overflow-y-auto">
              {currentSection === "theme" && (
                <Theme className="border-none" />
              )}
              {currentSection === "soundpad" && (
                <SoundPad className="border-none" />
              )}
              {currentSection === "obs" && (
                <ObsStudio className="border-none" />
              )}
              {currentSection === "updates" && (
                <UpdatePage className="border-none" />
              )}
              {currentSection === "language" && (
                <div className="p-6 grid gap-4">
                  <h3 className="text-lg font-semibold">{t("settings.section.language", "Idioma")}</h3>
                  <div className="grid gap-2">
                    <Label>{t("settings.language.current", "Idioma atual")}</Label>
                    <Select
                      value={locale}
                      onValueChange={(value) => {
                        void setLocale(value);
                      }}
                    >
                      <SelectTrigger
                        rounded="xl"
                        className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                      >
                        <SelectValue placeholder={t("settings.language.noLocales", "Nenhum idioma disponivel.")} />
                      </SelectTrigger>
                      <SelectContent
                        rounded="xl"
                        className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white"
                      >
                        {locales.map((option) => (
                          <SelectItem rounded="lg" key={option.locale} value={option.locale}>
                            {option.name}
                            {option.source === "builtin"
                              ? "" /*t("settings.language.source.builtin", "Interno")*/
                              : ` (${t("settings.language.source.external", "Importado")})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2 w-full">
                    <p className="text-sm text-muted-foreground">
                      {t("settings.language.importHelp", "Importe um arquivo JSON de tradução da comunidade.")}
                    </p>
                    <Button
                      type="button"
                      variant="outline-primary"
                      rounded="xl"
                      className="w-full"
                      onClick={() => {
                        void handleImportLocale();
                      }}
                      disabled={isImportingLocale}
                    >
                      {isImportingLocale ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t("settings.language.import", "Importar idioma")}
                    </Button>
                  </div>
                  <div className="grid gap-2 w-full">
                    <Label>{t("settings.language.external", "Traducoes adicionais")}</Label>
                    {externalLocales.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("settings.language.externalEmpty", "Nenhuma traducao adicional importada.")}
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {externalLocales.map((option) => (
                          <div
                            key={option.locale}
                            className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{option.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{option.locale}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline-destructive"
                              rounded="xl"
                              disabled={removingLocale === option.locale}
                              onClick={() => handleRemoveLocale(option.locale, option.name)}
                            >
                              {removingLocale === option.locale ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              {t("common.delete", "Deletar")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {currentSection === "overlay" && (
                <div className="p-6 grid gap-4">
                  <h3 className="text-lg font-semibold">{t("settings.overlay.title", "Overlay")}</h3>
                  <div className="grid gap-2 rounded-xl border border-border/70 bg-card/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="overlay-enable-switch">{t("settings.overlay.enable", "Habilitar Overlay")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {overlayEnabled
                            ? t("settings.overlay.enabled_state", "Overlay ativo")
                            : t("settings.overlay.disabled_state", "Overlay desativado")}
                        </p>
                      </div>
                      <Switch
                        id="overlay-enable-switch"
                        checked={overlayEnabled}
                        onCheckedChange={(checked) => {
                          void handleOverlayEnabled(Boolean(checked));
                        }}
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label htmlFor="overlay-close-on-blur-switch">
                            {t("settings.overlay.close_on_blur", "Fechar ao clicar fora")}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {overlayCloseOnBlur
                              ? t("settings.overlay.close_on_blur_enabled", "Fecha automaticamente ao perder foco")
                              : t("settings.overlay.close_on_blur_disabled", "Permanece aberto ao perder foco")}
                          </p>
                        </div>
                        <Switch
                          id="overlay-close-on-blur-switch"
                          checked={overlayCloseOnBlur}
                          onCheckedChange={(checked) => {
                            void handleOverlayCloseOnBlur(Boolean(checked));
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="overlay-shortcut-keys">{t("settings.overlay.shortcut", "Sequencia de teclas")}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="overlay-shortcut-keys"
                          rounded="xl"
                          disabled={true}
                          value={overlayKeys.join(" + ")}
                          placeholder={t("settings.overlay.shortcut_placeholder", "CTRL + ALT + O")}
                        />
                        <Button
                          type="button"
                          rounded="xl"
                          variant="outline-primary"
                          disabled={!isShortcutsEnabled || isCapturingOverlayKeys}
                          onClick={() => {
                            void handleCaptureOverlayKeys();
                          }}
                        >
                          {isCapturingOverlayKeys
                            ? t("shortcuts.capture.recording", "Gravando...")
                            : t("shortcuts.capture.button", "Capturar")}
                        </Button>
                      </div>
                      {!isShortcutsEnabled && (
                        <p className="text-xs text-muted-foreground">
                          {t("shortcuts.capture.enable_service", "Ative o servico de atalhos para capturar teclas.")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {currentSection === "advanced" && (
                <div className="p-6 grid gap-4">
                  <h3 className="text-lg font-semibold">{t("settings.advanced.title", "Avancado")}</h3>

                  <div className="grid gap-2 rounded-xl border border-border/70 bg-card/70 p-4">
                    <h4 className="text-sm font-semibold">{t("settings.advanced.services", "Serviços")}</h4>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="advanced-service-obs">{t("settings.advanced.service_obs", "OBS")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.advanced.service_obs_desc", "Inicia conexão com OBS automaticamente")}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-service-obs"
                            checked={obsStartOnStartup}
                            onCheckedChange={(checked) => {
                              void handleObsService(Boolean(checked));
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.service_obs_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="advanced-service-shortcuts">{t("settings.advanced.service_shortcuts", "Teclas de atalho")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.advanced.service_shortcuts_desc", "Habilita captura e execução de atalhos globais")}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-service-shortcuts"
                            checked={isShortcutsEnabled}
                            onCheckedChange={(checked) => {
                              void handleShortcutsService(Boolean(checked));
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.service_shortcuts_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="advanced-service-overlay">{t("settings.advanced.service_overlay", "Overlay")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.advanced.service_overlay_desc", "Ativa o serviço de janela overlay")}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-service-overlay"
                            checked={overlayEnabled}
                            onCheckedChange={(checked) => {
                              void handleOverlayEnabled(Boolean(checked));
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.service_overlay_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-border/70 bg-card/70 p-4">
                    <h4 className="text-sm font-semibold">{t("settings.advanced.section", "Avancado")}</h4>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-start-minimized">{t("settings.advanced.start_minimized", "Iniciar minimizado")}</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-start-minimized"
                            checked={electronSettings.startMinimized}
                            onCheckedChange={(checked) => {
                              void handleElectronSettings({ startMinimized: Boolean(checked) });
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.start_minimized_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-close-to-tray">{t("settings.advanced.close_to_tray", "Fechar para bandeja")}</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-close-to-tray"
                            checked={electronSettings.closeToTray}
                            onCheckedChange={(checked) => {
                              void handleElectronSettings({ closeToTray: Boolean(checked) });
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.close_to_tray_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-devtools">{t("settings.advanced.devtools", "DevTools")}</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-devtools"
                            checked={electronSettings.devTools}
                            onCheckedChange={(checked) => {
                              void handleElectronSettings({ devTools: Boolean(checked) });
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.devtools_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-open-links-browser">
                        {t("settings.advanced.open_links_in_browser", "Abrir links no navegador")}
                      </Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-open-links-browser"
                            checked={electronSettings.openLinksInBrowser}
                            onCheckedChange={(checked) => {
                              void handleElectronSettings({ openLinksInBrowser: Boolean(checked) });
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t(
                            "settings.advanced.open_links_in_browser_tooltip",
                            "Quando ativado, links externos abrem no navegador padrão."
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-auto-start">{t("settings.advanced.auto_start", "Iniciar com sistema operacional")}</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-auto-start"
                            checked={windowsSettings.autoStart}
                            onCheckedChange={(checked) => {
                              void handleWindowsSettings({ autoStart: Boolean(checked) });
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.auto_start_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-enable-notifications">{t("settings.advanced.notifications", "Notificações")}</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-enable-notifications"
                            checked={windowsSettings.enableNotifications}
                            onCheckedChange={(checked) => {
                              void handleWindowsSettings({ enableNotifications: Boolean(checked) });
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.notifications_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-auto-download-updates">{t("settings.advanced.auto_download_updates", "Baixar atualizações automaticamente")}</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Switch
                            id="advanced-auto-download-updates"
                            checked={updatesAutoDownload}
                            onCheckedChange={(checked) => {
                              void handleUpdatesAutoDownload(Boolean(checked));
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("settings.advanced.auto_download_updates_tooltip")}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-border/70 bg-card/70 p-4">
                    <h4 className="text-sm font-semibold">{t("settings.logs.title")}</h4>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="advanced-logs-enabled">{t("settings.logs.enable")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {logsSettings.enabled
                            ? t("settings.logs.enabled_state")
                            : t("settings.logs.disabled_state")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearAllLogs()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_all_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-enabled"
                              checked={logsSettings.enabled}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ enabled: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-shortcuts">{t("settings.logs.shortcuts")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("shortcuts")}
                              disabled={!logsSettings.shortcuts}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_shortcuts")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-shortcuts"
                              checked={logsSettings.shortcuts}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ shortcuts: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-obs">{t("settings.logs.obs")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("obs")}
                              disabled={!logsSettings.obs}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_obs")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-obs"
                              checked={logsSettings.obs}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ obs: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-soundpad">{t("settings.logs.soundpad")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("soundpad")}
                              disabled={!logsSettings.soundpad}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_soundpad")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-soundpad"
                              checked={logsSettings.soundpad}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ soundpad: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-webdeck">{t("settings.logs.webdeck")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("webdeck")}
                              disabled={!logsSettings.webdeck}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_webdeck")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-webdeck"
                              checked={logsSettings.webdeck}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ webdeck: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-socket">{t("settings.logs.socket")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("socket")}
                              disabled={!logsSettings.socket}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_socket")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-socket"
                              checked={logsSettings.socket}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ socket: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-updates">{t("settings.logs.updates")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("updates")}
                              disabled={!logsSettings.updates}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_updates")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-updates"
                              checked={logsSettings.updates}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ updates: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}

                    {logsSettings.enabled && (<div className="flex items-center justify-between gap-3">
                      <Label htmlFor="advanced-logs-app">{t("settings.logs.app")}</Label>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              rounded="xl"
                              size="icon-sm"
                              onClick={() => void openLogFile("app")}
                              disabled={!logsSettings.app}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.open_file_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon-sm"
                              rounded="xl"
                              onClick={() => void handleClearLogFile("shortcuts")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.clear_app")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger>
                            <Switch
                              id="advanced-logs-app"
                              checked={logsSettings.app}
                              onCheckedChange={(checked) => {
                                void handleLogsSettings({ app: Boolean(checked) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("settings.logs.enable_category_tooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {user && <UserProfileEditorModal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} />}
      <ModalConfirm
        isOpen={modalConfirm.isOpen}
        onResult={(ok) => {
          modalConfirm.onResult(ok);
          setModalConfirm({
            ...modalConfirm,
            isOpen: false,
          });
        }}
        title={modalConfirm.title}
        content={modalConfirm.content}
      />
    </>
  );
}
