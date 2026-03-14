import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";
import { Loader2 } from "lucide-react";
import { UserProfileEditorModal } from "@/components/user/UserProfileEditorModal";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import { AppUser } from "@/types/user";
import { Card } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "../ui/input";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "../ui/dropdown-up";
import { useSocket } from "@/contexts/SocketContext";
import axios from "axios";
import { toast } from "sonner";

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
    const { loading, user, listFriends, getAvatar, getBanner, friends, updateProfile, setFriends, setIncoming, setOutgoing } = useUser();
    const { socket } = useSocket();
    const { t } = useI18n();
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [profileNote, setProfileNote] = useState("");
    const [lastSavedNote, setLastSavedNote] = useState("");
    const [friendsTab, setFriendsTab] = useState<"accepted" | "incoming" | "outgoing">("accepted");
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
        const response = await listFriends();
        if (!response) return;
        const listedFriends = response?.data?.friends || [];
        const listedIncoming = response?.data?.requests?.incoming || [];
        const listedOutgoing = response?.data?.requests?.outgoing || [];
        setFriends(listedFriends);
        setIncoming(listedIncoming);
        setOutgoing(listedOutgoing);
    }, [listFriends, setFriends, setIncoming, setOutgoing]);

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
            toast.success(t("user.friends.request.sent", "Pedido enviado."));
            setAddFriendIdentifier("");
            setAddFriendOpen(false);
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("user.friends.request.fail", "Falha ao enviar pedido."), {
                description: error?.response?.data?.error || error?.message || "",
            });
        } finally {
            setAddFriendLoading(false);
        }
    };

    const acceptFriendRequest = async (requestId: string) => {
        try {
            await axios.post(`/api/friends/requests/${requestId}/accept`);
            toast.success(t("user.friends.request.accepted", "Pedido aceito."));
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("user.friends.request.accept_fail", "Falha ao aceitar pedido."), {
                description: error?.response?.data?.error || error?.message || "",
            });
        }
    };

    const declineFriendRequest = async (requestId: string) => {
        try {
            await axios.post(`/api/friends/requests/${requestId}/decline`);
            toast.success(t("user.friends.request.declined", "Pedido recusado."));
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("user.friends.request.decline_fail", "Falha ao recusar pedido."), {
                description: error?.response?.data?.error || error?.message || "",
            });
        }
    };

    const removeFriend = async (friendId: string) => {
        try {
            await axios.delete(`/api/friends/${friendId}`);
            toast.success(t("user.friends.removed", "Amizade removida."));
            if (isOpen) {
                void refreshFriends();
            }
        } catch (error: any) {
            toast.error(t("user.friends.remove_fail", "Falha ao remover amizade."), {
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
                                <Label className="text-sm">{t("user.friends", "Amigos")}</Label>
                                <Button size="sm" variant="secondary" rounded="xl" onClick={() => setAddFriendOpen(true)}>
                                    {t("user.friends.add", "Adicionar")}
                                </Button>
                            </div>
                            <Tabs value={friendsTab} onValueChange={(value) => setFriendsTab(value as any)}>
                                <TabsList className="w-full">
                                    <TabsTrigger value="accepted" asChild unstyled>
                                        <Button variant={friendsTab == "accepted" ? "primary" : "secondary"} className="w-full">
                                            {t("user.friends", "Amigos")}
                                        </Button>
                                    </TabsTrigger>
                                    <TabsTrigger value="incoming" asChild unstyled>
                                        <Button variant={friendsTab == "incoming" ? "primary" : "secondary"} className="w-full">
                                            {t("user.friends.incoming.pedding", "Pendentes")}
                                        </Button>
                                    </TabsTrigger>
                                    <TabsTrigger value="outgoing" asChild unstyled>
                                        <Button variant={friendsTab == "outgoing" ? "primary" : "secondary"} className="w-full">
                                            {t("user.friends.incoming.sent", "Enviados")}
                                        </Button>
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="accepted" className="grid gap-3">
                                    {friends.accepted.length === 0 ? (
                                        <div className="rounded-lg text-center border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                                            {t("user.friends.accepted.none", "Nenhum amigo")}
                                        </div>
                                    ) : friends.accepted.map((firend) => {
                                        return (
                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                                                <DropdownUp>
                                                    <DropdownUpTrigger asChild>
                                                        <div className="w-full h-full text-lg flex items-center gap-1 cursor-pointer">
                                                            <img
                                                                src={getAvatar(firend)}
                                                                alt={firend.displayName || firend.username}
                                                                className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                                                            />
                                                            {firend.displayName || firend.username}
                                                        </div>
                                                    </DropdownUpTrigger>
                                                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                                        {firend && (
                                                            <ProfilePreviewCard
                                                                user={firend}
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
                                                    onClick={() => removeFriend(firend.id)}
                                                >
                                                    {t("user.friends.remove", "Remover")}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </TabsContent>

                                <TabsContent value="incoming" className="grid gap-3">
                                    {friends.incoming.length === 0 ? (
                                        <div className="rounded-lg text-center border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                                            {t("user.friends.incoming.none", "Nenhum pedido recebido")}
                                        </div>
                                    ) : friends.incoming.map((firendIncoming) => {
                                        if (!firendIncoming.fromUser) return null;
                                        
                                        return (
                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                                                <DropdownUp>
                                                    <DropdownUpTrigger asChild>
                                                        <div className="h-full text-lg flex items-center gap-1 cursor-pointer">
                                                            <img
                                                                src={getAvatar(firendIncoming.fromUser)}
                                                                alt={firendIncoming.fromUser.displayName || firendIncoming.fromUser.username}
                                                                className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                                                            />
                                                            {firendIncoming.fromUser.displayName || firendIncoming.fromUser.username}
                                                        </div>
                                                    </DropdownUpTrigger>
                                                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                                        {firendIncoming.fromUser && (
                                                            <ProfilePreviewCard
                                                                user={firendIncoming.fromUser}
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
                                                        onClick={() => acceptFriendRequest(firendIncoming.id)}
                                                    >
                                                        {t("user.friends.accept", "Aceitar")}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        rounded="xl"
                                                        onClick={() => declineFriendRequest(firendIncoming.id)}
                                                    >
                                                        {t("user.friends.decline", "Recusar")}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </TabsContent>

                                <TabsContent value="outgoing" className="grid gap-3">
                                    {friends.outgoing.length === 0 ? (
                                        <div className="rounded-lg text-center border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                                            {t("user.friends.outgoing.none", "Nenhum pedido enviado")}
                                        </div>
                                    ) : friends.outgoing.map((firendOutgoing) => {
                                        if (!firendOutgoing.toUser) return null;
                                        
                                        return (
                                            <div className="rounded-lg text-center border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                                                <DropdownUp>
                                                    <DropdownUpTrigger asChild>
                                                        <div className='w-full h-full text-lg flex items-center gap-1 cursor-pointer'>
                                                            <img
                                                                src={getAvatar(firendOutgoing.toUser)}
                                                                alt={firendOutgoing.toUser.displayName || firendOutgoing.toUser.username}
                                                                className="w-9 h-9 rounded-full border-2 border-primary cursor-pointer"
                                                            />
                                                            {firendOutgoing.toUser.displayName || firendOutgoing.toUser.username}
                                                        </div>
                                                    </DropdownUpTrigger>
                                                    <DropdownUpContent className="w-[300px] border-0 bg-transparent p-0 shadow-none">
                                                        {firendOutgoing.toUser && (
                                                            <ProfilePreviewCard
                                                                user={firendOutgoing.toUser}
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
                        <DialogTitle>{t("user.friends.add", "Adicionar")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label>{t("user.friends.add.label", "ID ou nome de usuario")}</Label>
                        <Input
                            rounded="xl"
                            value={addFriendIdentifier}
                            onChange={(e) => setAddFriendIdentifier(e.target.value)}
                            placeholder={t("user.friends.add.placeholder", "Digite o ID ou nome")}
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
                            {t("common.cancel", "Cancelar")}
                        </Button>
                        <Button
                            rounded="xl"
                            onClick={() => void sendFriendRequest()}
                            disabled={!addFriendIdentifier.trim() || addFriendLoading}
                        >
                            {addFriendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t("user.friends.add.send", "Enviar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <UserProfileEditorModal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} />
        </>
    );
}
