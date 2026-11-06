import { useI18n } from "@renderer/shared/i18n";
import { Button } from "@renderer/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@renderer/shared/components/ui/alert-dialog";

export type ResetStatsButtonProps = {
  onReset: () => void;
};

/** "reset stats" behind the confirmation dialog (moved here from the stats view). */
export function ResetStatsButton({ onReset }: ResetStatsButtonProps) {
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="dp-outline"
          size="dp-md"
          className="border-[color:color-mix(in_srgb,var(--dp-signal-err)_35%,transparent)] text-[color:var(--dp-signal-err)]"
        >
          {t("settings.row.resetStats.button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("stats.resetConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("stats.resetConfirmDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("stats.resetCancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onReset}
            className="bg-[color:var(--dp-signal-err)] text-[#0a0b0d] hover:bg-[color:var(--dp-signal-err)] hover:opacity-90"
          >
            {t("stats.resetConfirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
