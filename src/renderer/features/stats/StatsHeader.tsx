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

export type StatsHeaderProps = {
  lastReset: number;
  onReset: () => void;
};

const DAY_MS = 86_400_000;

export function StatsHeader({ lastReset, onReset }: StatsHeaderProps) {
  const { t, language } = useI18n();

  const date = new Date(lastReset).toLocaleDateString(language);
  const days = Math.max(0, Math.floor((Date.now() - lastReset) / DAY_MS));

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[17px] font-semibold leading-tight text-[color:var(--dp-text)]">
          {t("stats.title")}
        </h1>
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("stats.countingSince", { date, days })}
        </span>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="dp-outline" size="dp-sm">
            {t("stats.reset")}
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
    </div>
  );
}
