import React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { Check, X } from "lucide-react";

export interface ModalConfirmProps {
  isOpen: boolean;
  onResult: (result: boolean) => void;
  title?: React.ReactNode;
  content?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
}

export function ModalConfirm({
  isOpen,
  onResult,
  title,
  content,
  confirmText,
  cancelText,
}: ModalConfirmProps) {
  const { t } = useI18n();
  const safeTitle = title ?? t("modal.confirm.title", "Confirmacao");
  const safeContent = content ?? t("modal.confirm.content", "Tem certeza que deseja continuar?");
  const safeConfirm = confirmText ?? t("common.confirm", "Confirmar");
  const safeCancel = cancelText ?? t("common.cancel", "Cancelar");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onResult(false)}>
      <DialogContent className="sm:max-w-[425px] select-none rounded-xl bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/50 app-create-modal-content">
        <DialogHeader>
          <DialogTitle>{safeTitle}</DialogTitle>
        </DialogHeader>

        {safeContent ? <div className="py-2 text-sm text-muted-foreground">{safeContent}</div> : null}

        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="destructive" rounded="xl" onClick={() => onResult(false)}>
            <X />
            {safeCancel}
          </Button>
          <Button rounded="xl" onClick={() => onResult(true)}>
            <Check />
            {safeConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
