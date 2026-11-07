import { Button } from "@renderer/shared/components/ui/button";
import { cn } from "@renderer/shared/lib/utils";

export type ChoiceButtonsProps<T extends string> = {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
};

/** A small set of mutually exclusive buttons (theme, update channel). */
export function ChoiceButtons<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: ChoiceButtonsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="dp-outline"
            size="dp-md"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              active &&
                "border-[color:var(--dp-accent)] bg-[color:var(--dp-accent-soft)] hover:border-[color:var(--dp-accent)]",
            )}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
