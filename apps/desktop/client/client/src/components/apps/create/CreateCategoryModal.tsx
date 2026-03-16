import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { App } from "@/types/apps";
import type { AppCategory } from "@/types/categories";

interface CreateCategoryModalProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  defaultAppIds?: string[];
  showAppSelect?: boolean;
  availableApps?: App[];
  onCreated?: (category: AppCategory) => void;
}

export function CreateCategoryModal({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  defaultAppIds = [],
  showAppSelect = false,
  availableApps = [],
  onCreated,
}: CreateCategoryModalProps) {
  const { t } = useI18n();
  const { createCategory } = useUnderDeck();
  const [localOpen, setLocalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [selectedApps, setSelectedApps] = useState<string[]>(defaultAppIds);
  const previewRequestIdRef = useRef(0);
  const open = typeof controlledOpen === "boolean" ? controlledOpen : localOpen;

  const setDialogOpen = (nextOpen: boolean) => {
    if (typeof controlledOpen !== "boolean") {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const resetForm = () => {
    setName("");
    setIcon("");
    setIconPreview(null);
    setSelectedApps(defaultAppIds);
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, defaultAppIds.join("|")]);

  useEffect(() => {
    const iconValue = icon.trim();
    const requestId = ++previewRequestIdRef.current;

    if (!iconValue) {
      setIconPreview(null);
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
  }, [icon]);

  const handleSelectIcon = async () => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("categories.modal.pick_icon", "Selecionar icone"),
      buttonLabel: t("common.select", "Selecionar"),
      filters: [
        {
          name: t("common.images", "Imagens"),
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg"],
        },
      ],
    });

    if (!selectedPath || Array.isArray(selectedPath)) return;
    setIcon(selectedPath);

    const previewDataUrl = await window.underdeck.dialog.readFileAsDataUrl(selectedPath);
    setIconPreview(previewDataUrl ?? null);
  };

  const appOptions = useMemo(
    () => availableApps.map((app) => ({ value: app.id, label: app.name })),
    [availableApps]
  );

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t("categories.modal.name_required", "Informe o nome da categoria."));
      return;
    }

    const apps = showAppSelect ? selectedApps : defaultAppIds;
    const payload: AppCategory = {
      id: crypto.randomUUID(),
      name: name.trim(),
      icon: icon.trim() || null,
      apps,
      timestamp: Date.now(),
    };

    setSaving(true);
    try {
      const created = await createCategory(payload);
      if (!created) return;
      onCreated?.(created);
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
            {t("categories.add", "Adicionar categoria")}
          </Button>
        ) : trigger;

        if (!resolvedTrigger) return null;
        return <DialogTrigger asChild>{resolvedTrigger}</DialogTrigger>;
      })()}
      <DialogContent className="max-w-lg rounded-xl select-none more-dark">
        <DialogHeader>
          <DialogTitle>{title ?? t("categories.modal.add_title", "Adicionar Categoria")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("categories.modal.description", "Crie uma categoria para organizar seus apps.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="category-name">{t("common.name", "Nome")}</Label>
            <Input
              id="category-name"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("categories.modal.name_placeholder", "Nome da categoria")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category-icon">{t("categories.modal.icon_label", "Icone (opcional)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="category-icon"
                rounded="xl"
                className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="C:\\icon.png (opcional)"
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
                  alt={t("categories.modal.icon_preview", "Preview do icone")}
                  className="h-48 w-full rounded-xl border border-border/70 bg-black/20 object-cover"
                />
              </div>
            )}
          </div>

          {showAppSelect && (
            <div className="grid gap-2">
              <Label>{t("categories.modal.apps_label", "Apps na categoria")}</Label>
              <MultiSelect
                placeholder={t("categories.modal.apps_placeholder", "Selecione apps")}
                rounded="xl"
                options={appOptions}
                value={selectedApps}
                onValueChange={setSelectedApps}
                maxCount={availableApps.length}
              />
            </div>
          )}
        </div>

        <DialogFooter>
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
