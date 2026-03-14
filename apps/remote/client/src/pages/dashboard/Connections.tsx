import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSocket } from "@/contexts/SocketContext";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useI18n } from "@/contexts/I18nContext";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import type { AppUser } from "@/types/user";

export default function ConnectionsPage() {
  const { socket } = useSocket();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [devices, setDevices] = useState<Array<{
    id: string;
    name: string;
    ownerId: string;
    owner: AppUser | null;
    isOwner: boolean;
    isFriendOwner: boolean;
    hasSession: boolean;
    sessionExpiresAt: string | null;
    online: boolean;
    lastSeenAt: string;
    hwid: string;
  }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await axios.get("/api/devices");
        const list = Array.isArray(response.data?.devices) ? response.data.devices : [];
        if (active) setDevices(list);
      } catch {
        if (active) setDevices([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void axios.get("/api/devices").then((response) => {
        const list = Array.isArray(response.data?.devices) ? response.data.devices : [];
        setDevices(list);
      }).catch(() => {
        setDevices([]);
      });
    };
    socket.on("devices:updated", refresh);
    socket.on("device:sessions:updated", refresh);
    socket.on("friends:updated", refresh);
    socket.on("connect", refresh);
    return () => {
      socket.off("devices:updated", refresh);
      socket.off("device:sessions:updated", refresh);
      socket.off("friends:updated", refresh);
      socket.off("connect", refresh);
    };
  }, [socket]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-foreground/80">
          {t("remote.devices.loading", "Loading devices...")}
        </div>
      );
    }

    if (devices.length === 0) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-foreground/80">
          {t("remote.devices.none", "No devices available yet.")}
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => (
          <div
            key={device.id}
            className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-foreground">{device.name}</div>
                <div className="mt-1 text-xs text-foreground/70">
                  {t("remote.devices.id", "ID")}: <span className="font-mono">{device.id}</span>
                </div>
              </div>
              <span
                className={`text-xs font-semibold ${device.online ? "text-emerald-400" : "text-foreground/50"}`}
              >
                {device.online ? t("remote.devices.online", "Online") : t("remote.devices.offline", "Offline")}
              </span>
            </div>

            {device.owner ? (
              <div className="flex items-center justify-between gap-2">
                {device.isOwner ? (
                  <div className="text-xs text-foreground/70">
                    {t("remote.devices.owner.you", "Your device")}
                  </div>
                ) : (
                  <DropdownUp>
                    <DropdownUpTrigger asChild>
                      <div className="flex items-center gap-2 cursor-pointer">
                        <img
                          src={device.owner.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                          alt={device.owner.displayName || device.owner.username}
                          className="h-8 w-8 rounded-full border border-white/10"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {device.owner.displayName || device.owner.username}
                          </div>
                          <div className="text-xs text-foreground/60">
                            {device.isFriendOwner
                              ? t("remote.devices.owner.friend", "Friend")
                              : t("remote.devices.owner.invite", "Invite")}
                          </div>
                        </div>
                      </div>
                    </DropdownUpTrigger>
                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                      <ProfilePreviewCard
                        user={device.owner}
                        noteEditable={false}
                        size="dropdown"
                        onMoreUserInfoClick={() => {}}
                      />
                    </DropdownUpContent>
                  </DropdownUp>
                )}
                {device.hasSession && device.sessionExpiresAt ? (
                  <div className="text-[11px] text-foreground/60">
                    {t("remote.devices.session.expires", "Expires")}: {new Date(device.sessionExpiresAt).toLocaleString()}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-auto flex items-center justify-between gap-2">
              <div className="text-xs text-foreground/60">
                {t("remote.devices.last_seen", "Last seen")}: {new Date(device.lastSeenAt).toLocaleString()}
              </div>
              <Button
                onClick={() => navigate(`/webdeck?uuid=${encodeURIComponent(device.hwid)}`)}
                disabled={!device.online || (!device.isOwner && !device.hasSession)}
              >
                {device.isOwner || device.hasSession
                  ? t("remote.devices.connect", "Connect")
                  : t("remote.devices.no_session", "No session")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }, [devices, loading, navigate, t]);

  return (
    <section className="w-full">
      <h2 className="text-xl font-semibold tracking-tight">
        {t("remote.devices.title", "Devices")}
      </h2>
      <p className="mt-1 text-sm text-foreground/70">
        {t("remote.devices.subtitle", "Devices you can access from this account.")}
      </p>
      <div className="mt-5">{content}</div>
    </section>
  );
}
