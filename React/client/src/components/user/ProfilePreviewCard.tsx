import React from "react";
import { AppUser, UserTag } from "@/types/user";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Img } from "@/components/ui/img";
import { useI18n } from "@/contexts/I18nContext";

interface ProfilePreviewCardProps {
    user: AppUser;
    noteEditable?: boolean;
    onNoteChange?: (value: string) => void;
    showEditButton?: boolean;
    onEditProfileClick?: () => void;
    onMoreUserInfoClick?: () => void;
    className?: string;
    size?: "default" | 'dropdown';
}

function renderDescriptionWithLinks(description: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const exactUrlRegex = /^https?:\/\/[^\s]+$/;
    const parts = description.split(urlRegex);

    return parts.map((part, index) => {
        if (exactUrlRegex.test(part)) {
            return (
                <a
                    key={`${part}-${index}`}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline hover:text-blue-300"
                >
                    {part}
                </a>
            );
        }

        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    });
}

function isUrlIcon(icon: string) {
    return /^https?:\/\//i.test(icon) || icon.startsWith("/");
}

function renderTagIcon(tag: UserTag) {
    if (!tag.icon || !tag.icon.trim()) {
        return <span className="text-[11px] leading-none">*</span>;
    }

    const icon = tag.icon.trim();
    if (isUrlIcon(icon)) {
        return <img src={icon} alt="" className="h-4.5 w-4.5 rounded-sm object-cover" />;
    }

    return <span className="text-[11px] leading-none">{icon}</span>;
}

export function ProfilePreviewCard({
    user,
    noteEditable = false,
    onNoteChange,
    showEditButton = false,
    onEditProfileClick,
    onMoreUserInfoClick,
    className,
    size = "default",
}: ProfilePreviewCardProps) {
    const { t } = useI18n();
    const bannerColor = user.profileBannerColor || "#1f2937";
    const gradientTop = user.profileGradientTop || "#1d4ed8";
    const gradientBottom = user.profileGradientBottom || "#0f172a";
    const avatarUrl = user.avatarUrl || "/assets/icons/profile-icon-v1.png";
    const bannerUrl = user.bannerUrl;

    return (
        <div
            className={`flex h-full min-h-0 flex-col p-1 rounded-lg select-none overflow-hidden ${className || ""}`}
            style={{
                background: `linear-gradient(to bottom, ${gradientTop}, ${gradientBottom})`,
            }}
        >
            <div className={`relative ${size === "dropdown" ? "h-30" : "h-36"} w-full rounded-t-lg overflow-hidden`}>
                {bannerUrl ? (
                    <Img
                        src={bannerUrl}
                        alt={t("user.profile.banner_alt", "Banner do perfil")}
                        size="banner"
                        draggable={false}
                    />
                ) : (
                    <div className="h-full w-full" style={{ background: bannerColor }} />
                )}
            </div>

            <div className="relative flex-1 min-h-0 bg-black/20 rounded-b-lg">
                <Img
                    src={avatarUrl}
                    alt={t("user.profile.avatar_alt", "Avatar")}
                    size={size === "dropdown" ? "avatar-dropdown" : "avatar"}
                    rounded="full"
                    draggable={false}
                    onClick={onMoreUserInfoClick}
                    className={cn(
                        "absolute cursor-pointer",
                        size === "dropdown" ? "-top-10 left-2.5" : "-top-12 left-2.5"
                    )}
                />

                <div
                    className={cn(
                        "px-3 pb-3 flex h-full min-h-0 flex-col",
                        size === "dropdown" ? "pt-10" : "pt-13"
                    )}
                >
                    <p className="text-base text-xl font-bold text-white cursor-pointer" onClick={onMoreUserInfoClick}>{user.displayName}</p>
                    <p className="text-sm text-white/80 cursor-pointer" onClick={onMoreUserInfoClick}>{user.username}</p>
                    {Array.isArray(user.tags) && user.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-0.5 select-none">
                            {user.tags.map((tag, index) => (
                                <Tooltip key={`${tag.name}-${index}`} delayDuration={100}>
                                    <TooltipTrigger asChild>
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full">
                                            {renderTagIcon(tag)}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6} className="select-none">
                                        <p>{tag.description || tag.name}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                    )}
                    {user.description && (
                        <p className="mt-2 text-sm text-white break-words">
                            {renderDescriptionWithLinks(user.description)}
                        </p>
                    )}

                    <div className="mt-3">
                        <p className="text-xs uppercase tracking-wide text-white/70">{t("user.profile.note", "Nota")}</p>
                        <Textarea
                            value={user.profileNote || ""}
                            onChange={(e) => onNoteChange?.(e.target.value)}
                            readOnly={!noteEditable}
                            placeholder={t("user.profile.note_placeholder", "Escreva sua nota aqui...")}
                            maxLength={250}
                            className="p-1 min-h-[40px] max-h-[250px] resize-y border-none hover:border-white/20 text-white placeholder:text-white/60"
                        />
                    </div>

                    {showEditButton && (
                        <Button
                            className="w-full mt-2"
                            rounded="lg"
                            onClick={onEditProfileClick}>
                            {t("user.profile.edit", "Editar perfil")}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
