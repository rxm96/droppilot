import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

type LogoProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number;
};

export const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ className, size = 16, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 16 16"
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
          x2="16"
          y2="16"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--dp-accent)" />
          {/* End-stop derived from the live accent (slightly darker mix) so
              the logo gradient follows user-picked accent colors. */}
          <stop offset="100%" stopColor="color-mix(in srgb, var(--dp-accent) 80%, black)" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" fill="url(#dp-logo-grad)" />
      <rect
        x="0.5"
        y="0.5"
        width="15"
        height="15"
        rx="3"
        stroke="color-mix(in srgb, var(--dp-accent) 35%, transparent)"
        strokeWidth="1"
      />
      <path
        d="M5.5 4.5 L5.5 11 M5.5 11 L11.5 11"
        stroke="#0a0b0d"
        strokeWidth="1.6"
        strokeLinecap="square"
        fill="none"
      />
      <path
        d="M5.5 11 L11.5 4.5"
        stroke="#0a0b0d"
        strokeWidth="1.6"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  ),
);
Logo.displayName = "Logo";
