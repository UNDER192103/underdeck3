import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Moon, Sun, Bell, Layers, Circle } from 'lucide-react';
import { Theme, useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";

interface NavbarProps {
  isCollapsed: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isCollapsed }) => {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

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
        <Select value="">
          <SelectTrigger hideIcon={true} size="sm" className="border-neon-magenta p-2 rounded-full">
            <Bell size={20} />
          </SelectTrigger>
          <SelectContent className="more-dark select-none" rounded="xl">
            <div className="p-2">
              {t("navbar.notifications.empty", "Nenhuma notificação no momento.")}
            </div>
          </SelectContent>
        </Select>

        <Select
          value={theme}
          onValueChange={(value: Theme) => {
            setTheme(value);
          }}
        >
          <SelectTrigger hideIcon={true} size="sm" className="border-neon-magenta p-2 rounded-full">
            {theme === 'ligth' ? <Sun size={20} /> : <Moon size={20} />}
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
