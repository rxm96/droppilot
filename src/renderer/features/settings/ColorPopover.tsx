import * as React from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { Check } from "@renderer/shared/lib/icons";

// ---------------------------------------------------------------------------
// Color math (HSV <-> hex). All pure, no deps.
// ---------------------------------------------------------------------------
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null;
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

/** Accepts "abc", "aabbcc", "#aabbcc" → returns normalized "#aabbcc" or null. */
function sanitizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : null;
}

const CONIC =
  "conic-gradient(from 0deg, #fb7185, #fbbf24, #34d399, #38bdf8, #818cf8, #a78bfa, #fb7185)";
const HUE_BG =
  "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
const POPOVER_WIDTH = 220;

export type ColorPopoverProps = {
  /** Seed hex (always a valid #rrggbb). */
  color: string;
  /** Whether custom color is the active accent (drives ring + swatch fill). */
  active: boolean;
  /** Fires live as the user picks. */
  onPick: (hex: string) => void;
};

/**
 * Custom in-app color picker replacing the native (un-styleable) OS color
 * dialog. Renders the round trigger swatch plus a portaled popover with an
 * SV area, hue slider and hex input — all using --dp-* design tokens.
 */
export function ColorPopover({ color, active, onPick }: ColorPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [hsv, setHsv] = React.useState<Hsv>(() => hexToHsv(color) ?? { h: 258, s: 0.43, v: 0.98 });
  const [hexText, setHexText] = React.useState(color);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const svRef = React.useRef<HTMLDivElement>(null);
  const hueRef = React.useRef<HTMLDivElement>(null);
  const hsvRef = React.useRef(hsv);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);

  // Re-seed from the incoming color each time the popover opens.
  React.useEffect(() => {
    if (!open) return;
    const seeded = hexToHsv(color);
    if (seeded) setHsv(seeded);
    setHexText(color);
  }, [open, color]);

  const reposition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = clamp(r.left, 8, window.innerWidth - POPOVER_WIDTH - 8);
    setPos({ top: r.bottom + 8, left });
  }, []);

  React.useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, reposition]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = React.useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setHexText(hex);
      onPick(hex);
    },
    [onPick],
  );

  const startDrag =
    (move: (clientX: number, clientY: number) => void) => (e: React.PointerEvent) => {
      e.preventDefault();
      move(e.clientX, e.clientY);
      const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  const moveSV = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = clamp((clientX - r.left) / r.width, 0, 1);
    const v = 1 - clamp((clientY - r.top) / r.height, 0, 1);
    apply({ h: hsvRef.current.h, s, v });
  };

  const moveHue = (clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = clamp((clientX - r.left) / r.width, 0, 1) * 360;
    apply({ h, s: hsvRef.current.s, v: hsvRef.current.v });
  };

  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    setHexText(`#${raw}`);
    const hex = sanitizeHex(raw);
    if (hex) {
      const next = hexToHsv(hex);
      if (next) {
        setHsv(next);
        onPick(hex);
      }
    }
  };

  const onHexBlur = () => {
    const hex = sanitizeHex(hexText);
    setHexText(hex ?? hsvToHex(hsv.h, hsv.s, hsv.v));
  };

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const label = t("settings.row.accent.customAria");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        className={cn(
          "relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full",
          "transition-transform hover:scale-110",
          active
            ? "ring-2 ring-offset-2 ring-offset-[color:var(--dp-bg-elevated)]"
            : "ring-1 ring-[color:var(--dp-border)]",
        )}
        style={{
          background: active ? color : CONIC,
          ...(active ? ({ "--tw-ring-color": color } as React.CSSProperties) : {}),
        }}
      >
        {active && (
          <Check
            size={12}
            strokeWidth={2.4}
            className="relative z-10 text-[color:var(--dp-bg-app)]"
            aria-hidden="true"
          />
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={label}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            className="z-[300] rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-3 shadow-2xl shadow-black/50"
          >
            {/* Saturation / value area */}
            <div
              ref={svRef}
              onPointerDown={startDrag(moveSV)}
              className="relative h-[120px] w-full cursor-crosshair touch-none rounded-[var(--dp-radius-sm)]"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)`,
              }}
            >
              <span
                className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
                }}
              />
            </div>

            {/* Hue slider */}
            <div
              ref={hueRef}
              onPointerDown={startDrag(moveHue)}
              className="relative mt-3 h-3 w-full cursor-pointer touch-none rounded-full"
              style={{ background: HUE_BG }}
            >
              <span
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                style={{
                  left: `${(hsv.h / 360) * 100}%`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
                }}
              />
            </div>

            {/* Hex input */}
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]">
                {t("settings.row.accent.hexLabel")}
              </span>
              <div className="flex flex-1 items-center rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-2 focus-within:border-[color:var(--dp-accent)]">
                <span className="font-mono text-[12px] text-[color:var(--dp-text-dimmer)]">#</span>
                <input
                  value={hexText.replace(/^#/, "")}
                  onChange={onHexChange}
                  onBlur={onHexBlur}
                  maxLength={6}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label={t("settings.row.accent.hexLabel")}
                  className="w-full bg-transparent py-1 pl-1 font-mono text-[12px] uppercase text-[color:var(--dp-text)] outline-none"
                />
              </div>
              <span
                className="h-6 w-6 shrink-0 rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)]"
                style={{ background: currentHex }}
                aria-hidden="true"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
