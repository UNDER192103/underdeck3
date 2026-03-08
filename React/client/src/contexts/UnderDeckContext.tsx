import React, { createContext, useContext, useEffect, useState } from "react";
import { App } from "@/types/apps";
import { Shortcut } from "@/types/shortcuts";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useObserver } from "@/contexts/ObserverContext";

interface UnderDeckContextType {
    apps: App[];
    createApp: (app: App) => Promise<App | null>;
    updateApp: (app: App) => Promise<App | null>;
    executeApp: (id: string) => Promise<void>;
    deleteApp: (id: string) => Promise<void>;
    repositionApp: (sourceId: string, toIndex: number) => Promise<void>;

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
    const { publish, subscribe } = useObserver();
    const [apps, setApps] = useState<App[]>([]);
    const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
    const [isShortcutsEnabled, setIsShortcutsEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const refreshApps = async () => {
        const serverApps = await window.underdeck.apps.list();
        setApps(serverApps);
        return serverApps;
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
            refreshShortcuts(),
            window.underdeck.shortcuts.isStarted(),
        ]).then(([apps, shortcuts, isStarted]) => {
            setApps(apps);
            setShortcuts(shortcuts);
            setIsShortcutsEnabled(isStarted);
            setLoading(false);
        }).catch(() => {
            toast.error(t("underdeck.init.load_failed", "Falha ao carregar dados iniciais."));
            setLoading(false);
        });
    }, [t]);

    useEffect(() => {
        const unsubscribe = subscribe(["apps", "shortcuts"], async () => {
            await Promise.all([refreshApps(), refreshShortcuts()]);
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
            setApps((prev) => upsertApp(prev, created));
            publish({ id: "apps.add", channel: "apps", data: { appId: created.id } });
            toast.success(t("underdeck.apps.added", "Aplicativo adicionado."));
            return created;
        } catch {
            toast.error(t("underdeck.apps.add_failed", "Falha ao adicionar aplicativo."));
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
                toast.error(t("underdeck.apps.not_found_edit", "App não encontrado para edicao."));
                return null;
            }
            setApps((prev) => upsertApp(prev, updated));
            await refreshApps();
            publish({ id: "apps.update", channel: "apps", data: { appId: updated.id } });
            toast.success(t("underdeck.apps.updated", "Aplicativo atualizado."));
            return updated;
        } catch {
            setApps(previousApps);
            toast.error(t("underdeck.apps.update_failed", "Falha ao atualizar aplicativo."));
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
        setShortcuts((prev) => prev.filter((shortcut) => shortcut.meta_data.appId !== id));
        try {
            await window.underdeck.apps.delete(id);
            await refreshShortcuts();
            publish({ id: "apps.delete", channel: "apps", data: { appId: id } });
            toast.success(t("underdeck.apps.removed", "Aplicativo removido."));
        } catch {
            setApps(previousApps);
            setShortcuts(previousShortcuts);
            toast.error(t("underdeck.apps.remove_failed", "Falha ao remover aplicativo."));
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
            publish({ id: "apps.reposition", channel: "apps", data: { appId: sourceId, toIndex } });
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
            toast.error(t("underdeck.shortcuts.sync_failed", "Falha ao registrar atalhos no servico."));
        }
    };

    const createShortcut = async (shortcut: Shortcut) => {
        try {
            const created = await window.underdeck.shortcuts.add(shortcut);
            const nextShortcuts = upsertShortcut(shortcuts, created);
            setShortcuts(nextShortcuts);
            await syncShortcutsToService(nextShortcuts);
            publish({ id: "shortcuts.add", channel: "shortcuts", data: { shortcutId: created.id } });
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
                toast.error(t("underdeck.shortcuts.not_found_edit", "Atalho não encontrado para edicao."));
                return null;
            }
            const finalShortcuts = upsertShortcut(previousShortcuts, updated);
            setShortcuts(finalShortcuts);
            await syncShortcutsToService(finalShortcuts);
            await refreshShortcuts();
            publish({ id: "shortcuts.update", channel: "shortcuts", data: { shortcutId: updated.id } });
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
            publish({ id: "shortcuts.delete", channel: "shortcuts", data: { shortcutId: id } });
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
            publish({ id: "shortcuts.enabled", channel: "shortcuts", data: { enabled: started } });
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
