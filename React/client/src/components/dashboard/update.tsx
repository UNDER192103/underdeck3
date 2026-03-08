import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { UpdateState } from "@/types/electron";

export default function UpdatePage() {
  const { t } = useI18n();
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);

  const loadState = async () => {
    const next = await window.underdeck.updates.getState();
    setState(next);
  };

  useEffect(() => {
    void loadState();
  }, []);

  const hasAvailableUpdate = Boolean(state?.updateAvailable && state?.availableVersion);
  const versionLabel = useMemo(() => state?.availableVersion ?? "-", [state?.availableVersion]);
  const lastReleaseAt = useMemo(() => {
    if (!state?.lastAvailableReleaseDate) return "-";
    const d = new Date(state.lastAvailableReleaseDate);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }, [state?.lastAvailableReleaseDate]);
  const lastUpdatedAt = useMemo(() => {
    if (!state?.lastUpdatedAt) return "-";
    const d = new Date(state.lastUpdatedAt);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }, [state?.lastUpdatedAt]);

  return (
    <div className="p-2 grid w-full max-w-full select-none">
      <Card className="w-full min-w-0 border-border/70 bg-card/70 p-4 backdrop-blur-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("updates.title", "Atualizacoes")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("updates.current_version", "Versao atual")}: {state?.currentVersion ?? "-"}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("updates.available_version", "Versao disponivel")}: {versionLabel}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("updates.download_progress", "Progresso de download")}: {Math.round(state?.downloadPercent ?? 0)}%
          </p>
          <p className="text-sm text-muted-foreground">
            {t("updates.last_release_date", "Quando saiu a ultima atualizacao")}: {lastReleaseAt}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("updates.last_updated_at", "Quando foi atualizado")}: {lastUpdatedAt}
          </p>
          {busy ? (
            <p className="text-sm text-cyan-300">{t("updates.searching", "Procurando atualizacao...")}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
          <div>
            <Label htmlFor="update-auto-download">
              {t("updates.auto_download", "Baixar atualizacoes automaticamente quando disponivel")}
            </Label>
          </div>
          <Switch
            id="update-auto-download"
            checked={Boolean(state?.autoDownloadEnabled)}
            onCheckedChange={async (checked) => {
              const next = await window.underdeck.updates.setAutoDownload(Boolean(checked));
              setState(next);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline-primary"
            rounded="xl"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await window.underdeck.updates.check();
                setState(next);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("updates.searching", "Procurando atualizacao...") : t("updates.check_button", "Verificar atualizacoes")}
          </Button>
          <Button
            type="button"
            rounded="xl"
            disabled={!hasAvailableUpdate || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await window.underdeck.updates.downloadInstall();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("updates.install_button", "Baixar e instalar")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
