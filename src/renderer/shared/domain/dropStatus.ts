/**
 * The one status vocabulary for drops, shared by the overview's plan table and
 * the drops view (rendered by DropStatusPill). "live" is never a status: that
 * word means a live channel.
 *
 * - watching / next / queued: the farm plan has a ready time for it
 * - needs-link: a game account must be linked on Twitch first
 * - claim: earned, waiting to be claimed
 * - blocked: in the user's games, but Twitch does not let it progress yet
 * - claimed: done
 * - not-farmed: the engine will not watch for it (game not farmed, nothing to watch)
 * - expired: its campaign is over
 */
export type DropStatus =
  | "watching"
  | "next"
  | "queued"
  | "needs-link"
  | "claim"
  | "blocked"
  | "claimed"
  | "not-farmed"
  | "expired";
