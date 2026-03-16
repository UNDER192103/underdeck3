import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUnderDeck } from '@/contexts/UnderDeckContext';
import { useI18n } from '@/contexts/I18nContext';
import { ArrowLeft, Folder, Loader2, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigation } from "@/contexts/NavigationContext";
import { AddAppModal } from '@/components/apps/create/AddAppModal';
import { CreateCategoryModal } from '@/components/apps/create/CreateCategoryModal';
import { BackgroundComp } from '@/components/ui/background';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from '@/components/ui/dropdown-up';
import { ModalConfirm } from '@/components/ModalConfirm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Shortcut } from '@/types/shortcuts';

const PENDING_EDIT_SHORTCUT_KEY = "underdeck:shortcut-edit-id";

export default function Apps() {
    const { apps, categories, shortcuts, loading, executeApp, deleteApp, repositionApp, createShortcut, setAppCategory, updateCategory, deleteCategory } = useUnderDeck();
    const { t } = useI18n();
    const { set } = useNavigation();
    const [search, setSearch] = useState("");
    const [draggingAppId, setDraggingAppId] = useState<string | null>(null);
    const [confirmDeleteAppId, setConfirmDeleteAppId] = useState<string | null>(null);
    const [openDropdownAppId, setOpenDropdownAppId] = useState<string | null>(null);
    const [openDropdownCategoryId, setOpenDropdownCategoryId] = useState<string | null>(null);
    const [editingAppId, setEditingAppId] = useState<string | null>(null);
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
    const [moveAppId, setMoveAppId] = useState<string | null>(null);
    const [moveCategoryId, setMoveCategoryId] = useState<string>("none");
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState("");
    const [editingCategoryIcon, setEditingCategoryIcon] = useState("");
    const [editingCategoryApps, setEditingCategoryApps] = useState<string[]>([]);
    const [editingCategoryPreview, setEditingCategoryPreview] = useState<string | null>(null);
    const previewRequestIdRef = useRef(0);

    const categoryByAppId = useMemo(() => {
        const map = new Map<string, string>();
        categories.forEach((category) => {
            category.apps.forEach((appId) => map.set(appId, category.id));
        });
        return map;
    }, [categories]);

    const filteredCategories = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return categories;
        return categories.filter((category) => category.name.toLowerCase().includes(query));
    }, [categories, search]);

    const filteredApps = useMemo(() => {
        const query = search.trim().toLowerCase();
        const baseApps = activeCategoryId
            ? apps.filter((app) => categoryByAppId.get(app.id) === activeCategoryId)
            : apps.filter((app) => !categoryByAppId.has(app.id));
        if (!query) return baseApps;
        return baseApps.filter((app) => app.name.toLowerCase().includes(query));
    }, [apps, search, activeCategoryId, categoryByAppId]);

    const combinedItems = useMemo(() => {
        if (activeCategoryId) {
            return filteredApps.map((app) => ({
                kind: "app" as const,
                id: app.id,
                timestamp: Number(app.updatedAt ?? 0),
                app,
            }));
        }
        const appItems = filteredApps.map((app) => ({
            kind: "app" as const,
            id: app.id,
            timestamp: Number(app.updatedAt ?? 0),
            app,
        }));
        const categoryItems = filteredCategories.map((category) => ({
            kind: "category" as const,
            id: category.id,
            timestamp: Number(category.timestamp ?? 0),
            category,
        }));
        return [...categoryItems, ...appItems].sort((a, b) => b.timestamp - a.timestamp);
    }, [activeCategoryId, filteredApps, filteredCategories]);

    const editingApp = useMemo(
        () => (editingAppId ? apps.find((app) => app.id === editingAppId) ?? null : null),
        [apps, editingAppId]
    );
    const activeCategory = useMemo(
        () => (activeCategoryId ? categories.find((category) => category.id === activeCategoryId) ?? null : null),
        [categories, activeCategoryId]
    );

    useEffect(() => {
        if (!moveAppId) return;
        const currentCategoryId = categoryByAppId.get(moveAppId) ?? "none";
        setMoveCategoryId(currentCategoryId);
    }, [moveAppId, categoryByAppId]);

    useEffect(() => {
        if (!editingCategoryId) return;
        const current = categories.find((category) => category.id === editingCategoryId);
        if (!current) return;
        setEditingCategoryName(current.name ?? "");
        setEditingCategoryIcon("");
        setEditingCategoryApps(current.apps ?? []);
        setEditingCategoryPreview(current.icon ?? null);
    }, [editingCategoryId, categories]);

    useEffect(() => {
        const iconValue = editingCategoryIcon.trim();
        const requestId = ++previewRequestIdRef.current;

        if (!iconValue) {
            const current = categories.find((category) => category.id === editingCategoryId);
            setEditingCategoryPreview(current?.icon ?? null);
            return;
        }

        const isRemoteOrRenderableUrl =
            iconValue.startsWith("http://") ||
            iconValue.startsWith("https://") ||
            iconValue.startsWith("data:") ||
            iconValue.startsWith("underdeck-media://") ||
            iconValue.startsWith("file://");

        if (isRemoteOrRenderableUrl) {
            setEditingCategoryPreview(iconValue);
            return;
        }

        const timeoutId = window.setTimeout(async () => {
            const previewDataUrl = await window.underdeck.dialog.readFileAsDataUrl(iconValue);
            if (previewRequestIdRef.current !== requestId) return;
            setEditingCategoryPreview(previewDataUrl ?? null);
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [editingCategoryIcon, editingCategoryId, categories]);

    useEffect(() => {
        if (!activeCategoryId) return;
        if (categories.some((category) => category.id === activeCategoryId)) return;
        setActiveCategoryId(null);
    }, [activeCategoryId, categories]);

    const handleExecuteApp = async (id: string) => {
        await executeApp(id);
    };

    const handleDeleteApp = async (id: string) => {
        await deleteApp(id);
    };

    const handleReposition = async (sourceId: string, targetId: string) => {
        if (activeCategoryId) return;
        if (sourceId === targetId) return;
        const toIndex = apps.findIndex((item) => item.id === targetId);
        if (toIndex < 0) return;
        await repositionApp(sourceId, toIndex);
    };

    const handleCreateShortcut = async (appId: string) => {
        const targetApp = apps.find((app) => app.id === appId);
        if (!targetApp) return;

        const existingShortcut = shortcuts.find((shortcut) => shortcut.meta_data?.appId === appId);
        if (existingShortcut) {
            window.sessionStorage.setItem(PENDING_EDIT_SHORTCUT_KEY, existingShortcut.id);
            toast.info(t("apps.shortcut.exists_capture", "Atalho ja existe. Abra e capture as teclas."));
            set("pages", "home");
            set("homePages", "shortcuts");
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
        set("pages", "home");
        set("homePages", "shortcuts");
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
                    <div className="flex items-center gap-2">
                        <CreateCategoryModal
                            trigger={
                                <Button variant="outline-primary" rounded="xl">
                                    <Folder className="h-4 w-4" />
                                    {t("categories.add", "Adicionar categoria")}
                                </Button>
                            }
                            showAppSelect
                            availableApps={apps}
                        />
                        <AddAppModal />
                    </div>
                </div>
            </Card>

            {!activeCategory && filteredCategories.length === 0 && filteredApps.length === 0 && (
                <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm mt-2">
                    <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
                        {search.trim()
                            ? t("apps.empty.filtered", "Nenhum aplicativo encontrado.")
                            : t("apps.empty.default", "Nenhum aplicativo adicionado.")}
                    </h3>
                </Card>
            )}
            {activeCategory && (
                <Card className="w-full min-w-0 p-4 border-border/70 bg-card/70 backdrop-blur-sm mt-2 flex flex-row items-center justify-between">
                    <h3 className="text-base font-semibold">
                        {t("categories.viewing", "Categoria")}: {activeCategory.name}
                    </h3>
                    <Button
                        variant="outline-primary"
                        rounded="xl"
                        onClick={() => setActiveCategoryId(null)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t("categories.back", "Voltar")}
                    </Button>
                </Card>
            )}

            {activeCategory && filteredApps.length === 0 && (
                <Card className="w-full min-w-0 p-8 border-border/70 bg-card/70 p-4 backdrop-blur-sm mt-2">
                    <h3 className="flex items-center justify-center text-center text-base font-semibold select-none">
                        {t("categories.empty", "Nenhum app nessa categoria.")}
                    </h3>
                </Card>
            )}

            {combinedItems.length > 0 && (
                <Card className="grid grid-cols-1 bg-transparent border-none shadow-none gap-4 border-none sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {combinedItems.map((item) => {
                        if (item.kind === "category") {
                            const category = item.category;
                            return (
                                <Card
                                    key={category.id}
                                    onClick={() => setActiveCategoryId(category.id)}
                                    className="cursor-pointer group relative min-h-[220px] overflow-hidden rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm"
                                >
                                    {category.icon ? (
                                        <BackgroundComp
                                            variant="image"
                                            imageSrc={category.icon}
                                            imageAlt={category.name}
                                            fullScreen={false}
                                            className="absolute inset-0 transition-transform duration-300 group-hover:scale-115"
                                            overlayClassName="bg-black/35"
                                        />
                                    ) : (
                                        <BackgroundComp
                                            variant="neural"
                                            fullScreen={false}
                                            className="absolute inset-0 transition-transform duration-300 group-hover:scale-115"
                                            neuralPointCount={20}
                                            neuralLinkDistance={160}
                                            neuralColors={{
                                                center: "rgba(70, 32, 94, 0.45)",
                                                middle: "rgb(28, 22, 52)",
                                                edge: "rgb(10, 8, 22)",
                                                dot: "rgba(255, 208, 150, 0.9)"
                                            }}
                                        />
                                    )}
                                    <div className="absolute right-3 top-3 z-20">
                                        <DropdownUp
                                            open={openDropdownCategoryId === category.id}
                                            onOpenChange={(open) => setOpenDropdownCategoryId(open ? category.id : null)}
                                        >
                                            <DropdownUpTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={(event) => event.stopPropagation()}
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
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setOpenDropdownCategoryId(null);
                                                        setEditingCategoryId(category.id);
                                                    }}
                                                    className="w-full"
                                                >
                                                    {t("common.edit", "Editar")}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost-destructive"
                                                    rounded="xl"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setOpenDropdownCategoryId(null);
                                                        setConfirmDeleteCategoryId(category.id);
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
                                        <h3 className="line-clamp-2 text-base font-semibold text-white">{category.name}</h3>
                                        <p className="text-sm text-white/80">
                                            {t("categories.count", "Apps")}: {category.apps.length}
                                        </p>
                                    </div>
                                </Card>
                            );
                        }

                        const app = item.app;
                        return (
                            <Card
                                key={app.id}
                                draggable={!search.trim() && !activeCategoryId}
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
                                            className="w-40 gap-1 rounded-xl border-border/70 bg-popover/95 p-1 shadow-xl backdrop-blur-md transparent:bg-black/85 select-none"
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
                                                    setMoveAppId(app.id);
                                                }}
                                                className="w-full"
                                            >
                                                {t("categories.move", "Mover categoria")}
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
                        );
                    })}
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
            <ModalConfirm
                isOpen={!!confirmDeleteCategoryId}
                title={t("categories.delete.title", "Deletar categoria")}
                content={t("categories.delete.content", "Tem certeza que deseja deletar esta categoria?")}
                confirmText={t("common.delete", "Deletar")}
                cancelText={t("common.cancel", "Cancelar")}
                onResult={async (confirmed) => {
                    const targetId = confirmDeleteCategoryId;
                    setConfirmDeleteCategoryId(null);
                    if (!confirmed || !targetId) return;
                    await deleteCategory(targetId);
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

            <Dialog
                open={!!moveAppId}
                onOpenChange={(open) => {
                    if (!open) setMoveAppId(null);
                }}
            >
                <DialogContent className="max-w-md rounded-xl select-none">
                    <DialogHeader>
                        <DialogTitle>{t("categories.move_title", "Mover app para categoria")}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {t("categories.move_description", "Selecione a categoria de destino para o app.")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label>{t("categories.label", "Categoria")}</Label>
                        <Select
                            value={moveCategoryId || "none"}
                            onValueChange={(value) => setMoveCategoryId(value)}
                        >
                            <SelectTrigger rounded="xl" className="w-full border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white">
                                <SelectValue placeholder={t("categories.select_placeholder", "Sem categoria")} />
                            </SelectTrigger>
                            <SelectContent rounded="lg" className="border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transparent:bg-black/85 transparent:text-white">
                                <SelectItem value="none">{t("categories.none", "Sem categoria")}</SelectItem>
                                {categories.map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                        {category.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost-destructive"
                            rounded="xl"
                            onClick={() => setMoveAppId(null)}
                        >
                            {t("common.cancel", "Cancelar")}
                        </Button>
                        <Button
                            rounded="xl"
                            onClick={async () => {
                                if (!moveAppId) return;
                                const targetCategoryId = moveCategoryId === "none" ? null : moveCategoryId;
                                await setAppCategory(moveAppId, targetCategoryId);
                                setMoveAppId(null);
                            }}
                        >
                            {t("common.save", "Salvar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!editingCategoryId}
                onOpenChange={(open) => {
                    if (!open) setEditingCategoryId(null);
                }}
            >
                <DialogContent className="max-w-lg rounded-xl select-none more-dark">
                    <DialogHeader>
                        <DialogTitle>{t("categories.edit_title", "Editar categoria")}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {t("categories.edit_description", "Edite o nome, icone e apps da categoria.")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="category-edit-name">{t("common.name", "Nome")}</Label>
                            <Input
                                id="category-edit-name"
                                rounded="xl"
                                className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                                value={editingCategoryName}
                                onChange={(event) => setEditingCategoryName(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="category-edit-icon">{t("categories.modal.icon_label", "Icone (opcional)")}</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="category-edit-icon"
                                    rounded="xl"
                                    className="border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md transparent:bg-black/60 transparent:text-white"
                                    value={editingCategoryIcon}
                                    onChange={(event) => setEditingCategoryIcon(event.target.value)}
                                    placeholder="C:\\icon.png (opcional)"
                                />
                                <Button
                                    type="button"
                                    variant="outline-primary"
                                    rounded="xl"
                                    onClick={async () => {
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
                                        setEditingCategoryIcon(selectedPath);
                                    }}
                                >
                                    {t("common.choose", "Escolher")}
                                </Button>
                            </div>
                            {editingCategoryPreview && (
                                <div className="w-fill">
                                    <img
                                        src={editingCategoryPreview}
                                        alt={t("categories.modal.icon_preview", "Preview do icone")}
                                        className="h-48 w-full rounded-xl border border-border/70 bg-black/20 object-cover"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <Label>{t("categories.modal.apps_label", "Apps na categoria")}</Label>
                            <MultiSelect
                                placeholder={t("categories.modal.apps_placeholder", "Selecione apps")}
                                options={apps.map((app) => ({ value: app.id, label: app.name }))}
                                rounded="xl"
                                value={editingCategoryApps}
                                onValueChange={setEditingCategoryApps}
                                maxCount={apps.length}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost-destructive"
                            rounded="xl"
                            onClick={() => setEditingCategoryId(null)}
                        >
                            {t("common.cancel", "Cancelar")}
                        </Button>
                        <Button
                            rounded="xl"
                            onClick={async () => {
                                if (!editingCategoryId) return;
                                const current = categories.find((category) => category.id === editingCategoryId);
                                if (!current) return;
                                if (!editingCategoryName.trim()) {
                                    toast.error(t("categories.modal.name_required", "Informe o nome da categoria."));
                                    return;
                                }
                                await updateCategory({
                                    ...current,
                                    name: editingCategoryName.trim(),
                                    icon: editingCategoryIcon.trim() || current.icon || null,
                                    apps: editingCategoryApps,
                                    timestamp: Date.now(),
                                });
                                setEditingCategoryId(null);
                            }}
                        >
                            {t("common.save", "Salvar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
