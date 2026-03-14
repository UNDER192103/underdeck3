import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";
import { Loader2 } from "lucide-react";
import { UserProfileEditorModal } from "@/components/user/UserProfileEditorModal";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import { AppUser, FriendRequest, FriendUser } from "@/types/user";
import { Card } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { useSocket } from "@/contexts/SocketContext";
import axios from "axios";
import { toast } from "sonner";

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
    const { loading, user, updateProfile } = useUser();
    const { socket } = useSocket();
    const { t } = useI18n();
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [profileNote, setProfileNote] = useState("");
    const [lastSavedNote, setLastSavedNote] = useState("");
    const [friendsTab, setFriendsTab] = useState<"accepted" | "incoming" | "outgoing">("accepted");
    const [friends, setFriends] = useState<FriendUser[]>([]);
    const [incoming, setIncoming] = useState<FriendRequest[]>([]);
    const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [addFriendIdentifier, setAddFriendIdentifier] = useState("");
    const [addFriendLoading, setAddFriendLoading] = useState(false);

    if (loading) {
        return (
            <Dialog open={isOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="sm:max-w-[460px] select-none bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/50"
                >
                    <div className="flex flex-col items-center justify-center text-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mb-4" />
                        {t("common.loading", "Carregando...")}
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    useEffect(() => {
        if (!user) return;
        setProfileNote(user.profileNote || "");
        setLastSavedNote(user.profileNote || "");
    }, [user?.profileNote, isOpen, user]);

    useEffect(() => {
        if (!isOpen || !user) return;
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
    }, [profileNote, lastSavedNote, isOpen, user, updateProfile]);

    if (!user) return null;

    const previewUser: AppUser = {
        ...user,
        profileNote,
    };

    const refreshFriends = useCallback(async () => {
        try {
            const response = await axios.get("/api/friends");
            setFriends(response.data?.friends || []);
            setIncoming(response.data?.requests?.incoming || []);
            setOutgoing(response.data?.requests?.outgoing || []);
        } catch {
            setFriends([]);
            setIncoming([]);
            setOutgoing([]);
        }
    }, []);

    const didInitialFriendsLoadRef = useRef(false);

    useEffect(() => {
        if (!isOpen || !user) return;
        if (didInitialFriendsLoadRef.current) return;
        didInitialFriendsLoadRef.current = true;
        void refreshFriends();
    }, [isOpen, user?.id, refreshFriends]);

    useEffect(() => {
        if (!socket || !user) return;
        const onUpdated = (payload: { userId?: string }) => {
            if (!payload?.userId || payload.userId !== user.id) return;
            void refreshFriends();
        };
        const onConnect = () => {
            if (!didInitialFriendsLoadRef.current) return;
            void refreshFriends();
        };
        socket.on("friends:updated", onUpdated);
        socket.on("connect", onConnect);
        return () => {
            socket.off("friends:updated", onUpdated);
            socket.off("connect", onConnect);
        };
    }, [socket, user?.id, refreshFriends]);

    const sendFriendRequest = async () => {
        const identifier = addFriendIdentifier.trim();
        if (!identifier) return;
        setAddFriendLoading(true);
        try {
            await axios.post("/api/friends/requests", { identifier });
            toast.success(t("remote.friends.request.sent", "Friend request sent."));
            setAddFriendIdentifier("");
            setAddFriendOpen(false);
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("remote.friends.request.fail", "Failed to send request."), {
                description: error?.response?.data?.error || error?.message || "",
            });
        } finally {
            setAddFriendLoading(false);
        }
    };

    const acceptFriendRequest = async (requestId: string) => {
        try {
            await axios.post(`/api/friends/requests/${requestId}/accept`);
            toast.success(t("remote.friends.accept.success", "Request accepted."));
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("remote.friends.accept.fail", "Failed to accept request."), {
                description: error?.response?.data?.error || error?.message || "",
            });
        }
    };

    const declineFriendRequest = async (requestId: string) => {
        try {
            await axios.post(`/api/friends/requests/${requestId}/decline`);
            toast.success(t("remote.friends.decline.success", "Request declined."));
            if (isOpen) {
                void refreshFriends();
            }
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
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("remote.friends.remove.fail", "Failed to remove friend."), {
                description: error?.response?.data?.error || error?.message || "",
            });
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent
                    showCloseButton={false}
                    className="max-w-full sm:max-w-[860px] min-h-[80vh] select-none rounded-xl border p-0 overflow-hidden bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/80"
                >
                    <Card className="flex flex-row p-3 rounded-xl">
                        <ProfilePreviewCard
                            className="w-[70%]"
                            user={previewUser}
                            noteEditable={true}
                            onNoteChange={setProfileNote}
                            showEditButton={true}
                            onEditProfileClick={() => setShowProfileEditor(true)}
                        />
                        <Card className="w-full h-full overflow-auto p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <Label className="text-sm">{t("remote.friends.title", "Friends")}</Label>
                                <Button size="sm" variant="secondary" rounded="xl" onClick={() => setAddFriendOpen(true)}>
                                    {t("remote.friends.send", "Send")}
                                </Button>
                            </div>
                            <Tabs value={friendsTab} onValueChange={(value) => setFriendsTab(value as any)}>
                                <TabsList className="w-full">
                                    <TabsTrigger value="accepted" asChild unstyled>
                                        <Button variant={friendsTab == "accepted" ? "primary" : "secondary"} className="w-full">
                                            {t("remote.friends.list.title", "Friends")}
                                        </Button>
                                    </TabsTrigger>
                                    <TabsTrigger value="incoming" asChild unstyled>
                                        <Button variant={friendsTab == "incoming" ? "primary" : "secondary"} className="w-full">
                                            {t("remote.friends.incoming.title", "Incoming requests")}
                                        </Button>
                                    </TabsTrigger>
                                    <TabsTrigger value="outgoing" asChild unstyled>
                                        <Button variant={friendsTab == "outgoing" ? "primary" : "secondary"} className="w-full">
                                            {t("remote.friends.outgoing.title", "Outgoing requests")}
                                        </Button>
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="accepted" className="grid gap-3">
                                    {friends.length === 0 ? (
                                        <div className="rounded-lg text-center border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                                            {t("remote.friends.list.none", "No friends yet.")}
                                        </div>
                                    ) : friends.map((friend) => {
                                        return (
                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                                                <DropdownUp>
                                                    <DropdownUpTrigger asChild>
                                                        <div className="w-full h-full text-lg flex items-center gap-1 cursor-pointer">
                                                            <img
                                                                src={friend.avatarUrl || defaultAvatar}
                                                                alt={friend.displayName || friend.username}
                                                                className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                                                            />
                                                            {friend.displayName || friend.username}
                                                        </div>
                                                    </DropdownUpTrigger>
                                                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                                        {friend && (
                                                            <ProfilePreviewCard
                                                                user={friend}
                                                                noteEditable={false}
                                                                onNoteChange={setProfileNote}
                                                                size="dropdown"
                                                                onMoreUserInfoClick={() => { }}
                                                            />
                                                        )}
                                                    </DropdownUpContent>
                                                </DropdownUp>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline-destructive"
                                                    rounded="xl"
                                                    onClick={() => removeFriend(friend.id)}
                                                >
                                                    {t("remote.friends.remove", "Remove")}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </TabsContent>

                                <TabsContent value="incoming" className="grid gap-3">
                                    {incoming.length === 0 ? (
                                        <div className="rounded-lg text-center border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                                            {t("remote.friends.incoming.none", "No incoming requests.")}
                                        </div>
                                    ) : incoming.map((friendIncoming) => {
                                        if (!friendIncoming.fromUser) return null;

                                        return (
                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                                                <DropdownUp>
                                                    <DropdownUpTrigger asChild>
                                                        <div className="h-full text-lg flex items-center gap-1 cursor-pointer">
                                                            <img
                                                                src={friendIncoming.fromUser.avatarUrl || defaultAvatar}
                                                                alt={friendIncoming.fromUser.displayName || friendIncoming.fromUser.username}
                                                                className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                                                            />
                                                            {friendIncoming.fromUser.displayName || friendIncoming.fromUser.username}
                                                        </div>
                                                    </DropdownUpTrigger>
                                                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                                        {friendIncoming.fromUser && (
                                                            <ProfilePreviewCard
                                                                user={friendIncoming.fromUser}
                                                                noteEditable={false}
                                                                onNoteChange={setProfileNote}
                                                                size="dropdown"
                                                                onMoreUserInfoClick={() => { }}
                                                            />
                                                        )}
                                                    </DropdownUpContent>
                                                </DropdownUp>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        rounded="xl"
                                                        onClick={() => acceptFriendRequest(friendIncoming.id)}
                                                    >
                                                        {t("remote.friends.accept", "Accept")}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        rounded="xl"
                                                        onClick={() => declineFriendRequest(friendIncoming.id)}
                                                    >
                                                        {t("remote.friends.decline", "Decline")}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </TabsContent>

                                <TabsContent value="outgoing" className="grid gap-3">
                                    {outgoing.length === 0 ? (
                                        <div className="rounded-lg text-center border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                                            {t("remote.friends.outgoing.none", "No outgoing requests.")}
                                        </div>
                                    ) : outgoing.map((friendOutgoing) => {
                                        if (!friendOutgoing.toUser) return null;

                                        return (
                                            <div className="rounded-lg text-center border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                                                <DropdownUp>
                                                    <DropdownUpTrigger asChild>
                                                        <div className="w-full h-full text-lg flex items-center gap-1 cursor-pointer">
                                                            <img
                                                                src={friendOutgoing.toUser.avatarUrl || defaultAvatar}
                                                                alt={friendOutgoing.toUser.displayName || friendOutgoing.toUser.username}
                                                                className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                                                            />
                                                            {friendOutgoing.toUser.displayName || friendOutgoing.toUser.username}
                                                        </div>
                                                    </DropdownUpTrigger>
                                                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                                        {friendOutgoing.toUser && (
                                                            <ProfilePreviewCard
                                                                user={friendOutgoing.toUser}
                                                                noteEditable={false}
                                                                onNoteChange={setProfileNote}
                                                                size="dropdown"
                                                                onMoreUserInfoClick={() => { }}
                                                            />
                                                        )}
                                                    </DropdownUpContent>
                                                </DropdownUp>
                                            </div>
                                        );
                                    })}
                                </TabsContent>
                            </Tabs>
                        </Card>
                    </Card>
                </DialogContent>
            </Dialog>

            <Dialog open={addFriendOpen} onOpenChange={setAddFriendOpen}>
                <DialogContent className="sm:max-w-[420px] more-dark">
                    <DialogHeader>
                        <DialogTitle>{t("remote.friends.send", "Send")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label>{t("remote.friends.identifier.placeholder", "username or id")}</Label>
                        <Input
                            rounded="xl"
                            value={addFriendIdentifier}
                            onChange={(e) => setAddFriendIdentifier(e.target.value)}
                            placeholder={t("remote.friends.identifier.placeholder", "username or id")}
                            disabled={addFriendLoading}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            rounded="xl"
                            onClick={() => setAddFriendOpen(false)}
                            disabled={addFriendLoading}
                        >
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button
                            rounded="xl"
                            onClick={() => void sendFriendRequest()}
                            disabled={!addFriendIdentifier.trim() || addFriendLoading}
                        >
                            {addFriendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t("remote.friends.send", "Send")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <UserProfileEditorModal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} />
        </>
    );
}
    const defaultAvatar = "/assets/icons/profile-icon-v1.png";
