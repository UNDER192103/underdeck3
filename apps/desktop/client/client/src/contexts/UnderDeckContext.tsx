import React, { createContext, useContext, useEffect, useState } from "react";
import { App } from "@/types/apps";
import { AppCategory } from "@/types/categories";
import { WebPage, WebPagesSettings } from "@/types/webpages";
import { Shortcut } from "@/types/shortcuts";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useGlobalObserver } from "@/contexts/GlobalObserverContext";

interface UnderDeckContextType {
    apps: App[];
    createApp: (app: App) => Promise<App | null>;
    updateApp: (app: App) => Promise<App | null>;
    executeApp: (id: string) => Promise<void>;
    deleteApp: (id: string) => Promise<void>;
    repositionApp: (sourceId: string, toIndex: number) => Promise<void>;

    categories: AppCategory[];
    createCategory: (category: AppCategory) => Promise<AppCategory | null>;
    updateCategory: (category: AppCategory) => Promise<AppCategory | null>;
    deleteCategory: (id: string) => Promise<void>;
    setAppCategory: (appId: string, categoryId: string | null) => Promise<AppCategory[] | null>;

    webPages: WebPage[];
    webPagesSettings: WebPagesSettings | null;
    createWebPage: (page: WebPage) => Promise<WebPage | null>;
    updateWebPage: (page: WebPage) => Promise<WebPage | null>;
    deleteWebPage: (id: string) => Promise<void>;
    openWebPage: (id: string) => Promise<void>;
    closeAllWebPages: () => Promise<void>;
    updateWebPagesSettings: (patch: Partial<WebPagesSettings>) => Promise<WebPagesSettings | null>;

    shortcuts: Shortcut[];
    createShortcut: (shortcut: Shortcut) => Promise<Shortcut | null>;
    updateShortcut: (shortcut: Shortcut) => Promise<Shortcut | null>;
    deleteShortcut: (id: string) => Promise<void>;
    syncShortcutsToService: (nextShortcuts?: Shortcut[]) => Promise<void>;

    isShortcutsEnabled: boolean;
    setShortcutsEnabled: (enabled: boolean) => Promise<void>;

    loading: boolean;
}

const UnderDeckContext = createContext<UnderDeckContextType | undefined>(undefined);

