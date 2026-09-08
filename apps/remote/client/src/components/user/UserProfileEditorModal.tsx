import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarEditorModal } from "@/components/user/AvatarEditorModal";
import { BannerEditorModal } from "@/components/user/BannerEditorModal";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";
import { ProfilePreviewCard } from "@/components/user/ProfilePreviewCard";
import { AppUser } from "@/types/user";
import { DiscordColorPicker } from "@/components/DiscordColorPicker";
import { Img } from "@/components/ui/img";
import { Spacer } from "@/components/ui/spacer";
import { Check, ImageUpIcon, Loader2, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UserProfileEditorModalProps {
  open: boolean;
  onClose: () => void;
}

export function UserProfileEditorModal({
  open,
  onClose,
}: UserProfileEditorModalProps) {
  const {
    user,
    getAvatar,
    getBanner,
    uploadAvatar,
    removeAvatar,
    uploadBanner,
    removeBanner,
    updateProfile,
  } = useUser();
  const { t } = useI18n();

  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [avatarEditorFile, setAvatarEditorFile] = useState<File | null>(null);
  const [bannerEditorFile, setBannerEditorFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [bannerColor, setBannerColor] = useState("#1f2937");
  const [topColor, setTopColor] = useState("#1d4ed8");
  const [bottomColor, setBottomColor] = useState("#0f172a");

  const [avatarDraftFile, setAvatarDraftFile] = useState<File | null>(null);
  const [avatarMarkedToRemove, setAvatarMarkedToRemove] = useState(false);
  const [bannerDraftFile, setBannerDraftFile] = useState<File | null>(null);
  const [bannerMarkedToRemove, setBannerMarkedToRemove] = useState(false);
  const [saving, setSaving] = useState(false);

  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [bannerDraftUrl, setBannerDraftUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setDescription(user.description || "");
    setBannerColor(user.profileBannerColor || "#1f2937");
    setTopColor(user.profileGradientTop || "#1d4ed8");
    setBottomColor(user.profileGradientBottom || "#0f172a");
    setAvatarDraftFile(null);
    setAvatarMarkedToRemove(false);
    setBannerDraftFile(null);
    setBannerMarkedToRemove(false);
  }, [user, open]);

  useEffect(() => {
    if (!avatarDraftFile) {
      setAvatarDraftUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarDraftFile);
    setAvatarDraftUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarDraftFile]);

  useEffect(() => {
    if (!bannerDraftFile) {
      setBannerDraftUrl(null);
      return;
    }
    const url = URL.createObjectURL(bannerDraftFile);
    setBannerDraftUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerDraftFile]);

  const resetDraft = () => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setDescription(user.description || "");
    setBannerColor(user.profileBannerColor || "#1f2937");
    setTopColor(user.profileGradientTop || "#1d4ed8");
    setBottomColor(user.profileGradientBottom || "#0f172a");
    setAvatarDraftFile(null);
    setAvatarMarkedToRemove(false);
    setBannerDraftFile(null);
    setBannerMarkedToRemove(false);
  };

  const avatarPreview = useMemo(() => {
    if (avatarDraftUrl) return avatarDraftUrl;
    if (avatarMarkedToRemove) return "/assets/icons/profile-icon-v1.png";
    return getAvatar();
  }, [avatarDraftUrl, avatarMarkedToRemove, getAvatar]);

  const bannerPreview = useMemo(() => {
    if (bannerDraftUrl) return bannerDraftUrl;
    if (bannerMarkedToRemove) return null;
    return getBanner();
  }, [bannerDraftUrl, bannerMarkedToRemove, getBanner]);

  if (!user) return null;

  const hasProfileChanges =
    displayName !== (user.displayName || "") ||
    description !== (user.description || "") ||
    bannerColor !== (user.profileBannerColor || "#1f2937") ||
    topColor !== (user.profileGradientTop || "#1d4ed8") ||
    bottomColor !== (user.profileGradientBottom || "#0f172a");

  const hasAvatarChanges = !!avatarDraftFile || avatarMarkedToRemove;
  const hasBannerChanges = !!bannerDraftFile || bannerMarkedToRemove;
  const hasChanges = hasProfileChanges || hasAvatarChanges || hasBannerChanges;

  const previewUser: AppUser = {
    ...user,
    displayName: displayName || user.displayName,
    description,
    profileBannerColor: bannerColor,
    profileGradientTop: topColor,
    profileGradientBottom: bottomColor,
    avatarUrl: avatarPreview,
    bannerUrl: bannerPreview,
  };

  const openAvatarPicker = () => avatarInputRef.current?.click();
  const openBannerPicker = () => bannerInputRef.current?.click();

  return (
    <>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          setAvatarEditorFile(file);
          setShowAvatarEditor(!!file);
          e.currentTarget.value = "";
        }}
      />

      <input
        ref={bannerInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        disabled={!user.premium}
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          setBannerEditorFile(file);
          setShowBannerEditor(!!file);
          e.currentTarget.value = "";
        }}
      />

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[1000px] select-none rounded-xl bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <DialogHeader>
            <DialogTitle>
              {t("user.profile.edit_title", "Editar Perfil")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>
                  {t("user.profile.banner_section", "Faixa de perfil")}
                </Label>
                <div className="h-36 w-full overflow-hidden rounded-xl border border-border bg-muted">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {bannerPreview ? (
                        <Img
                          src={bannerPreview}
                          alt={t("user.profile.banner_alt", "Banner")}
                          size="banner"
                          draggable={false}
                          className={user.premium ? "cursor-pointer" : ""}
                          onClick={user.premium ? openBannerPicker : undefined}
                        />
                      ) : (
                        <div
                          className={`h-full w-full ${user.premium ? "cursor-pointer" : ""}`}
                          style={{ background: bannerColor }}
                          onClick={user.premium ? openBannerPicker : undefined}
                        />
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("user.profile.change_banner", "Alterar Banner")}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-start justify-between">
                  <DiscordColorPicker
                    label={t("user.profile.banner", "Banner")}
                    value={bannerColor}
                    onChange={setBannerColor}
                  />
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="primary"
                          rounded="xl"
                          disabled={!user.premium}
                          onClick={openBannerPicker}
                        >
                          <ImageUpIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("user.profile.change_banner", "Alterar Banner")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          rounded="xl"
                          disabled={!user.premium}
                          onClick={() => {
                            setBannerDraftFile(null);
                            setBannerMarkedToRemove(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("user.profile.remove_banner", "Remover Banner")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("user.profile.avatar", "Avatar")}</Label>
                <div className="flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Img
                        src={avatarPreview}
                        alt={t("user.profile.avatar_alt", "Avatar")}
                        size="avatar-sm"
                        rounded="full"
                        draggable={false}
                        className="cursor-pointer"
                        onClick={openAvatarPicker}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("user.profile.change_avatar", "Alterar Avatar")}
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="primary"
                          rounded="xl"
                          onClick={openAvatarPicker}
                        >
                          <ImageUpIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("user.profile.change_avatar", "Alterar Avatar")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          rounded="xl"
                          onClick={() => {
                            setAvatarDraftFile(null);
                            setAvatarMarkedToRemove(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("user.profile.remove_avatar", "Remover Avatar")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("auth.display_name", "Nome de exibicao")}</Label>
                <Input
                  value={displayName}
                  rounded="xl"
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("auth.display_name", "Nome de exibicao")}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {t("user.profile.description_label", "Descrição do usuario")}
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-xl"
                  placeholder={t(
                    "user.profile.description_placeholder",
                    "Uma descrição curta do perfil",
                  )}
                  maxLength={250}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {t(
                    "user.profile.gradient_label",
                    "Fundo do perfil (degrade vertical)",
                  )}
                </Label>
                <div className="flex flex-wrap items-start gap-3">
                  <DiscordColorPicker
                    label={t("user.profile.gradient_primary", "Primaria")}
                    value={topColor}
                    onChange={setTopColor}
                  />
                  <DiscordColorPicker
                    label={t("user.profile.gradient_accent", "Realce")}
                    value={bottomColor}
                    onChange={setBottomColor}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg h-full min-h-[560px] border border-border/60 overflow-hidden">
              <ProfilePreviewCard className="h-full" user={previewUser} />
            </div>
          </div>

          {hasChanges && (
            <DialogFooter className="w-full sm:justify-between">
              <div className="flex gap-2 items-center justify-center">
                <span>{t("user.profile.unsaved.title", "Cuidado")}</span>
                <Spacer size="sm" />
                <span>
                  {t(
                    "user.profile.unsaved.message",
                    "Voce tem alterações que não foram salvas!",
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  variant="destructive"
                  rounded="xl"
                  onClick={resetDraft}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.reset", "Redefinir")}
                </Button>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  variant="primary"
                  rounded="xl"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      if (hasProfileChanges) {
                        const ok = await updateProfile({
                          displayName,
                          description,
                          profileNote: user.profileNote || "",
                          profileBannerColor: bannerColor,
                          profileGradientTop: topColor,
                          profileGradientBottom: bottomColor,
                        });
                        if (!ok) return;
                      }

                      if (avatarDraftFile) {
                        const ok = await uploadAvatar(avatarDraftFile);
                        if (!ok) return;
                      } else if (avatarMarkedToRemove) {
                        const ok = await removeAvatar();
                        if (!ok) return;
                      }

                      if (user.premium) {
                        if (bannerDraftFile) {
                          const ok = await uploadBanner(bannerDraftFile);
                          if (!ok) return;
                        } else if (bannerMarkedToRemove) {
                          const ok = await removeBanner();
                          if (!ok) return;
                        }
                      }

                      onClose();
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {saving
                    ? t("common.saving", "Salvando...")
                    : t("user.profile.save_changes", "Salvar Alterações")}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AvatarEditorModal
        open={showAvatarEditor}
        selectedFile={avatarEditorFile}
        onClose={() => {
          setShowAvatarEditor(false);
          setAvatarEditorFile(null);
        }}
        currentAvatarUrl={avatarPreview}
        onSave={async (file) => {
          setAvatarDraftFile(file);
          setAvatarMarkedToRemove(false);
        }}
      />

      {user.premium && (
        <BannerEditorModal
          open={showBannerEditor}
          selectedFile={bannerEditorFile}
          onClose={() => {
            setShowBannerEditor(false);
            setBannerEditorFile(null);
          }}
          currentBannerUrl={bannerPreview}
          onSave={async (file) => {
            setBannerDraftFile(file);
            setBannerMarkedToRemove(false);
          }}
        />
      )}
    </>
  );
}
