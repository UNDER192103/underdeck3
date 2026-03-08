import React, { useMemo, useState } from 'react';
import { useUnderDeck } from '@/contexts/UnderDeckContext';
import { useI18n } from '@/contexts/I18nContext';
import { Loader2, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AddAppModal } from '@/components/apps/create/AddAppModal';
import { BackgroundComp } from '@/components/ui/background';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from '@/components/ui/dropdown-up';
import { ModalConfirm } from '@/components/ModalConfirm';
import { Button } from '@/components/ui/button';
import { Shortcut } from '@/types/shortcuts';

const PENDING_EDIT_SHORTCUT_KEY = "underdeck:shortcut-edit-id";

export default function Apps() {
    const { apps, shortcuts, loading, executeApp, deleteApp, repositionApp, createShortcut } = useUnderDeck();
    const { t } = useI18n();
    const [, setLocation] = useLocation();
    const [search, setSearch] = useState("");
    const [draggingAppId, setDraggingAppId] = useState<string | null>(null);
    const [confirmDeleteAppId, setConfirmDeleteAppId] = useState<string | null>(null);
    const [openDropdownAppId, setOpenDropdownAppId] = useState<string | null>(null);
    const [editingAppId, setEditingAppId] = useState<string | null>(null);

    const filteredApps = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return apps;
        return apps.filter((app) => app.name.toLowerCase().includes(query));
    }, [apps, search]);
    const editingApp = useMemo(
        () => (editingAppId ? apps.find((app) => app.id === editingAppId) ?? null : null),
        [apps, editingAppId]
    );

    const handleExecuteApp = async (id: string) => {
        await executeApp(id);
    };

    const handleDeleteApp = async (id: string) => {
        await deleteApp(id);
    };

    const handleReposition = async (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        const toIndex = apps.findIndex((item) => item.id === targetId);
        if (toIndex < 0) return;
        await repositionApp(sourceId, toIndex);
    };

    const handleCreateShortcut = async (appId: string) => {
        const targetApp = apps.find((app) => app.id === appId);
        if (!targetApp) return;

        const existingShortcut = shortcuts.find((shortcut) => shortcut.meta_data.appId === appId);
        if (existingShortcut) {
            window.sessionStorage.setItem(PENDING_EDIT_SHORTCUT_KEY, existingShortcut.id);
            toast.info(t("apps.shortcut.exists_capture", "Atalho ja existe. Abra e capture as teclas."));
            setLocation('/shortcuts');
            return;
        }

        const shortcut: Shortcut = {
            id: crypto.randomUUID(),
            type: 1,
            name: targetApp.name,
            icon: targetApp.icon,
            banner: targetApp.banner ?? null,
            description: targetApp.description,
            meta_data: {
                appId: targetApp.id,
                keys: [],
            },
        };
        const created = await createShortcut(shortcut);
        if (!created) return;
        window.sessionStorage.setItem(PENDING_EDIT_SHORTCUT_KEY, created.id);
        setLocation('/shortcuts');
    };

    if (loading) {
        return (
            <div className="p-2 grid w-full max-w-full gap-4">
                <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm">
                    <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {t("apps.loading", "Carregando aplicativos...")}
                    </h3>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-2 grid w-full max-w-full select-none">
            <Card className="w-full min-w-0 border-border/70 bg-card/70 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                    <div className="relative w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            rounded="xl"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t("apps.search_placeholder", "Pesquisar aplicativos...")}
                            className="pl-9 border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                        />
                    </div>
                    <AddAppModal />
                </div>
            </Card>

            {filteredApps.length === 0 && (
                <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm mt-2">
                    <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
                        {search.trim()
                            ? t("apps.empty.filtered", "Nenhum aplicativo encontrado.")
                            : t("apps.empty.default", "Nenhum aplicativo adicionado.")}
                    </h3>
                </Card>
            )}
            {filteredApps.length > 0 && (
                <Card className="grid grid-cols-1 bg-transparent border-none shadow-none gap-4 border-none sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredApps.map((app) => (
                        <Card
                            key={app.id}
                            draggable={!search.trim()}
                            onDragStart={() => setDraggingAppId(app.id)}
                            onDragOver={(event) => {
                                if (!draggingAppId || draggingAppId === app.id) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={async (event) => {
                                event.preventDefault();
                                if (!draggingAppId) return;
                                await handleReposition(draggingAppId, app.id);
                                setDraggingAppId(null);
                            }}
                            onDragEnd={() => setDraggingAppId(null)}
                            onDoubleClick={() => handleExecuteApp(app.id)}
                            className="cursor-pointer group relative min-h-[220px] overflow-hidden rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm"
                        >
                            {app.icon ? (
                                <BackgroundComp
                                    variant="image"
                                    imageSrc={app.icon}
                                    imageAlt={app.name}
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
                                        dot: "rgba(153, 209, 255, 0.9)"
                                    }}
                                />
                            )}
                            <div className="absolute right-3 top-3 z-20">
                                <DropdownUp
                                    open={openDropdownAppId === app.id}
                                    onOpenChange={(open) => setOpenDropdownAppId(open ? app.id : null)}
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
                                                setOpenDropdownAppId(null);
                                                handleExecuteApp(app.id);
                                            }}
                                            className="w-full"
                                        >
                                            {t("common.execute", "Executar")}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost-secondary"
                                            rounded="xl"
                                            onClick={() => {
                                                setOpenDropdownAppId(null);
                                                handleCreateShortcut(app.id);
                                            }}
                                            className="w-full"
                                        >
                                            {t("apps.menu.create_shortcut", "Criar Atalho")}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost-secondary"
                                            rounded="xl"
                                            onClick={() => {
                                                setOpenDropdownAppId(null);
                                                setEditingAppId(app.id);
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
                                                setOpenDropdownAppId(null);
                                                setConfirmDeleteAppId(app.id);
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
                                <h3 className="line-clamp-2 text-base font-semibold text-white">{app.name}</h3>
                                <p className="text-sm text-white/80">{t("apps.type_prefix", "Tipo")} {app.type}</p>
                            </div>
                        </Card>
                    ))}
                </Card>
            )}
            <ModalConfirm
                isOpen={!!confirmDeleteAppId}
                title={t("apps.delete.title", "Deletar aplicativo")}
                content={t("apps.delete.content", "Tem certeza que deseja deletar este aplicativo?")}
                confirmText={t("common.delete", "Deletar")}
                cancelText={t("common.cancel", "Cancelar")}
                onResult={async (confirmed) => {
                    const targetId = confirmDeleteAppId;
                    setConfirmDeleteAppId(null);
                    if (!confirmed || !targetId) return;
                    await handleDeleteApp(targetId);
                }}
            />
            <AddAppModal
                appToEdit={editingApp}
                open={!!editingApp}
                onOpenChange={(open) => {
                    if (!open) setEditingAppId(null);
                }}
                trigger={null}
            />
        </div>
    );
}
