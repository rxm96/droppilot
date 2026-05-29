import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

type LogoProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number;
  /**
   * Animate the orbit node circling the center — the "autopilot is running"
   * feel. Honors prefers-reduced-motion (falls back to a static node).
   */
  animated?: boolean;
};

// Axis-aligned ellipse (in the rotated group's frame) used both as the visible
// ring and as the motion track for the orbiting node.
const ORBIT_PATH = "M11 32 a21 8.5 0 1 0 42 0 a21 8.5 0 1 0 -42 0";
const INK = "#0a0b0d";

export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ className, size = 16, animated = false, ...props }, ref) => {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spin = animated && !reduceMotion;

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("inline-block flex-shrink-0", className)}
        aria-label="Droppilot"
        {...props}
      >
        <defs>
          <linearGradient
            id="dp-logo-grad"
            x1="0"
            y1="0"
            x2="64"
            y2="64"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--dp-accent)" />
            {/* End-stop derived from the live accent so the tile follows the
                user-picked accent colour. */}
            <stop offset="100%" stopColor="color-mix(in srgb, var(--dp-accent) 80%, black)" />
          </linearGradient>
        </defs>

        {/* App tile */}
        <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#dp-logo-grad)" />
        <rect
          x="2.5"
          y="2.5"
          width="59"
          height="59"
          rx="14.5"
          fill="none"
          stroke="color-mix(in srgb, var(--dp-accent) 35%, transparent)"
        />

        {/* Tilted orbit: ring + node circling the centre */}
        <g transform="rotate(-28 32 32)">
          <ellipse cx="32" cy="32" rx="21" ry="8.5" fill="none" stroke={INK} strokeWidth="4" />
          {spin ? (
            <circle r="3.9" fill={INK}>
              <animateMotion dur="4.4s" repeatCount="indefinite" path={ORBIT_PATH} />
            </circle>
          ) : (
            <circle cx="53" cy="32" r="3.9" fill={INK} />
          )}
        </g>

        {/* Centre node */}
        <circle cx="32" cy="32" r="5.6" fill={INK} />
      </svg>
    );
  },
);
Logo.displayName = "Logo";
