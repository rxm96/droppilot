import { formatRemaining } from "@renderer/utils";
import type { AuthState, InventoryState, ProfileState, WatchingState } from "../types";

type Props = {
  auth: AuthState;
  profile: ProfileState;
  inventory: InventoryState;
  watching: WatchingState;
  nextWatchIn: number;
  inventoryRefreshing: boolean;
  claimStatus?: { kind: "success" | "error"; message: string; at: number } | null;
  tokenError?: string | null;
  refreshingToken?: boolean;
  onRefreshToken?: () => void;
};

export function StatusBar({
  auth,
  profile,
  inventory,
  watching,
  nextWatchIn,
  inventoryRefreshing,
  claimStatus,
  tokenError,
  refreshingToken,
  onRefreshToken,
}: Props) {
  const authLabel =
    auth.status === "ok"
      ? profile.status === "ready"
        ? `Angemeldet: ${profile.displayName}`
        : "Angemeldet"
      : auth.status === "pending"
      ? "Login läuft..."
      : "Nicht eingeloggt";

  const tokenState =
    auth.status === "ok"
      ? auth.expiresIn <= 0
        ? "danger"
        : auth.expiresIn < 120
        ? "danger"
        : auth.expiresIn < 600
        ? "warn"
        : "success"
      : "muted";

  const inventoryLabel =
    inventory.status === "loading"
      ? "Inventory lädt"
      : inventoryRefreshing
      ? "Inventory aktualisiert..."
      : inventory.status === "ready"
      ? "Inventory ok"
      : inventory.status === "error"
      ? "Inventory-Fehler"
      : "Inventory idle";

  return (
    <div className="status-bar">
      <div className="status-chips">
        <span className={`status-chip ${auth.status === "ok" ? "success" : "muted"}`}>{authLabel}</span>
        <span className={`status-chip ${tokenState}`}>
          <span>Token: {auth.status === "ok" ? formatRemaining(auth.expiresIn) : "n/a"}</span>
          {auth.status === "ok" && auth.expiresIn < 1200 && onRefreshToken ? (
            <button type="button" className="chip-btn" onClick={onRefreshToken} disabled={refreshingToken}>
              {refreshingToken ? "Refresh..." : "Jetzt erneuern"}
            </button>
          ) : null}
        </span>
        <span className="status-chip muted">
          {watching ? `Watching ${watching.name}` : "Kein Channel"}
          {watching ? <span className="status-chip-sub">Next ping in {nextWatchIn}s</span> : null}
        </span>
        <span className={`status-chip ${inventoryRefreshing ? "warn" : "muted"}`}>{inventoryLabel}</span>
      </div>
      <div className="status-chips">
        {tokenError ? <span className="status-chip danger">Refresh-Fehler: {tokenError}</span> : null}
        {claimStatus ? (
          <span className={`status-chip ${claimStatus.kind === "error" ? "danger" : "success"}`}>
            Claim: {claimStatus.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
