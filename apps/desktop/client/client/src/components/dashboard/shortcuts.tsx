import React, { useEffect, useMemo, useState } from "react";
import { useUnderDeck } from "@/contexts/UnderDeckContext";
import { useI18n } from "@/contexts/I18nContext";
import { Loader2, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { BackgroundComp } from "@/components/ui/background";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { Button } from "@/components/ui/button";
import { ModalConfirm } from "@/components/ModalConfirm";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Shortcut } from "@/types/shortcuts";
import { AddShortcutModal } from "@/components/shortcuts/create/AddShortcutModal";

const PENDING_EDIT_SHORTCUT_KEY = "underdeck:shortcut-edit-id";

export default function Shortcuts() {
  const {
    apps,
    shortcuts,
    loading,
    deleteShortcut,
    isShortcutsEnabled,
    setShortcutsEnabled,
  } = useUnderDeck();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [confirmDeleteShortcutId, setConfirmDeleteShortcutId] = useState<string | null>(null);
  const [openDropdownShortcutId, setOpenDropdownShortcutId] = useState<string | null>(null);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [isCreateShortcutOpen, setIsCreateShortcutOpen] = useState(false);

  const appMap = useMemo(() => {
    return new Map(apps.map((app) => [app.id, app]));
  }, [apps]);

  const filteredShortcuts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return shortcuts;
    return shortcuts.filter((shortcut) => {
      const app = appMap.get(shortcut.meta_data.appId);
      const appName = app?.name ?? "";
      const keys = shortcut.meta_data.keys.join(" + ");
      return (
        shortcut.name.toLowerCase().includes(query) ||
        appName.toLowerCase().includes(query) ||
        keys.toLowerCase().includes(query)
      );
    });
  }, [shortcuts, search, appMap]);

  const editingShortcut = useMemo(
    () => (editingShortcutId ? shortcuts.find((shortcut) => shortcut.id === editingShortcutId) ?? null : null),
    [shortcuts, editingShortcutId]
  );

  const openEditShortcut = (shortcut: Shortcut) => {
    setIsCreateShortcutOpen(false);
    setEditingShortcutId(shortcut.id);
  };

  const openCreateShortcutModal = () => {
    const firstApp = apps[0];
    if (!firstApp) {
      toast.error(t("shortcuts.create.requires_app", "Adicione um aplicativo antes de criar um atalho."));
      return;
    }
    setIsCreateShortcutOpen(true);
    setEditingShortcutId(null);
  };

  useEffect(() => {
    const pendingId = window.sessionStorage.getItem(PENDING_EDIT_SHORTCUT_KEY);
    if (!pendingId) return;
    const pendingShortcut = shortcuts.find((shortcut) => shortcut.id === pendingId);
    if (!pendingShortcut) return;
    openEditShortcut(pendingShortcut);
    window.sessionStorage.removeItem(PENDING_EDIT_SHORTCUT_KEY);
  }, [shortcuts]);

  if (loading) {
    return (
      <div className="p-2 grid w-full max-w-full gap-4 select-none">
        <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm">
          <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("shortcuts.loading", "Carregando atalhos...")}
          </h3>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-2 grid w-full max-w-full select-none">
      <Card className="w-full min-w-0 border-border/70 bg-card/70 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full min-w-[220px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              rounded="xl"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("shortcuts.search_placeholder", "Pesquisar atalhos...")}
              className="pl-9 border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline-primary" rounded="xl" onClick={openCreateShortcutModal}>
              {t("shortcuts.add_button", "Adicionar Atalho")}
            </Button>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
              <div className="text-right">
                <Label htmlFor="shortcuts-service-switch">{t("shortcuts.service.label", "Servico de atalhos")}</Label>
                <p className="text-xs text-muted-foreground">
                  {isShortcutsEnabled
                    ? t("shortcuts.service.active", "Ativo")
                    : t("shortcuts.service.inactive", "Desativado")}
                </p>
              </div>
              <Switch
                id="shortcuts-service-switch"
                checked={isShortcutsEnabled}
                onCheckedChange={(checked) => {
                  setShortcutsEnabled(Boolean(checked));
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {filteredShortcuts.length === 0 && (
        <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm mt-2">
          <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
            {search.trim()
              ? t("shortcuts.empty.filtered", "Nenhum atalho encontrado.")
              : t("shortcuts.empty.default", "Nenhum atalho adicionado.")}
          </h3>
          {!search.trim() && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              {t("shortcuts.empty.hint", "Adicione atalhos na tela de aplicativos.")}
            </p>
          )}
        </Card>
      )}
      {filteredShortcuts.length > 0 && (
        <Card className="grid grid-cols-1 bg-transparent border-none shadow-none gap-4 border-none sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredShortcuts.map((shortcut) => (
            <Card
              key={shortcut.id}
              className="group relative min-h-[220px] overflow-hidden rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm"
            >
              {shortcut.icon ? (
                <BackgroundComp
                  variant="image"
                  imageSrc={shortcut.icon}
                  imageAlt={shortcut.name}
                  fullScreen={false}
                  className="absolute inset-0 transition-transform duration-300 group-hover:scale-115"
                  overlayClassName="bg-black/35"
                />
              ) : (
                <BackgroundComp
                  variant="neural"
                  fullScreen={false}
                  className="absolute inset-0 transition-transform duration-300 group-hover:scale-115"
                  neuralPointCount={30}
                  neuralLinkDistance={170}
                  neuralColors={{
                    center: "rgba(22, 32, 94, 0.55)",
                    middle: "rgb(24, 26, 52)",
                    edge: "rgb(8, 10, 22)",
                    dot: "rgba(153, 209, 255, 0.9)",
                  }}
                />
              )}
              <div className="absolute right-3 top-3 z-20">
                <DropdownUp
                  open={openDropdownShortcutId === shortcut.id}
                  onOpenChange={(open) => setOpenDropdownShortcutId(open ? shortcut.id : null)}
                >
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
                    className="w-36 gap-1 rounded-xl border-border/70 bg-popover/95 p-1 shadow-xl backdrop-blur-md transparent:bg-black/85 select-none"
                  >
                    <Button
                      type="button"
                      variant="ghost-secondary"
                      rounded="xl"
                      onClick={() => {
                        setOpenDropdownShortcutId(null);
                        openEditShortcut(shortcut);
                      }}
                      className="w-full"
                    >
                      {t("common.edit", "Editar")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      rounded="xl"
                      onClick={() => {
                        setOpenDropdownShortcutId(null);
                        setConfirmDeleteShortcutId(shortcut.id);
                      }}
                      className="w-full"
                    >
                      {t("common.delete", "Deletar")}
                    </Button>
                  </DropdownUpContent>
                </DropdownUp>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-end p-4">
                <h3 className="line-clamp-2 text-base font-semibold text-white">{shortcut.name}</h3>
                <p className="text-sm text-white/90">
                  {t("shortcuts.type_prefix", "Tipo")} {appMap.get(shortcut.meta_data.appId)?.type ?? t("shortcuts.unknown", "Desconhecido")}
                </p>
                <p className="text-sm text-white/90">
                  {shortcut.meta_data.keys.length ? shortcut.meta_data.keys.join(" + ") : t("shortcuts.no_keys", "Sem teclas")}
                </p>
              </div>
            </Card>
          ))}
        </Card>
      )}

      <ModalConfirm
        isOpen={!!confirmDeleteShortcutId}
        title={t("shortcuts.delete.title", "Deletar atalho")}
        content={t("shortcuts.delete.content", "Tem certeza que deseja deletar este atalho?")}
        confirmText={t("common.delete", "Deletar")}
        cancelText={t("common.cancel", "Cancelar")}
        onResult={async (confirmed) => {
          const targetId = confirmDeleteShortcutId;
          setConfirmDeleteShortcutId(null);
          if (!confirmed || !targetId) return;
          await deleteShortcut(targetId);
        }}
      />

      <AddShortcutModal
        trigger={null}
        shortcutToEdit={editingShortcut}
        open={isCreateShortcutOpen || !!editingShortcut}
        onOpenChange={(open) => {
          if (!open) {
            setEditingShortcutId(null);
            setIsCreateShortcutOpen(false);
          }
        }}
      />
    </div>
  );
}

