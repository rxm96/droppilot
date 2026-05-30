import { useCallback, useEffect, useState } from "react";
import { isReleaseHistoryResult, type ReleaseEntry } from "../../../../shared/releaseHistory";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; releases: ReleaseEntry[]; stale: boolean }
  | { status: "error"; message: string };

export function useReleaseHistory(enabled: boolean) {
  const [state, setState] = useState<State>({ status: "idle" });

  const load = useCallback(async () => {
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const res: unknown = await window.electronAPI.app.releaseHistory();
      if (!isReleaseHistoryResult(res)) {
        setState({ status: "error", message: "Invalid release history response" });
        return;
      }
      if (res.status === "error") {
        setState({ status: "error", message: res.message });
        return;
      }
      setState({ status: "ready", releases: res.releases, stale: res.stale });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (enabled && state.status === "idle") void load();
  }, [enabled, load, state.status]);

  return { state, reload: load };
}
