import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Shortcut, ShortcutKey } from "@/types/shortcuts";

const getKeyLabel = (key: ShortcutKey | string) => (typeof key === "string" ? key : key.key);
const toShortcutKey = (key: ShortcutKey | string): ShortcutKey =>
  typeof key === "string" ? { keyCode: 0, key } : key;
const formatKeyCombo = (keys: Array<ShortcutKey | string>) =>
  keys.map(getKeyLabel).filter(Boolean).join(" + ");

interface AddShortcutModalProps {
  shortcutToEdit?: Shortcut | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialAppId?: string;
}

export function AddShortcutModal({
  shortcutToEdit = null,
  trigger,
  open: controlledOpen,
  onOpenChange,
  initialAppId,
}: AddShortcutModalProps) {
  const { t } = useI18n();
  const { apps, shortcuts, createShortcut, updateShortcut } = useUnderDeck();
  const [localOpen, setLocalOpen] = useState(false);
  const [isCapturingCombo, setIsCapturingCombo] = useState(false);
  const [appId, setAppId] = useState("");
  const [keys, setKeys] = useState<ShortcutKey[]>([]);
  const [keysLabel, setKeysLabel] = useState("");
  const open = typeof controlledOpen === "boolean" ? controlledOpen : localOpen;
  const isEditing = !!shortcutToEdit;

  const appMap = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);

  const setDialogOpen = (nextOpen: boolean) => {
    if (typeof controlledOpen !== "boolean") {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const resetForm = () => {
    if (shortcutToEdit) {
      const normalizedKeys = Array.isArray(shortcutToEdit.meta_data.keys)
        ? shortcutToEdit.meta_data.keys.map(toShortcutKey)
        : [];
      setAppId(shortcutToEdit.meta_data.appId);
      setKeys(normalizedKeys);
      setKeysLabel(formatKeyCombo(normalizedKeys));
      return;
    }
    const defaultAppId = initialAppId || apps[0]?.id || "";
    setAppId(defaultAppId);
    setKeys([]);
    setKeysLabel("");
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, shortcutToEdit, initialAppId, apps]);

  const handleCaptureCombo = async () => {
    setIsCapturingCombo(true);
    try {
      const combo = await window.underdeck.shortcuts.getComboKeys();
      if (!combo.length) {
        toast.error(t("shortcuts.capture.none", "Nenhuma tecla capturada."));
        return;
      }
      const normalizedCombo = combo.map(toShortcutKey);
      setKeys(normalizedCombo);
      setKeysLabel(formatKeyCombo(normalizedCombo));
    } finally {
      setIsCapturingCombo(false);
    }
  };

  const handleSave = async () => {
    if (!appId) {
      toast.error(t("shortcuts.select_app", "Selecione um aplicativo."));
      return;
    }

    if (!keys.length) {
      toast.error(t("shortcuts.keys.required", "Informe pelo menos uma tecla."));
      return;
    }

    const relatedApp = appMap.get(appId);
    if (!relatedApp) {
      toast.error(t("shortcuts.app.not_found", "Aplicativo selecionado não encontrado."));
      return;
    }

    if (!isEditing) {
      const duplicateForApp = shortcuts.some((shortcut) => shortcut.meta_data.appId === appId);
      if (duplicateForApp) {
        toast.error(t("shortcuts.app.duplicate", "Este aplicativo ja possui atalho."));
        return;
      }

      const newShortcut: Shortcut = {
        id: crypto.randomUUID(),
        type: 1,
        name: relatedApp.name,
        icon: relatedApp.icon,
        banner: relatedApp.banner ?? null,
        description: relatedApp.description,
        meta_data: {
          appId,
          keys,
        },
      };
      const created = await createShortcut(newShortcut);
      if (!created) return;
      setDialogOpen(false);
      return;
    }

    if (!shortcutToEdit) return;
    const duplicateForApp = shortcuts.some((shortcut) => (
      shortcut.id !== shortcutToEdit.id && shortcut.meta_data.appId === appId
    ));
    if (duplicateForApp) {
      toast.error(t("shortcuts.app.duplicate", "Este aplicativo ja possui atalho."));
      return;
    }

    const updatedShortcut: Shortcut = {
      ...shortcutToEdit,
      name: relatedApp.name,
      icon: relatedApp.icon,
      banner: relatedApp.banner ?? shortcutToEdit.banner,
      description: relatedApp.description,
      meta_data: {
        appId,
        keys,
      },
    };
    const result = await updateShortcut(updatedShortcut);
    if (!result) return;
    setDialogOpen(false);
  };

  const options = apps.map((app) => ({
    value: app.id,
    label: app.name,
    app,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setDialogOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-xl rounded-xl app-create-modal-content select-none">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t("shortcuts.modal.edit_title", "Editar Atalho")
              : t("shortcuts.modal.add_title", "Adicionar Atalho")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("shortcuts.modal.app_label", "Aplicativo")}</Label>
            <SearchableSelect
              options={options}
              value={appId || null}
              onSelect={(value) => setAppId(value ?? "")}
              placeholder={t("shortcuts.modal.select_app", "Selecione o aplicativo")}
              searchPlaceholder={t("shortcuts.search_placeholder", "Pesquisar atalhos...")}
              emptyMessage={t("apps.empty.default", "Nenhum aplicativo adicionado.")}
              triggerClassName="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              contentClassName="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white"
              renderOption={(option) => (
                <div className="truncate">{option.app?.name ?? option.label}</div>
              )}
              renderValue={(option) => (
                <span className="truncate">{option?.app?.name ?? option?.label ?? ""}</span>
              )}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shortcut-keys">{t("shortcuts.modal.keys_label", "Teclas")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="shortcut-keys"
                rounded="xl"
                className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                value={keysLabel}
                disabled={true}
                onChange={(event) => setKeysLabel(event.target.value)}
                placeholder={t("shortcuts.modal.keys_placeholder", "CTRL + ALT + P")}
              />
              <Button
                type="button"
                variant="outline-primary"
                rounded="xl"
                onClick={handleCaptureCombo}
                disabled={isCapturingCombo}
                className={isCapturingCombo ? "animate-pulse" : undefined}
              >
                {isCapturingCombo
                  ? t("shortcuts.capture.recording", "Gravando...")
                  : t("shortcuts.capture.button", "Capturar")}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost-destructive"
            rounded="xl"
            onClick={() => setDialogOpen(false)}
          >
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button rounded="xl" onClick={handleSave}>
            {t("common.save", "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
