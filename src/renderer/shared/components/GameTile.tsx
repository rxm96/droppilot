import { cn } from "@renderer/shared/lib/utils";

/**
 * A game's square tile: the campaign/reward image when there is one, else the
 * short game code (gameCode). Used by the drops and games views.
 */
export function GameTile({
  url,
  code,
  size,
  faded,
}: {
  url?: string;
  code: string;
  size: number;
  faded?: boolean;
}) {
  const box = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        style={box}
        className={cn(
          "block flex-none rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] object-cover",
          faded && "opacity-45",
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={box}
      className={cn(
        "grid flex-none place-items-center rounded-[var(--dp-radius-sm)] bg-[color:var(--dp-bg-elevated-2)] font-mono text-[10px] font-semibold text-[color:var(--dp-text-dim)]",
        faded && "opacity-45",
      )}
    >
      {code}
    </span>
  );
}