export function UnderDeckProvider({ children }: { children: React.ReactNode }) {
    const { t } = useI18n();
    const { publish, subscribe } = useGlobalObserver();
    const [apps, setApps] = useState<App[]>([]);
    const [categories, setCategories] = useState<AppCategory[]>([]);
    const [webPages, setWebPages] = useState<WebPage[]>([]);
    const [webPagesSettings, setWebPagesSettings] = useState<WebPagesSettings | null>(null);
    const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
    const [isShortcutsEnabled, setIsShortcutsEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const refreshApps = async () => {
        const serverApps = await window.underdeck.apps.list();
        setApps(serverApps);
        return serverApps;
    };

    const refreshCategories = async () => {
        const serverCategories = await window.underdeck.categories.list();
        setCategories(serverCategories);
        return serverCategories;
    };

    const refreshWebPages = async () => {
        const serverPages = await window.underdeck.webPages.list();
        setWebPages(serverPages);
        return serverPages;
    };

    const refreshWebPagesSettings = async () => {
        const settings = await window.underdeck.webPages.getSettings();
        setWebPagesSettings(settings);
        return settings;
    };

    const refreshShortcuts = async () => {
        const serverShortcuts = await window.underdeck.shortcuts.list();
        setShortcuts(serverShortcuts);
        return serverShortcuts;
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([
            refreshApps(),
            refreshCategories(),
            refreshWebPages(),
            refreshWebPagesSettings(),
            refreshShortcuts(),
            window.underdeck.shortcuts.isStarted(),
        ]).then(([apps, categories, webPages, webPagesSettings, shortcuts, isStarted]) => {
            setApps(apps);
            setCategories(categories);
            setWebPages(webPages);
            setWebPagesSettings(webPagesSettings);
            setShortcuts(shortcuts);
            setIsShortcutsEnabled(isStarted);
            setLoading(false);
        }).catch(() => {
            toast.error(t("underdeck.init.load_failed", "Falha ao carregar dados iniciais."));
            setLoading(false);
        });
    }, [t]);

    useEffect(() => {
        const unsubscribe = subscribe(["apps", "shortcuts", "categories:changed", "webpages:changed"], async () => {
            await Promise.all([refreshApps(), refreshCategories(), refreshWebPages(), refreshWebPagesSettings(), refreshShortcuts()]);
        });
        return () => {
            unsubscribe();
        };
    }, [subscribe]);

    const upsertApp = (baseApps: App[], app: App) => {
        const index = baseApps.findIndex((item) => item.id === app.id);
        if (index === -1) return [...baseApps, app];
        const next = [...baseApps];
        next[index] = app;
        return next;
    };

    const replaceApps = (nextApps: App[]) => {
        setApps(nextApps);
    };

    const createApp = async (app: App) => {
        try {
            const created = await window.underdeck.apps.add(app);
            console.log("[UnderDeckContext] Publishing apps.add:", { appId: created.id });
            setApps((prev) => upsertApp(prev, created));
            publish({ id: "apps.add", channel: "apps", sourceId: "UNDERDECK_CONTEXT", data: { appId: created.id } });
            toast.success(t("underdeck.apps.added", "Aplicativo adicionado."));
            return created;
        } catch {
            toast.error(t("underdeck.apps.add_failed", "Falha ao adicionar aplicativo."));
            return null;
        }
    };

    const createCategory = async (category: AppCategory) => {
        try {
            const created = await window.underdeck.categories.add(category);
            setCategories((prev) => {
                const next = [...prev, created];
                next.sort((a, b) => b.timestamp - a.timestamp);
                return next;
            });
            publish({ id: "categories.add", channel: "categories:changed", sourceId: "UNDERDECK_CONTEXT", data: { categoryId: created.id } });
            toast.success(t("underdeck.categories.added", "Categoria adicionada."));
            return created;
        } catch {
            toast.error(t("underdeck.categories.add_failed", "Falha ao adicionar categoria."));
            return null;
        }
    };

    const updateApp = async (app: App) => {
        const previousApps = apps;
        setApps((prev) => upsertApp(prev, app));
        try {
            const updated = await window.underdeck.apps.update(app);
            if (!updated) {
                setApps(previousApps);
                toast.error(t("underdeck.apps.not_found_edit", "App não encontrado para edição."));
                return null;
            }
            setApps((prev) => upsertApp(prev, updated));
            await refreshApps();
            publish({ id: "apps.update", channel: "apps", sourceId: "UNDERDECK_CONTEXT", data: { appId: updated.id } });
            toast.success(t("underdeck.apps.updated", "Aplicativo atualizado."));
            return updated;
        } catch {
            setApps(previousApps);
            toast.error(t("underdeck.apps.update_failed", "Falha ao atualizar aplicativo."));
            return null;
        }
    };

    const updateCategory = async (category: AppCategory) => {
        const previousCategories = categories;
        setCategories((prev) => prev.map((item) => item.id === category.id ? category : item));
        try {
            const updated = await window.underdeck.categories.update(category);
            if (!updated) {
                setCategories(previousCategories);
                toast.error(t("underdeck.categories.not_found_edit", "Categoria nÃ£o encontrada para ediÃ§Ã£o."));
                return null;
            }
            setCategories((prev) => prev.map((item) => item.id === updated.id ? updated : item));
            await refreshCategories();
            publish({ id: "categories.update", channel: "categories:changed", sourceId: "UNDERDECK_CONTEXT", data: { categoryId: updated.id } });
            toast.success(t("underdeck.categories.updated", "Categoria atualizada."));
            return updated;
        } catch {
            setCategories(previousCategories);
            toast.error(t("underdeck.categories.update_failed", "Falha ao atualizar categoria."));
            return null;
        }
    };

    const executeApp = async (id: string) => {
        try {
            await window.underdeck.apps.execute(id);
        } catch {
            toast.error(t("underdeck.apps.execute_failed", "Falha ao executar aplicativo."));
        }
    };

    const deleteApp = async (id: string) => {
        const previousApps = apps;
        const previousShortcuts = shortcuts;
        setApps((prev) => prev.filter((a) => a.id !== id));
        setShortcuts((prev) => prev.filter((shortcut) => shortcut.meta_data?.appId !== id));
        try {
            await window.underdeck.apps.delete(id);
            await refreshShortcuts();
            publish({ id: "apps.delete", channel: "apps", sourceId: "UNDERDECK_CONTEXT", data: { appId: id } });
            toast.success(t("underdeck.apps.removed", "Aplicativo removido."));
        } catch {
            setApps(previousApps);
            setShortcuts(previousShortcuts);
            toast.error(t("underdeck.apps.remove_failed", "Falha ao remover aplicativo."));
        }
    };

    const deleteCategory = async (id: string) => {
        const previousCategories = categories;
        setCategories((prev) => prev.filter((c) => c.id !== id));
        try {
            await window.underdeck.categories.delete(id);
            await refreshCategories();
            publish({ id: "categories.delete", channel: "categories:changed", sourceId: "UNDERDECK_CONTEXT", data: { categoryId: id } });
            toast.success(t("underdeck.categories.removed", "Categoria removida."));
        } catch {
            setCategories(previousCategories);
            toast.error(t("underdeck.categories.remove_failed", "Falha ao remover categoria."));
        }
    };

    const setAppCategory = async (appId: string, categoryId: string | null) => {
        try {
            const updatedCategories = await window.underdeck.categories.setApp(appId, categoryId);
            setCategories(updatedCategories);
            publish({ id: "categories.set_app", channel: "categories:changed", sourceId: "UNDERDECK_CONTEXT", data: { appId, categoryId } });
            return updatedCategories;
        } catch {
            toast.error(t("underdeck.categories.set_app_failed", "Falha ao atualizar categoria do app."));
            return null;
        }
    };

    const createWebPage = async (page: WebPage) => {
        try {
            const created = await window.underdeck.webPages.add(page);
            setWebPages((prev) => {
                const next = [...prev, created];
                next.sort((a, b) => b.updatedAt - a.updatedAt);
                return next;
            });
            publish({ id: "webpages.add", channel: "webpages:changed", sourceId: "UNDERDECK_CONTEXT", data: { pageId: created.id } });
            toast.success(t("underdeck.webpages.added", "Pagina adicionada."));
            return created;
        } catch {
            toast.error(t("underdeck.webpages.add_failed", "Falha ao adicionar pagina."));
            return null;
        }
    };

    const updateWebPage = async (page: WebPage) => {
        const previous = webPages;
        setWebPages((prev) => prev.map((item) => item.id === page.id ? page : item));
        try {
            const updated = await window.underdeck.webPages.update(page);
            if (!updated) {
                setWebPages(previous);
                toast.error(t("underdeck.webpages.not_found_edit", "Pagina nao encontrada para edicao."));
                return null;
            }
            setWebPages((prev) => prev.map((item) => item.id === updated.id ? updated : item));
            await refreshWebPages();
            publish({ id: "webpages.update", channel: "webpages:changed", sourceId: "UNDERDECK_CONTEXT", data: { pageId: updated.id } });
            toast.success(t("underdeck.webpages.updated", "Pagina atualizada."));
            return updated;
        } catch {
            setWebPages(previous);
            toast.error(t("underdeck.webpages.update_failed", "Falha ao atualizar pagina."));
            return null;
        }
    };

    const deleteWebPage = async (id: string) => {
        const previous = webPages;
        setWebPages((prev) => prev.filter((page) => page.id !== id));
        try {
            await window.underdeck.webPages.delete(id);
            await refreshWebPages();
            publish({ id: "webpages.delete", channel: "webpages:changed", sourceId: "UNDERDECK_CONTEXT", data: { pageId: id } });
            toast.success(t("underdeck.webpages.removed", "Pagina removida."));
        } catch {
            setWebPages(previous);
            toast.error(t("underdeck.webpages.remove_failed", "Falha ao remover pagina."));
        }
    };

    const openWebPage = async (id: string) => {
        try {
            await window.underdeck.webPages.open(id);
        } catch {
            toast.error(t("underdeck.webpages.open_failed", "Falha ao abrir pagina."));
        }
    };

    const closeAllWebPages = async () => {
        try {
            await window.underdeck.webPages.closeAll();
            toast.success(t("underdeck.webpages.closed_all", "Paginas fechadas."));
        } catch {
            toast.error(t("underdeck.webpages.close_all_failed", "Falha ao fechar paginas."));
        }
    };

    const updateWebPagesSettings = async (patch: Partial<WebPagesSettings>) => {
        try {
            const next = await window.underdeck.webPages.updateSettings(patch);
            setWebPagesSettings(next);
            publish({ id: "webpages.settings", channel: "webpages:changed", sourceId: "UNDERDECK_CONTEXT", data: next });
            return next;
        } catch {
            toast.error(t("underdeck.webpages.settings_failed", "Falha ao salvar configuracoes das paginas."));
            return null;
        }
    };

    const repositionApp = async (sourceId: string, toIndex: number) => {
        const fromIndex = apps.findIndex((item) => item.id === sourceId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const previousApps = apps;
        const optimistic = [...apps];
        const [moved] = optimistic.splice(fromIndex, 1);
        optimistic.splice(toIndex, 0, moved);
        replaceApps(optimistic.map((app, index) => ({ ...app, position: index })));

        try {
            const serverApps = await window.underdeck.apps.reposition(sourceId, toIndex);
            replaceApps(serverApps);
            publish({ id: "apps.reposition", channel: "apps", sourceId: "UNDERDECK_CONTEXT", data: { appId: sourceId, toIndex } });
        } catch {
            replaceApps(previousApps);
            toast.error(t("underdeck.apps.reposition_failed", "Não foi possivel reposicionar os aplicativos."));
        }
    };

    const upsertShortcut = (baseShortcuts: Shortcut[], shortcut: Shortcut) => {
        const index = baseShortcuts.findIndex((item) => item.id === shortcut.id);
        if (index === -1) return [...baseShortcuts, shortcut];
        const next = [...baseShortcuts];
        next[index] = shortcut;
        return next;
    };

    const syncShortcutsToService = async (nextShortcuts?: Shortcut[]) => {
        const payload = nextShortcuts ?? shortcuts;
        try {
            await window.underdeck.shortcuts.updateAll(payload);
        } catch {
            toast.error(t("underdeck.shortcuts.sync_failed", "Falha ao registrar atalhos no serviço."));
        }
    };

    const createShortcut = async (shortcut: Shortcut) => {
        try {
            const created = await window.underdeck.shortcuts.add(shortcut);
            const nextShortcuts = upsertShortcut(shortcuts, created);
            setShortcuts(nextShortcuts);
            await syncShortcutsToService(nextShortcuts);
            publish({ id: "shortcuts.add", channel: "shortcuts", sourceId: "UNDERDECK_CONTEXT", data: { shortcutId: created.id } });
            toast.success(t("underdeck.shortcuts.created", "Atalho criado com sucesso."));
            return created;
        } catch {
            toast.error(t("underdeck.shortcuts.create_failed", "Falha ao criar o atalho."));
            return null;
        }
    };

    const updateShortcut = async (shortcut: Shortcut) => {
        const previousShortcuts = shortcuts;
        const nextShortcuts = previousShortcuts.map((s) => s.id === shortcut.id ? shortcut : s);
        setShortcuts(nextShortcuts);
        try {
            const updated = await window.underdeck.shortcuts.update(shortcut);
            if (!updated) {
                setShortcuts(previousShortcuts);
                toast.error(t("underdeck.shortcuts.not_found_edit", "Atalho não encontrado para edição."));
                return null;
            }
            const finalShortcuts = upsertShortcut(previousShortcuts, updated);
            setShortcuts(finalShortcuts);
            await syncShortcutsToService(finalShortcuts);
            await refreshShortcuts();
            publish({ id: "shortcuts.update", channel: "shortcuts", sourceId: "UNDERDECK_CONTEXT", data: { shortcutId: updated.id } });
            toast.success(t("underdeck.shortcuts.updated", "Atalho atualizado com sucesso."));
            return updated;
        } catch {
            setShortcuts(previousShortcuts);
            toast.error(t("underdeck.shortcuts.update_failed", "Falha ao atualizar o atalho."));
            return null;
        }
    };

    const deleteShortcut = async (id: string) => {
        const previousShortcuts = shortcuts;
        const nextShortcuts = previousShortcuts.filter((s) => s.id !== id);
        setShortcuts(nextShortcuts);
        try {
            await window.underdeck.shortcuts.delete(id);
            await syncShortcutsToService(nextShortcuts);
            publish({ id: "shortcuts.delete", channel: "shortcuts", sourceId: "UNDERDECK_CONTEXT", data: { shortcutId: id } });
            toast.success(t("underdeck.shortcuts.deleted", "Atalho deletado com sucesso."));
        } catch {
            setShortcuts(previousShortcuts);
            toast.error(t("underdeck.shortcuts.delete_failed", "Falha ao deletar o atalho."));
        }
    };

    const setShortcutsEnabled = async (enabled: boolean) => {
        const previousState = isShortcutsEnabled;
        setIsShortcutsEnabled(enabled);
        try {
            const started = await window.underdeck.shortcuts.setEnabled(enabled);
            setIsShortcutsEnabled(started);
            if (started) {
                await syncShortcutsToService();
            }
            publish({ id: "shortcuts.enabled", channel: "shortcuts", sourceId: "UNDERDECK_CONTEXT", data: { enabled: started } });
        } catch {
            setIsShortcutsEnabled(previousState);
            toast.error(
                enabled
                    ? t("underdeck.shortcuts.enable_failed", "Falha ao habilitar os atalhos.")
                    : t("underdeck.shortcuts.disable_failed", "Falha ao desabilitar os atalhos.")
            );
        }
    };


    return (
        <UnderDeckContext.Provider
            value={{
                apps,
                createApp,
                updateApp,
                executeApp,
                deleteApp,
                repositionApp,
                categories,
                createCategory,
                updateCategory,
                deleteCategory,
                setAppCategory,
                webPages,
                webPagesSettings,
                createWebPage,
                updateWebPage,
                deleteWebPage,
                openWebPage,
                closeAllWebPages,
                updateWebPagesSettings,
                shortcuts,
                createShortcut,
                updateShortcut,
                deleteShortcut,
                syncShortcutsToService,
                isShortcutsEnabled,
                setShortcutsEnabled,
                loading,
            }}
        >
            {children}
        </UnderDeckContext.Provider>
    );
}

export function useUnderDeck() {
    const context = useContext(UnderDeckContext);
    if (!context) {
        throw new Error("useUnderDeck must be used within UseUnderDeckProvider");
    }
    return context;
}
