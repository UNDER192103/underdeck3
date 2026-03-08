import React, { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Moon, Sun, Bell, Layers, Circle } from 'lucide-react';
import { Theme, useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useObserver } from "@/contexts/ObserverContext";

interface NavbarProps {
  isCollapsed: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isCollapsed }) => {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const { subscribe } = useObserver();

  const [notifications, setNotifications] = useState<Array<{ id: string; text: string; at: number }>>([]);
  const [openNotifications, setOpenNotifications] = useState(false);
  const formatUpdateNotification = (version: string) => {
    const template = t("navbar.notifications.update_available", "Nova atualização disponível: v{version}");
    return template.replace("{version}", version);
  };

  useEffect(() => {
    void window.underdeck.updates
      .getState()
      .then((state) => {
        if (!state?.updateAvailable || !state?.availableVersion) return;
        setNotifications((prev) => {
          const id = `updates-${state.availableVersion}`;
          if (prev.some((n) => n.id === id)) return prev;
          return [
            {
              id,
              text: formatUpdateNotification(String(state.availableVersion || "")),
              at: Date.now(),
            },
            ...prev,
          ];
        });
      })
      .catch(() => {
        // ignore
      });
  }, [t]);

  useEffect(() => {
    const unsubscribe = subscribe("updates", (payload) => {
      if (payload?.id !== "updates.available") return;
      const version = String((payload.data as { version?: string } | undefined)?.version || "").trim();
      if (!version) return;
      setNotifications((prev) => {
        const id = `updates-${version}`;
        if (prev.some((n) => n.id === id)) return prev;
        return [
          {
            id,
            text: formatUpdateNotification(version),
            at: Date.now(),
          },
          ...prev,
        ];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [subscribe, t]);

  const hasUnread = useMemo(() => notifications.length > 0, [notifications.length]);

  return (
    <div
      className="fixed top-0 z-40 flex items-center justify-between gap-2 p-3 h-15 border-b border-border bg-background backdrop-blur supports-[backdrop-filter]:bg-background select-none"
      style={{
        left: isCollapsed ? '60px' : '256px',
        width: isCollapsed ? 'calc(100% - 60px)' : 'calc(100% - 256px)',
      }}
    >
      <div className="flex-1 flex items-center gap-3" />

      <div className="flex items-center gap-2">
        <Select value="" onOpenChange={(open) => setOpenNotifications(open)}>
          <SelectTrigger hideIcon={true} size="sm" className="relative border-neon-magenta p-2 rounded-full backdrop-blur-sm">
            <Bell size={20} className='text-foreground' />
            {hasUnread && !openNotifications ? (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
            ) : null}
          </SelectTrigger>
          <SelectContent className="more-dark select-none" rounded="xl">
            {notifications.length === 0 ? (
              <div className="p-2">
                {t("navbar.notifications.empty", "Nenhuma notificacao no momento.")}
              </div>
            ) : (
              <div className="max-w-[340px] p-2 space-y-2">
                {notifications.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border/60 p-2 text-sm">
                    <div>{item.text}</div>
                    <div className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </SelectContent>
        </Select>

        <Select
          value={theme}
          onValueChange={(value: Theme) => {
            setTheme(value);
          }}
        >
          <SelectTrigger hideIcon={true} size="sm" className="border-neon-magenta p-2 rounded-full backdrop-blur-sm">
            {theme === 'ligth' ? <Sun size={20} className='text-foreground' /> : <Moon className='text-foreground' size={20} />}
          </SelectTrigger>
          <SelectContent className="more-dark" rounded="xl">
            <SelectItem value="transparent">
              <div className="flex items-center justify-between">
                <Layers size={20} className="mr-2" /> {t("theme.transparent", "Transparente")}
              </div>
            </SelectItem>
            <SelectItem value="ligth">
              <div className="flex items-center justify-between">
                <Sun size={20} className="mr-2" /> {t("theme.light", "Claro")}
              </div>
            </SelectItem>
            <SelectItem value="dark">
              <div className="flex items-center justify-between">
                <Moon size={20} className="mr-2" /> {t("theme.dark", "Escuro")}
              </div>
            </SelectItem>
            <SelectItem value="black">
              <div className="flex items-center justify-between">
                <Circle size={20} className="mr-2 fill-current" /> {t("theme.black", "Full Black")}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
