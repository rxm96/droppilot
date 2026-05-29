import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@renderer/shared/lib/utils";

type Tone = "default" | "dp";

/**
 * Lets SelectContent broadcast its tone to descendant items/labels/separators
 * so the *open* menu matches the trigger (the dp trigger + a legacy-styled
 * popover was the visual mismatch we're fixing).
 */
const SelectToneContext = React.createContext<Tone>("default");

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={cn("size-4", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ChevronUpIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={cn("size-4", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={cn("size-4", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m20 6-11 11-5-5" />
  </svg>
);

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

type SelectTriggerProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  tone?: Tone;
};

const TRIGGER_TONE: Record<Tone, string> = {
  default:
    "select inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-none ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1",
  dp: "inline-flex h-8 items-center justify-between gap-2 rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 py-1 font-mono text-[12px] text-[color:var(--dp-text)] shadow-none placeholder:text-[color:var(--dp-text-dimmer)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] focus-visible:border-[color:var(--dp-accent)] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[color:var(--dp-text-dimmer)] [&>span]:line-clamp-1 transition-colors",
};

const CONTENT_TONE: Record<Tone, string> = {
  default:
    "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md",
  dp: "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] text-[color:var(--dp-text)] shadow-xl shadow-black/40",
};

const ITEM_TONE: Record<Tone, string> = {
  default:
    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  dp: "relative flex w-full cursor-default select-none items-center rounded-[var(--dp-radius-sm)] py-1.5 pl-8 pr-2 font-mono text-[12px] text-[color:var(--dp-text-dim)] outline-none transition-colors focus:bg-[color:var(--dp-accent-soft)] focus:text-[color:var(--dp-text)] data-[highlighted]:bg-[color:var(--dp-accent-soft)] data-[highlighted]:text-[color:var(--dp-text)] data-[state=checked]:text-[color:var(--dp-text)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
};

const LABEL_TONE: Record<Tone, string> = {
  default: "px-2 py-1.5 text-sm font-semibold",
  dp: "px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]",
};

const SEPARATOR_TONE: Record<Tone, string> = {
  default: "-mx-1 my-1 h-px bg-muted",
  dp: "-mx-1 my-1 h-px bg-[color:var(--dp-border)]",
};

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, tone = "default", ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn(TRIGGER_TONE[tone], className)} {...props}>
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUpIcon />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDownIcon />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

type SelectContentProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  tone?: Tone;
};

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = "popper", tone = "default", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        CONTENT_TONE[tone],
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        position === "popper" &&
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectToneContext.Provider value={tone}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectToneContext.Provider>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
  const tone = React.useContext(SelectToneContext);
  return <SelectPrimitive.Label ref={ref} className={cn(LABEL_TONE[tone], className)} {...props} />;
});
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  const tone = React.useContext(SelectToneContext);
  return (
    <SelectPrimitive.Item ref={ref} className={cn(ITEM_TONE[tone], className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
  const tone = React.useContext(SelectToneContext);
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn(SEPARATOR_TONE[tone], className)}
      {...props}
    />
  );
});
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
