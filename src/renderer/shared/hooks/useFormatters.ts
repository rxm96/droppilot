import { useMemo } from "react";
import type { Language } from "../../i18n";
import { formatBytes, formatDuration, formatRemaining } from "../utils/formatters";

const getLocale = (language: Language) => (language === "de" ? "de-DE" : "en-US");

export function useFormatters(language: Language) {
  return useMemo(() => {
    const locale = getLocale(language);
    const numberFormatter = new Intl.NumberFormat(locale);
    const compactFormatter = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    const formatNumber = (val?: number | null) =>
      numberFormatter.format(Math.max(0, Math.round(val ?? 0)));
    const formatViewers = (val?: number | null) => {
      try {
        return compactFormatter.format(Math.max(0, val ?? 0));
      } catch {
        return formatNumber(val ?? 0);
      }
    };
    const formatTime = (ts?: number | null) =>
      ts ? new Date(ts).toLocaleTimeString(locale) : "n/a";

    return {
      formatNumber,
      formatViewers,
      formatTime,
      formatBytes,
      formatDuration,
      formatRemaining,
    };
  }, [language]);
}
