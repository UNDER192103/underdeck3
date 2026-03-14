import React, { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import axios from "axios";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { Loader2 } from "lucide-react";

interface AvatarEditorModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (file: File) => Promise<void>;
    currentAvatarUrl: string;
    selectedFile: File | null;
}

const OUTPUT_SIZE = 512;

function createImage(imageSrc: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Falha ao carregar imagem para recorte."));
        image.src = imageSrc;
    });
}

async function getCroppedImageFile(imageSrc: string, cropArea: Area, baseFile: File): Promise<File> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Falha ao obter contexto do canvas.");
    }

    ctx.drawImage(
        image,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
    );

    const outputType = baseFile.type === "image/webp" ? "image/webp" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), outputType, 0.95);
    });

    if (!blob) {
        throw new Error("Falha ao gerar imagem recortada.");
    }

    const extension = outputType === "image/webp" ? "webp" : "png";
    return new File([blob], `avatar.${extension}`, { type: outputType });
}

async function getProcessedGifAvatarFile(baseFile: File, cropArea: Area): Promise<File> {
    const formData = new FormData();
    formData.append("file", baseFile);
    formData.append("target", "avatar");
    formData.append("x", String(cropArea.x));
    formData.append("y", String(cropArea.y));
    formData.append("width", String(cropArea.width));
    formData.append("height", String(cropArea.height));

    const response = await axios.post("/api/auth/gif-process", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        responseType: "blob",
    });

    return new File([response.data], "avatar.gif", { type: "image/gif" });
}

export function AvatarEditorModal({ open, onClose, onSave, currentAvatarUrl, selectedFile }: AvatarEditorModalProps) {
    const { t } = useI18n();
    const [previewUrl, setPreviewUrl] = useState<string>(currentAvatarUrl);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [saving, setSaving] = useState(false);

    const isGif = useMemo(() => selectedFile?.type === "image/gif", [selectedFile]);

    useEffect(() => {
        if (!selectedFile) {
            setPreviewUrl(currentAvatarUrl);
            return;
        }

        const url = URL.createObjectURL(selectedFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [selectedFile, currentAvatarUrl]);

    const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const resetEditor = () => {
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
    };

    useEffect(() => {
        if (open) resetEditor();
    }, [open, selectedFile]);

    const handleSave = async () => {
        if (!selectedFile) return;
        if (!croppedAreaPixels) return;
        setSaving(true);
        try {
            if (isGif) {
                const processedGif = await getProcessedGifAvatarFile(selectedFile, croppedAreaPixels);
                await onSave(processedGif);
            } else {
                const croppedFile = await getCroppedImageFile(previewUrl, croppedAreaPixels, selectedFile);
                await onSave(croppedFile);
            }
            onClose();
            resetEditor();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[620px] select-none rounded-xl bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <DialogHeader>
                    <DialogTitle>{t("user.avatar.edit_title", "Editar avatar")}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    {!selectedFile ? (
                        <div className="space-y-3">
                            <div className="mx-auto h-56 w-56 overflow-hidden rounded-full border border-border bg-muted">
                                <img src={currentAvatarUrl} alt={t("user.avatar.current_alt", "Avatar atual")} className="h-full w-full object-cover" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t("user.image.none_selected", "Nenhuma imagem selecionada.")}
                            </p>
                        </div>
	                    ) : (
                        <>
                            <div className="relative mx-auto h-72 w-72 overflow-hidden rounded-xl border border-border bg-muted">
                                <Cropper
                                    image={previewUrl}
                                    crop={crop}
                                    zoom={zoom}
                                    aspect={1}
                                    cropShape="round"
                                    showGrid={false}
                                    restrictPosition
                                    onCropChange={setCrop}
                                    onZoomChange={setZoom}
                                    onCropComplete={onCropComplete}
                                    minZoom={1}
                                    maxZoom={4}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>{t("user.crop.drag_zoom", "Arraste para mover e ajuste o zoom")}</Label>
                                <input
                                    type="range"
                                    min={1}
                                    max={4}
                                    step={0.01}
                                    value={zoom}
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="w-full"
                                />
                                <div className="flex items-center justify-end gap-2">
                                    <Button rounded="xl" type="button" variant="ghost-destructive" onClick={resetEditor}>
                                        {t("common.reset", "Reset")}
                                    </Button>
                                </div>
                                {isGif && (
                                    <p className="text-xs text-muted-foreground text-center">
                                        {t("user.gif.server_process", "GIF: ao confirmar, o recorte e redimensionamento sera processado no servidor.")}
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="w-full sm:justify-between">
                    <div className="w-full">
                        <Button
                            rounded="xl"
                            type="button"
                            variant="outline-destructive"
                            disabled={saving}
                            className="w-full"
                            onClick={onClose}>
                            {t("common.cancel", "Cancelar")}
                        </Button>
                    </div>
                    <div className="w-full">
                        <Button
                            rounded="xl"
                            disabled={!selectedFile || saving}
                            className="w-full"
                            onClick={handleSave}>
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t("common.processing", "Processando...")}
                                </>
                            ) : (
                                t("common.confirm", "Confirmar")
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

