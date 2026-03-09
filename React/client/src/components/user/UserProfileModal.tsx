import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";
import { Loader2 } from "lucide-react";
import { UserProfileEditorModal } from "@/components/user/UserProfileEditorModal";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import { AppUser } from "@/types/user";
import { Card } from "../ui/card";

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
    const { loading, user, updateProfile } = useUser();
    const { t } = useI18n();
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [profileNote, setProfileNote] = useState("");
    const [lastSavedNote, setLastSavedNote] = useState("");

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
                        <Card className="w-full h-full overflow-auto">

                        </Card>
                    </Card>
                </DialogContent>
            </Dialog>

            <UserProfileEditorModal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} />
        </>
    );
}
