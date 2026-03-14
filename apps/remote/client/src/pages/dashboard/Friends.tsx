import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import { useSocket } from "@/contexts/SocketContext";
import { FriendUser, FriendRequest } from "@/types/user";
import { useI18n } from "@/contexts/I18nContext";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";

export default function FriendsPage() {
  const { user } = useUser();
  const { socket } = useSocket();
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileNote, setProfileNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/friends");
      setFriends(response.data?.friends || []);
      setIncoming(response.data?.requests?.incoming || []);
      setOutgoing(response.data?.requests?.outgoing || []);
    } catch {
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user?.id]);

  useEffect(() => {
    if (!socket) return;
    const onUpdated = () => void load();
    socket.on("friends:updated", onUpdated);
    return () => {
      socket.off("friends:updated", onUpdated);
    };
  }, [socket]);

  const sendRequest = async () => {
    if (!identifier.trim()) return;
    try {
      await axios.post("/api/friends/requests", { identifier });
      toast.success(t("remote.friends.request.sent", "Friend request sent."));
      setIdentifier("");
      void load();
    } catch (error: any) {
      toast.error(t("remote.friends.request.fail", "Failed to send request."), {
        description: error?.response?.data?.error || error?.message || "",
      });
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      await axios.post(`/api/friends/requests/${requestId}/accept`);
      toast.success(t("remote.friends.accept.success", "Request accepted."));
      void load();
    } catch (error: any) {
      toast.error(t("remote.friends.accept.fail", "Failed to accept request."), {
        description: error?.response?.data?.error || error?.message || "",
      });
    }
  };

  const declineRequest = async (requestId: string) => {
    try {
      await axios.post(`/api/friends/requests/${requestId}/decline`);
      toast.success(t("remote.friends.decline.success", "Request declined."));
      void load();
    } catch (error: any) {
      toast.error(t("remote.friends.decline.fail", "Failed to decline request."), {
        description: error?.response?.data?.error || error?.message || "",
      });
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      await axios.delete(`/api/friends/${friendId}`);
      toast.success(t("remote.friends.remove.success", "Friend removed."));
      void load();
    } catch (error: any) {
      toast.error(t("remote.friends.remove.fail", "Failed to remove friend."), {
        description: error?.response?.data?.error || error?.message || "",
      });
    }
  };

  return (
    <section className="">
      <h2 className="text-xl font-semibold tracking-tight">
        {t("remote.friends.title", "Friends")}
      </h2>
      <p className="mt-1 text-sm text-white/70">
        {t("remote.friends.subtitle", "Send requests by username or id.")}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Input
          value={identifier}
          rounded="xl"
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t("remote.friends.identifier.placeholder", "username or id")}
        />
        <Button onClick={sendRequest} rounded="lg" disabled={!identifier.trim()}>
          {t("remote.friends.send", "Send")}
        </Button>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-white/80">
          {t("remote.friends.incoming.title", "Incoming requests")}
        </h3>
        <div className="mt-2 space-y-2">
          {incoming.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              {t("remote.friends.incoming.none", "No incoming requests.")}
            </div>
          ) : (
            incoming.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
                <div key={req.id} className="text-sm">
                  {(req.fromUser?.displayName || req.fromUser?.username) ? (
                    <DropdownUp>
                      <DropdownUpTrigger asChild>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <img
                            src={req.fromUser?.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                            alt={req.fromUser?.displayName || req.fromUser?.username}
                            className="h-8 w-8 rounded-full border border-white/10"
                          />
                          <div>
                            <div className="font-medium text-white">{req.fromUser?.displayName || req.fromUser?.username}</div>
                          </div>
                        </div>
                      </DropdownUpTrigger>
                      <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                        {req.fromUser ? (
                          <ProfilePreviewCard
                            user={req.fromUser}
                            noteEditable={false}
                            onNoteChange={setProfileNote}
                            size="dropdown"
                            onMoreUserInfoClick={() => { }}
                          />
                        ) : null}
                      </DropdownUpContent>
                    </DropdownUp>
                  )
                    :
                    t("remote.friends.unknown", "Unknown")
                  }
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" rounded="xl" onClick={() => acceptRequest(req.id)}>
                    {t("remote.friends.accept", "Accept")}
                  </Button>
                  <Button size="sm" variant="outline-destructive" rounded="xl" onClick={() => declineRequest(req.id)}>
                    {t("remote.friends.decline", "Decline")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-white/80">
          {t("remote.friends.outgoing.title", "Outgoing requests")}
        </h3>
        <div className="mt-2 space-y-2">
          {outgoing.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              {t("remote.friends.outgoing.none", "No outgoing requests.")}
            </div>
          ) : (
            outgoing.map((req) => (
              <div key={req.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                {(req.toUser?.displayName || req.toUser?.username) ? (
                  <DropdownUp>
                    <DropdownUpTrigger asChild>
                      <div className="flex items-center gap-2 cursor-pointer">
                        <img
                          src={req.toUser?.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                          alt={req.toUser?.displayName || req.toUser?.username}
                          className="h-8 w-8 rounded-full border border-white/10"
                        />
                        <div>
                          <div className="font-medium text-white">{req.toUser?.displayName || req.toUser?.username}</div>
                        </div>
                      </div>
                    </DropdownUpTrigger>
                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                      {req.toUser ? (
                        <ProfilePreviewCard
                          user={req.toUser}
                          noteEditable={false}
                          onNoteChange={setProfileNote}
                          size="dropdown"
                          onMoreUserInfoClick={() => { }}
                        />
                      ) : null}
                    </DropdownUpContent>
                  </DropdownUp>
                )
                  :
                  t("remote.friends.unknown", "Unknown")
                }
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-white/80">
          {t("remote.friends.list.title", "Friends")}
        </h3>
        <div className="mt-2 space-y-2">
          {loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              {t("remote.friends.loading", "Loading...")}
            </div>
          ) : friends.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              {t("remote.friends.list.none", "No friends yet.")}
            </div>
          ) : (
            friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <DropdownUp>
                  <DropdownUpTrigger asChild>
                    <div className="flex items-center gap-2 cursor-pointer">
                      <img
                        src={friend.avatarUrl || "/assets/icons/profile-icon-v1.png"}
                        alt={friend.displayName || friend.username}
                        className="h-8 w-8 rounded-full border border-white/10"
                      />
                      <div>
                        <div className="font-medium text-white">{friend.displayName || friend.username}</div>
                      </div>
                    </div>
                  </DropdownUpTrigger>
                  <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                    <ProfilePreviewCard
                      user={friend}
                      noteEditable={false}
                      onNoteChange={setProfileNote}
                      size="dropdown"
                      onMoreUserInfoClick={() => { }}
                    />
                  </DropdownUpContent>
                </DropdownUp>
                <Button size="sm" variant="outline-destructive" rounded="xl" onClick={() => removeFriend(friend.id)}>
                  {t("remote.friends.remove", "Remove")}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
