/**
 * The update that has finished downloading, if any. Once there is one, the
 * hourly check stops and a manual check reports it instead of "available":
 * electron-updater would otherwise announce the same version as available
 * again, and the renderer would lose its "restart to update" state after the
 * user chose "later".
 */
export type DownloadedUpdate = { version?: string; releaseNotes?: string };

let downloaded: DownloadedUpdate | null = null;

export function markUpdateDownloaded(update: DownloadedUpdate): void {
  downloaded = update;
}

export function downloadedUpdate(): DownloadedUpdate | null {
  return downloaded;
}
