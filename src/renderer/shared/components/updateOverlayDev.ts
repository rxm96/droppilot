type UpdateStatus = {
  state:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installing"
    | "downloaded"
    | "none"
    | "error"
    | "unsupported";
  message?: string;
  version?: string;
  releaseNotes?: string;
  progress?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
};

export type UpdateOverlayDevState = "downloading" | "ready" | "installing";

const DEV_RELEASE_NOTES = [
  "- Improved update flow stability and error handling",
  "- Added release notes in the update overlay",
  "- Hardened drag-and-drop reorder edge cases",
  "- Reduced unnecessary priority-plan IPC refreshes",
].join("\n");

const DEV_FIXTURES: Record<UpdateOverlayDevState, UpdateStatus> = {
  downloading: {
    state: "downloading",
    version: "2.5.0",
    releaseNotes: DEV_RELEASE_NOTES,
    progress: 25,
    transferred: 12.1 * 1024 * 1024,
    total: 48 * 1024 * 1024,
    bytesPerSecond: 8.2 * 1024 * 1024,
  },
  ready: {
    state: "downloaded",
    version: "2.5.0",
    releaseNotes: DEV_RELEASE_NOTES,
  },
  installing: {
    state: "installing",
    version: "2.5.0",
    releaseNotes: DEV_RELEASE_NOTES,
  },
};

function normalizeLegacyState(raw: string | null): UpdateOverlayDevState | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true") return "downloading";
  if (value === "downloaded") return "ready";
  if (value === "downloading" || value === "ready" || value === "installing") {
    return value;
  }
  return null;
}

export function resolveUpdateOverlayDevState(search: string): UpdateOverlayDevState | null {
  const params = new URLSearchParams(search);
  const explicitState = normalizeLegacyState(params.get("updateOverlayState"));
  if (explicitState) return explicitState;
  return normalizeLegacyState(params.get("updateOverlayPreview"));
}

export function getUpdateOverlayDevStatus(state: UpdateOverlayDevState): UpdateStatus {
  return { ...DEV_FIXTURES[state] };
}
