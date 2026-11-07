export type UpdateDialogMode = "hidden" | "ready" | "installing";

export type UpdateDialogInput = {
  /** Auto-updater state (`AppUpdateStatus.state`). */
  state: string;
  /** Version of the downloaded update, when known. */
  version?: string;
  /** Version the user chose "later" for; null when nothing was dismissed. */
  dismissedVersion: string | null;
  /** The user pressed "restart now" and the install call is in flight. */
  installing: boolean;
};

/** The key a dismissal is stored under, so an update without a version can be
 *  dismissed too. */
export const dismissKey = (version: string | undefined) => version ?? "";

/** Whether the update dialog shows, and in which state. Only a downloaded
 *  update opens it; once the state leaves "downloaded" (an install error, a
 *  new check) it hides again, so it can never stay stuck on "installing". */
export function resolveUpdateDialog({
  state,
  version,
  dismissedVersion,
  installing,
}: UpdateDialogInput): UpdateDialogMode {
  if (state !== "downloaded") return "hidden";
  if (installing) return "installing";
  if (dismissedVersion !== null && dismissedVersion === dismissKey(version)) return "hidden";
  return "ready";
}
