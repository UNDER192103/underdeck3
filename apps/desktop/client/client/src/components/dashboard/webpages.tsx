import React, { useMemo, useState } from "react";
import { ImagePlus, Loader2, Plus, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { useI18n } from "@/contexts/I18nContext";
import { BackgroundComp } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { ModalConfirm } from "@/components/ModalConfirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { WebPage } from "@/types/webpages";

type WebPageFormState = {
  name: string;
  icon: string;
  url: string;
};

const DEFAULT_FORM_STATE: WebPageFormState = {
  name: "",
  icon: "",
  url: "",
};

function WebPageModal({
  pageToEdit,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  pageToEdit?: WebPage | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { createWebPage, updateWebPage } = useUnderDeck();
  const [localOpen, setLocalOpen] = useState(false);
  const [state, setState] = useState<WebPageFormState>(DEFAULT_FORM_STATE);
  const [saving, setSaving] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const open = typeof controlledOpen === "boolean" ? controlledOpen : localOpen;

  const setDialogOpen = (nextOpen: boolean) => {
    if (typeof controlledOpen !== "boolean") {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const resetForm = () => {
    if (!pageToEdit) {
      setState(DEFAULT_FORM_STATE);
      setIconPreview(null);
      return;
    }
    setState({
      name: pageToEdit.name ?? "",
      icon: "",
      url: pageToEdit.url ?? "",
    });
    setIconPreview(pageToEdit.icon ?? null);
  };

  React.useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, pageToEdit]);

  React.useEffect(() => {
    const iconValue = state.icon.trim();
    if (!iconValue) {
      setIconPreview(pageToEdit?.icon ?? null);
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
      setIconPreview(previewDataUrl ?? null);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [state.icon, pageToEdit]);

  const handleSelectIcon = async () => {
    const selectedPath = await window.underdeck.dialog.selectFile({
      title: t("webpages.modal.pick_icon", "Selecionar icone"),
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

  const handleSave = async () => {
    if (!state.name.trim()) {
      toast.error(t("webpages.modal.name_required", "Informe o nome da pagina."));
      return;
    }
    if (!state.url.trim()) {
      toast.error(t("webpages.modal.url_required", "Informe a URL."));
      return;
    }

    const payload: WebPage = {
      id: pageToEdit?.id ?? crypto.randomUUID(),
      name: state.name.trim(),
      icon: state.icon.trim() || pageToEdit?.icon || null,
      url: state.url.trim(),
      createdAt: pageToEdit?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    setSaving(true);
    try {
      const result = pageToEdit ? await updateWebPage(payload) : await createWebPage(payload);
      if (!result) return;
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
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline-primary" rounded="xl">
              <Plus className="h-4 w-4" />
              {t("webpages.add", "Adicionar pagina")}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg rounded-xl more-dark select-none">
        <DialogHeader>
          <DialogTitle>
            {pageToEdit ? t("webpages.edit_title", "Editar pagina") : t("webpages.add_title", "Adicionar pagina")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("webpages.modal.description", "Configure nome, icone e URL da pagina.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="webpage-name">{t("common.name", "Nome")}</Label>
            <Input
              id="webpage-name"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("webpages.modal.name_placeholder", "Nome da pagina")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webpage-icon">{t("webpages.modal.icon_label", "Icone (opcional)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="webpage-icon"
                rounded="xl"
                className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                value={state.icon}
                onChange={(event) => setState((prev) => ({ ...prev, icon: event.target.value }))}
                placeholder="C:\\icon.png (opcional)"
              />
              <Button type="button" variant="outline-primary" rounded="xl" onClick={handleSelectIcon}>
                <ImagePlus className="h-4 w-4" />
                {t("common.choose", "Escolher")}
              </Button>
            </div>
            {iconPreview && (
              <div className="w-fill">
                <img
                  src={iconPreview}
                  alt={t("webpages.modal.icon_preview", "Preview do icone")}
                  className="h-48 w-full rounded-xl border border-border/70 bg-black/20 object-cover"
                />
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webpage-url">URL</Label>
            <Input
              id="webpage-url"
              rounded="xl"
              className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
              value={state.url}
              onChange={(event) => setState((prev) => ({ ...prev, url: event.target.value }))}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost-destructive" rounded="xl" onClick={() => setDialogOpen(false)} disabled={saving}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button rounded="xl" onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving", "Salvando...") : t("common.save", "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WebPages() {
  const { webPages, webPagesSettings, updateWebPagesSettings, deleteWebPage, openWebPage, closeAllWebPages, loading } = useUnderDeck();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const filteredPages = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return webPages;
    return webPages.filter((page) => page.name.toLowerCase().includes(query));
  }, [webPages, search]);

  const editingPage = useMemo(
    () => (editingPageId ? webPages.find((page) => page.id === editingPageId) ?? null : null),
    [webPages, editingPageId]
  );

  const addCacheBuster = (url: string | null | undefined, timestamp?: number): string | null => {
    if (!url) return null;
    const safeTimestamp = Number(timestamp ?? 0) || Date.now();
    const hasQuery = url.includes("?");
    return `${url}${hasQuery ? "&" : "?"}v=${safeTimestamp}`;
  };

  if (loading) {
    return (
      <div className="p-2 grid w-full max-w-full gap-4">
        <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm">
          <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("webpages.loading", "Carregando paginas...")}
          </h3>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-2 grid w-full max-w-full select-none">
      <Card className="w-full min-w-0 border-border/70 bg-card/70 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              rounded="xl"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("webpages.search_placeholder", "Buscar paginas...")}
              className="pl-9 border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline-primary" rounded="xl" onClick={() => void closeAllWebPages()}>
              {t("webpages.close_all", "Fechar todas")}
            </Button>
            <WebPageModal trigger={undefined} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3">
            <div>
              <p className="text-sm font-medium">{t("webpages.adblock", "Usar Adblock")}</p>
              <p className="text-xs text-muted-foreground">{t("webpages.adblock_desc", "Bloqueia anuncios nas paginas.")}</p>
            </div>
            <Switch
              checked={Boolean(webPagesSettings?.useAdblock)}
              onCheckedChange={(checked) => void updateWebPagesSettings({ useAdblock: Boolean(checked) })}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3">
            <div>
              <p className="text-sm font-medium">{t("webpages.block_new_windows", "Bloquear novas janelas")}</p>
              <p className="text-xs text-muted-foreground">{t("webpages.block_new_windows_desc", "Impede abrir novas janelas.")}</p>
            </div>
            <Switch
              checked={Boolean(webPagesSettings?.blockNewWindows)}
              onCheckedChange={(checked) => void updateWebPagesSettings({ blockNewWindows: Boolean(checked) })}
            />
          </div>
        </div>
      </Card>

      {filteredPages.length === 0 && (
        <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm mt-2">
          <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
            {search.trim()
              ? t("webpages.empty.filtered", "Nenhuma pagina encontrada.")
              : t("webpages.empty.default", "Nenhuma pagina registrada.")}
          </h3>
        </Card>
      )}

      {filteredPages.length > 0 && (
        <Card className="grid grid-cols-1 bg-transparent border-none shadow-none gap-4 border-none sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-2">
          {filteredPages.map((page) => (
            <Card
              key={page.id}
              onDoubleClick={() => void openWebPage(page.id)}
              className="cursor-pointer group relative min-h-[220px] overflow-hidden rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm"
            >
              {page.icon ? (
                <BackgroundComp
                  variant="image"
                  imageSrc={addCacheBuster(page.icon, page.updatedAt) ?? page.icon}
                  imageAlt={page.name}
                  fullScreen={false}
                  className="absolute inset-0 transition-transform duration-300 group-hover:scale-115"
                  overlayClassName="bg-black/35"
                />
              ) : (
                <BackgroundComp
                  variant="neural"
                  fullScreen={false}
                  className="absolute inset-0 transition-transform duration-300 group-hover:scale-115"
                  neuralPointCount={24}
                  neuralLinkDistance={170}
                  neuralColors={{
                    center: "rgba(20, 80, 120, 0.55)",
                    middle: "rgb(18, 30, 52)",
                    edge: "rgb(8, 14, 22)",
                    dot: "rgba(120, 220, 255, 0.9)"
                  }}
                />
              )}
              <div className="absolute right-3 top-3 z-20">
                <DropdownUp>
                  <DropdownUpTrigger asChild>
                    <button
                      type="button"
                      className="group/gear inline-flex h-8 w-8 items-center justify-center rounded-full border-none bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
                    >
                      <Settings2 className="h-4 w-4 transition-transform duration-300 group-hover/gear:rotate-45" />
                    </button>
                  </DropdownUpTrigger>
                  <DropdownUpContent
                    mode="automatic"
                    direction="down"
                    align="end"
                    className="w-32 gap-1 rounded-xl border-border/70 bg-popover/95 p-1 shadow-xl backdrop-blur-md transparent:bg-black/85 select-none"
                  >
                    <Button
                      type="button"
                      variant="ghost-secondary"
                      rounded="xl"
                      onClick={() => void openWebPage(page.id)}
                      className="w-full"
                    >
                      {t("common.open", "Abrir")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost-secondary"
                      rounded="xl"
                      onClick={() => setEditingPageId(page.id)}
                      className="w-full"
                    >
                      {t("common.edit", "Editar")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      rounded="xl"
                      onClick={() => setConfirmDeleteId(page.id)}
                      className="w-full"
                    >
                      {t("common.delete", "Deletar")}
                    </Button>
                  </DropdownUpContent>
                </DropdownUp>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-end p-4">
                <h3 className="line-clamp-2 text-base font-semibold text-white">{page.name}</h3>
                <p className="text-sm text-white/80">{page.url}</p>
              </div>
            </Card>
          ))}
        </Card>
      )}

      <ModalConfirm
        isOpen={!!confirmDeleteId}
        title={t("webpages.delete.title", "Deletar pagina")}
        content={t("webpages.delete.content", "Tem certeza que deseja deletar esta pagina?")}
        confirmText={t("common.delete", "Deletar")}
        cancelText={t("common.cancel", "Cancelar")}
        onResult={async (confirmed) => {
          const targetId = confirmDeleteId;
          setConfirmDeleteId(null);
          if (!confirmed || !targetId) return;
          await deleteWebPage(targetId);
        }}
      />

      <WebPageModal
        pageToEdit={editingPage}
        open={!!editingPage}
        onOpenChange={(open) => {
          if (!open) setEditingPageId(null);
        }}
        trigger={null}
      />
    </div>
  );
}
