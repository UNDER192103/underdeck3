import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { Loader2, LogIn, LogOut, Pencil, Layers2, Trash2, Languages, Palette, Music2, Radio } from "lucide-react";
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
import { useObserver } from "@/contexts/ObserverContext";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModalSettings({ isOpen, onClose }: UserProfileModalProps) {
  const { modalLogin, logout, user } = useUser();
  const { t, locale, locales, setLocale, importLocaleFile, removeLocale } = useI18n();
  const [currentSection, setCurrentSection] = useState<"theme" | "language" | "obs" | "soundpad" | "overlay">("theme");
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
  const { publish, subscribe } = useObserver();

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

  useEffect(() => {
    if (!isOpen) return;
    void refreshOverlaySettings();
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
      publish({ id: "overlay.settings.enabled", channel: "overlay", data: { enabled: Boolean(next?.enabled) } });
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
      publish({ id: "overlay.settings.closeOnBlur", channel: "overlay", data: { closeOnBlur: resolved } });
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
      publish({ id: "overlay.settings.keys", channel: "overlay", data: { keys: Array.isArray(next?.keys) ? next.keys : [] } });
    } catch {
      toast.error(t("settings.overlay.capture_error", "Falha ao capturar sequencia."));
    } finally {
      setIsCapturingOverlayKeys(false);
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
                    variant={currentSection === "theme" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("theme")}
                  >
                    <Palette size={16} />
                    {t("theme.label", "Tema")}
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
                    variant={currentSection === "obs" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("obs")}
                  >
                    <Radio size={16} />
                    {t("sidebar.obsstudio", "Obs Studio")}
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
                    variant={currentSection === "overlay" ? "primary" : "ghost-secondary"}
                    rounded="xl"
                    className="w-full text-left flex justify-start"
                    onClick={() => setCurrentSection("overlay")}
                  >
                    <Layers2 size={16} />
                    {t("settings.overlay.title", "Overlay")}
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

