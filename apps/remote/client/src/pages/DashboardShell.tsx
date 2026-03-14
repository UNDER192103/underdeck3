import { useEffect, useMemo, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { BackgroundComp } from "@/components/ui/background";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";
import { Theme, useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Circle, Laptop, Layers, LogOut, Moon, Sun, User2 } from "lucide-react";
import ConnectionsPage from "@/pages/dashboard/Connections";
import FriendsPage from "@/pages/dashboard/Friends";
import { Img } from "@/components/ui/img";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import { UserProfileEditorModal } from "@/components/user/UserProfileEditorModal";
import { UserProfileModal } from "@/components/user/UserProfileModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type NavKey = "connections" | "friends";

export default function DashboardShell() {
  const { user, loading, getAvatar, logout } = useUser();
  const { t, locale, locales, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const [, navigate] = useLocation();
  const [active, setActive] = useState<NavKey>("connections");
  const [previewUser, setPreviewUser] = useState(user);
  const [profileNote, setProfileNote] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showMoreProfile, setShowMoreProfile] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login", { replace: true });
    else setPreviewUser(user);
  }, [loading, navigate, user]);

  useEffect(() => {
    const path = String(window.location.pathname || "").toLowerCase();
    if (path.includes("/dashboard/friends")) setActive("friends");
    else setActive("connections");
  }, []);

  const sidebar = useMemo(() => {
    return (
      <aside className="w-[280px] shrink-0 border-r border-border/70 bg-background backdrop-blur">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 w-full">
            <Img className="h-9 w-9 rounded-lg" src="/favicon.ico" />
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2 w-full justify-between">
                <div className="truncate text-sm font-semibold tracking-wide">
                  {t("remote.sidebar.title", "Under Deck Remote")}
                </div>
                <Select
                  value={theme}
                  onValueChange={(value: Theme) => {
                    setTheme(value);
                  }}
                >
                  <SelectTrigger hideIcon={true} size="sm" className="border-neon-magenta p-2 rounded-full backdrop-blur-sm">
                    {theme === "ligth" ? <Sun size={20} className="text-foreground" /> : <Moon className="text-foreground" size={20} />}
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
              <div className="truncate text-xs text-muted-foreground">
                {t("remote.sidebar.subtitle", "Web dashboard")}
              </div>
            </div>
          </div>
        </div>

        <nav className="px-3 py-2 flex flex-col gap-1">
          <Select value={locale} onValueChange={(value) => void setLocale(value)}>
            <SelectTrigger rounded="xl" className="w-full border-border/90 bg-card/70 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent rounded="xl" className="border-border/90 bg-black/95 text-popover-foreground">
              {locales.map((item) => (
                <SelectItem key={item.locale} value={item.locale}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Link href="/dashboard/connections">
            <Button
              variant={active === "connections" ? "default" : "ghost"}
              className="w-full justify-start gap-2 text-foreground border border-sidebar-border"
              rounded="xl"
              onClick={() => setActive("connections")}
            >
              <Laptop size={16} />
              {t("remote.sidebar.devices", "Devices")}
            </Button>
          </Link>

          <Link href="/dashboard/friends">
            <Button
              variant={active === "friends" ? "default" : "ghost"}
              className="w-full justify-start gap-2 text-foreground border border-sidebar-border"
              rounded="xl"
              onClick={() => setActive("friends")}
            >
              <User2 size={16} />
              {t("remote.sidebar.friends", "Friends")}
            </Button>
          </Link>

          <Button
            variant="ghost-destructive"
            className="w-full justify-start gap-2 border border-sidebar-border"
            rounded="xl"
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            {t("remote.sidebar.logout", "Sign out")}
          </Button>
        </nav>

        <div className="p-2 border-t border-sidebar-border h-14">
          <div className='w-full h-full flex items-center gap-1 justify-between'>
            <DropdownUp>
              <DropdownUpTrigger asChild>
                <div className='w-full h-full flex items-center gap-1 cursor-pointer'>
                  <img
                    src={getAvatar()}
                    alt={user?.displayName || user?.username}
                    className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                  />
                  {user?.displayName || user?.username}
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
          </div>
        </div>
      </aside>
    );
  }, [active, getAvatar, locale, locales, logout, previewUser, setLocale, setTheme, t, theme, user?.displayName, user?.username]);

  return (
    <div className="min-h-screen w-full overflow-hidden">
      <BackgroundComp variant="neural" />
      <div className="relative z-10 flex min-h-screen w-full text-foreground">
        {sidebar}
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          <Switch>
            <Route path="/dashboard/connections" component={ConnectionsPage} />
            <Route path="/dashboard/friends" component={FriendsPage} />
            <Route path="/dashboard/webdeck" component={LegacyWebDeckRedirect} />
            <Route component={ConnectionsPage} />
          </Switch>
        </main>
      </div>

      {user && <UserProfileEditorModal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} />}
      {user && <UserProfileModal isOpen={showMoreProfile} onClose={() => setShowMoreProfile(false)} onLogout={logout} />}
    </div>
  );
}

function LegacyWebDeckRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const search = window.location.search || "";
    navigate(`/webdeck${search}`, { replace: true });
  }, [navigate]);
  return null;
}
