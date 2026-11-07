export type UpdateStatus = {
  state:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "none"
    | "error"
    | "unsupported";
  message?: string;
  version?: string;
  progress?: number;
};

export type UpdateStatusLine = {
  /** i18n key of the status words. */
  key: string;
  /** Mono data appended after the words (version, percent). */
  suffix?: string;
  tone: "ok" | "accent" | "err" | "dim";
};

const withSuffix = (line: UpdateStatusLine, suffix: string | null): UpdateStatusLine =>
  suffix ? { ...line, suffix } : line;

/** The one-line update status under "DropPilot <version>". */
export function updateStatusLine(status: UpdateStatus | undefined): UpdateStatusLine {
  const version = status?.version ? ` · v${status.version}` : null;
  switch (status?.state) {
    case "none":
      return { key: "settings.status.upToDate", tone: "ok" };
    case "available":
      return withSuffix({ key: "settings.status.available", tone: "accent" }, version);
    case "downloading":
      return withSuffix(
        { key: "settings.status.downloading", tone: "accent" },
        typeof status.progress === "number" ? ` · ${Math.round(status.progress)}%` : null,
      );
    case "downloaded":
      return withSuffix({ key: "settings.status.downloaded", tone: "ok" }, version);
    case "error":
      return { key: "settings.status.error", tone: "err" };
    case "checking":
      return { key: "settings.status.checking", tone: "dim" };
    case "unsupported":
      return { key: "settings.status.unsupported", tone: "dim" };
    default:
      return { key: "settings.status.idle", tone: "dim" };
  }
}
