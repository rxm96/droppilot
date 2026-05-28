import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { FONT_PAIRS, type FontPairId } from "@renderer/shared/fontPairs";

export type FontPickerProps = {
  fontPair: FontPairId;
  setFontPair: (id: FontPairId) => void;
};

export function FontPicker({ fontPair, setFontPair }: FontPickerProps) {
  const { t } = useI18n();
  return (
    <Select value={fontPair} onValueChange={(v) => setFontPair(v as FontPairId)}>
      <SelectTrigger tone="dp" aria-label={t("settings.row.fontPair.label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {FONT_PAIRS.map((pair) => (
            <SelectItem
              key={pair.id}
              value={pair.id}
              // Render the pair name in its own sans font so the user sees
              // a live preview before picking.
              style={{ fontFamily: pair.sans }}
            >
              {t(pair.nameKey)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
