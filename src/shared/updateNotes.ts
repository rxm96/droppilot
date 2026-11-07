// Release notes for the in-app update dialog.
//
// Main normalizes whatever electron-updater hands over (a markdown or HTML
// string, or an array of { note } entries) into the plain "What's new for
// users" section; the renderer groups that text into sections for display.

export type UpdateNoteSection = { heading: string | null; items: string[] };

const USER_HEADING_RE = /^(#{1,6})?\s*what'?s new for users\s*:?\s*$/i;
const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(\S.*)$/;
const CHANGELOG_HEADING_RE = /^(?:#{1,6}\s*)?(?:full\s+changelog|what'?s changed|changelog)\b/i;
const BULLET_RE = /^[-*+]\s+(.*)$/;

const normalizeLine = (line: string) => line.replace(/[‘’`]/g, "'").trim();

function extractReleaseNoteText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  if (typeof record.note === "string") return record.note;
  if (typeof record.body === "string") return record.body;
  if (typeof record.releaseNotes === "string") return record.releaseNotes;
  return "";
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** HTML (GitHub's rendered release body) → markdown-ish plain text. Headings
 *  keep their level as `#` markers so the section cut below works the same
 *  for both formats. */
function htmlToText(raw: string): string {
  return decodeEntities(
    raw
      .replace(/<h([1-6])\b[^>]*>/gi, (_m, level: string) => `\n${"#".repeat(Number(level))} `)
      .replace(/<\/h[1-6]\s*>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

/** The "What's new for users" section. It ends at a changelog heading or at a
 *  markdown heading of the same or a higher level, so its own `### Added` /
 *  `### Fixed` sub-headings stay inside. Without that heading, everything
 *  before the changelog is used. */
function extractUserFacingSection(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => USER_HEADING_RE.test(normalizeLine(line)));
  if (start < 0) {
    const changelogStart = lines.findIndex((line) =>
      CHANGELOG_HEADING_RE.test(normalizeLine(line)),
    );
    return (changelogStart >= 0 ? lines.slice(0, changelogStart) : lines).join("\n").trim();
  }
  const userLevel = normalizeLine(lines[start]).match(USER_HEADING_RE)?.[1]?.length ?? 0;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (CHANGELOG_HEADING_RE.test(line)) {
      end = i;
      break;
    }
    const heading = line.match(MARKDOWN_HEADING_RE);
    if (heading && userLevel > 0 && heading[1].length <= userLevel) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

export function normalizeReleaseNotes(value: unknown): string | undefined {
  const raw = Array.isArray(value)
    ? value
        .map((entry) => extractReleaseNoteText(entry))
        .filter((entry) => entry.trim().length > 0)
        .join("\n\n")
    : extractReleaseNoteText(value);
  if (!raw.trim()) return undefined;
  const text = htmlToText(raw.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const userFacing = extractUserFacingSection(text);
  return userFacing.length > 0 ? userFacing : undefined;
}

const cleanHeading = (text: string) =>
  text
    .replace(/^[*_]+|[*_]+$/g, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();

/** Groups the user-facing notes for display. A markdown heading or a bare
 *  (non-bullet) line starts a section; `- ` lines are its items. A heading
 *  without items is dropped, except a bare line that is the only text of its
 *  section: that is prose, not a heading, so it is kept as an item. */
export function parseUpdateNoteSections(text: string | null | undefined): UpdateNoteSection[] {
  type Draft = UpdateNoteSection & { bare: string | null };
  const drafts: Draft[] = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const item = bullet[1].trim();
      if (!item) continue;
      let current = drafts[drafts.length - 1];
      if (!current) {
        current = { heading: null, items: [], bare: null };
        drafts.push(current);
      }
      current.items.push(item);
      continue;
    }
    const heading = line.match(MARKDOWN_HEADING_RE);
    if (heading) {
      drafts.push({ heading: cleanHeading(heading[2]) || null, items: [], bare: null });
      continue;
    }
    drafts.push({ heading: cleanHeading(line) || null, items: [], bare: line });
  }
  const sections: UpdateNoteSection[] = [];
  for (const draft of drafts) {
    const section: UpdateNoteSection | null =
      draft.items.length > 0
        ? { heading: draft.heading, items: draft.items }
        : draft.bare
          ? { heading: null, items: [draft.bare] }
          : null;
    if (!section) continue;
    const previous = sections[sections.length - 1];
    if (previous && previous.heading === null && section.heading === null) {
      previous.items.push(...section.items);
    } else {
      sections.push(section);
    }
  }
  return sections;
}
