import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface ModalLoadingProps {
  isOpen: boolean;
}

export default function ModalLoading({ isOpen }: ModalLoadingProps) {
  const { t } = useI18n();
  return (
    <Dialog open={isOpen} >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[425px] bg-background/50 backdrop-blur rounded-xl supports-[backdrop-filter]:bg-background/50"
      >
        <div className="flex flex-col items-center justify-center text-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          {t("common.loading", "Carregando...")}
        </div>
      </DialogContent>
    </Dialog>
  )
}
