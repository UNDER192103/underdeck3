/**
 * Under Deck - Sidebar Component
 * Design: Minimalismo Tecnico com Acentos Neon
 * Exibe a lista de templates salvos e controles da sidebar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  PanelsTopLeft,
  LogIn,
  Palette,
  Settings,
  Layers2,
  AudioLines,
  Video,
  Globe,
  Download
} from 'lucide-react';
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";
import { useLocation } from 'wouter';
import { ProfilePreviewCard } from '@/components/user/ProfilePreviewCard';
import { UserProfileEditorModal } from '@/components/user/UserProfileEditorModal';
import { AppUser } from '@/types/user';
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from '@/components/ui/dropdown-up';
import { ModalSettings } from '@/components/settings/modalSettings';
import { UserProfileModal } from './user/UserProfileModal';

interface SidebarProps {
  onCollapsedChange?: (isCollapsed: boolean) => void;
}

interface BuildSidebarOptionProps {
  icon?: React.ReactNode;
  title: string;
  focusing?: boolean;
  description?: string;
  buttonClassName?: string;
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCollapsedChange }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [location, setLocation] = useLocation();
  const { t } = useI18n();
  const { user, getAvatar, modalLogin, updateProfile, logout } = useUser();
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMoreProfile, setShowMoreProfile] = useState(false);
  const [profileNote, setProfileNote] = useState("");
  const [lastSavedNote, setLastSavedNote] = useState("");
  const CurrentTab = `/${location.split('/')[1] || ''}`;

  useEffect(() => {
    if (!user) return;
    setProfileNote(user.profileNote || "");
    setLastSavedNote(user.profileNote || "");
  }, [user?.profileNote, user]);

  useEffect(() => {
    if (!user) return;
    if (profileNote === lastSavedNote) return;

    const timer = setTimeout(async () => {
      const ok = await updateProfile({
        displayName: user.displayName,
        description: user.description || "",
        profileNote,
        profileBannerColor: user.profileBannerColor || "#1f2937",
        profileGradientTop: user.profileGradientTop || "#1d4ed8",
        profileGradientBottom: user.profileGradientBottom || "#0f172a",
      });

      if (ok) {
        setLastSavedNote(profileNote);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [profileNote, lastSavedNote, user, updateProfile]);

  const previewUser = useMemo<AppUser | null>(() => {
    if (!user) return null;
    return {
      ...user,
      profileNote,
    };
  }, [user, profileNote]);

  const handleToggleCollapse = () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    onCollapsedChange?.(newCollapsedState);
  };

  const BuildSidebarOption: React.FC<BuildSidebarOptionProps> = (
    { icon, title, focusing, description, onClick, buttonSize, buttonClassName }
  ) => {
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <div className={`group relative rounded border border-sidebar-border transition-colors`}>
            <Button
              onClick={onClick}
              variant={focusing ? 'default' : 'ghost'}
              size={buttonSize || 'sm'}
              className={`w-full text-left px-3 py-2 h-9 text-xs font-medium text-sidebar-foreground truncate flex items-center gap-2 ${buttonClassName || ''}`}
            >
              {icon || ''} {!isCollapsed && <span className="truncate flex-1">{title}</span>}
            </Button>
          </div>
        </TooltipTrigger>
        {(description || isCollapsed) && <TooltipContent side="right" sideOffset={5}><p>{description || title}</p></TooltipContent>}
      </Tooltip>
    )
  }

  return (
    <TooltipProvider>
      <div
        className={`
        bg-background backdrop-blur supports-[backdrop-filter]:bg-background
        fixed left-0 top-0 h-screen border-r border-sidebar-border
        transition-all duration-300 ease-out z-40
        ${isCollapsed ? "w-[60px]" : "w-64"}
        flex flex-col select-none
      `}
      >
        <div className="flex items-center justify-between p-2 border-b border-sidebar-border h-15">
          {!isCollapsed && (
            <div className='flex items-center gap-2'>
              {/* <img className="w-12 h-12 rounded-full" src="/favicon.png" /> */}
              <h2 className="text-xl font-bold text-sidebar-foreground">Under Deck</h2>
            </div>
          )}
          <button
            onClick={handleToggleCollapse}
            className={`
              ${isCollapsed ? 'p-3' : 'p-2'} hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded transition-colors
            `}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1 transition-colors">
            <BuildSidebarOption
              icon={<PanelsTopLeft size={14} />}
              title={t("sidebar.apps", "Aplicativos")}
              focusing={CurrentTab === '/'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/');
              }}
            />
            <BuildSidebarOption
              icon={<Globe size={14} />}
              title={t("sidebar.deck", "Deck")}
              focusing={CurrentTab === '/deck'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/deck');
              }}
            />
            <BuildSidebarOption
              icon={<Layers2 size={14} />}
              title={t("sidebar.shortcuts", "Teclas De Atalhos")}
              focusing={CurrentTab === '/shortcuts'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/shortcuts');
              }}
            />
            <BuildSidebarOption
              icon={<AudioLines size={14} />}
              title={t("sidebar.soudpad", "Sound Pad")}
              focusing={CurrentTab === '/soundpad'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/soundpad');
              }}
            />
            <BuildSidebarOption
              icon={<Video size={14} />}
              title={t("sidebar.obsstudio", "Obs Studio")}
              focusing={CurrentTab === '/obs'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/obs');
              }}
            />
            <BuildSidebarOption
              icon={<Palette size={14} />}
              title={t("sidebar.theme", "Tema")}
              focusing={CurrentTab === '/theme'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/theme');
              }}
            />
            <BuildSidebarOption
              icon={<Download size={14} />}
              title={t("sidebar.updates", "Atualizacoes")}
              focusing={CurrentTab === '/updates'}
              onClick={(e) => {
                e.preventDefault();
                setLocation('/updates');
              }}
            />
            <BuildSidebarOption
              icon={<Settings size={14} />}
              title={t("settings.title", "Configurações")}
              onClick={(e) => {
                e.preventDefault();
                setShowSettingsModal(true);
              }}
            />
          </div>
        </div>

        <div className="p-2 border-t border-sidebar-border h-14">
          <div className='w-full h-full flex items-center gap-1 justify-between'>
            {user ? (
              !isCollapsed && (
                <DropdownUp>
                  <DropdownUpTrigger asChild>
                    <div className='w-full h-full flex items-center gap-1 cursor-pointer'>
                      <img
                        src={getAvatar()}
                        alt={user.displayName || user.username}
                        className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                      />
                      {user.displayName || user.username}
                    </div>
                  </DropdownUpTrigger>
                  <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                    {previewUser && (
                      <ProfilePreviewCard
                        user={previewUser}
                        noteEditable={true}
                        onNoteChange={setProfileNote}
                        showEditButton={true}
                        size="dropdown"
                        onEditProfileClick={() => setShowProfileEditor(true)}
                        onMoreUserInfoClick={() => setShowMoreProfile(true)}
                      />
                    )}
                  </DropdownUpContent>
                </DropdownUp>
              )
            ) : (
              <div className='w-full h-full'>
                <Button onClick={modalLogin} variant="outline" size="sm" rounded="xl" className={`w-full h-full`}>
                  <LogIn size={16} /> <div className="flex items-center gap-2"> <span>{t("auth.login", "Login")}</span> </div>
                </Button>
              </div>
            )}
            <Button
              onClick={() => setShowSettingsModal(true)}
              variant="outline"
              size="icon"
              rounded="full">
              <Settings size={26} />
            </Button>
          </div>
        </div>
      </div>

      {user && <UserProfileEditorModal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} />}
      {user && <UserProfileModal isOpen={showMoreProfile} onClose={() => setShowMoreProfile(false)} onLogout={logout} />}
      <ModalSettings isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    </TooltipProvider>
  );
};
