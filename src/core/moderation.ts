import type { Api } from "./api.ts";

export type ReportReason = "inappropriate" | "spam" | "unsolvable" | "other";
export const REPORT_REASONS: readonly ReportReason[] = ["inappropriate", "spam", "unsolvable", "other"];
export const REPORT_COMMENT_MAX = 500; // same as the check constraint on reports.comment

/** Reports a puzzle once; a second report by the same user fails with a unique violation (kind "conflict"). */
export async function reportPuzzle(api: Api, userId: string, puzzleId: string, reason: ReportReason, comment: string): Promise<void> {
  await api.rest("reports", {
    body: { puzzle_id: puzzleId, reporter_id: userId, reason, comment: comment.trim().slice(0, REPORT_COMMENT_MAX) },
    headers: { Prefer: "return=minimal" },
  });
}

export type ModerationReport = { reason: ReportReason; comment: string; reporter: string | null; createdAt: string };

/** A hidden puzzle or one with open reports, as shown to moderators. */
export type ModerationItem = {
  id: string;
  type: string;
  title: string;
  hidden: boolean;
  publishedAt: string;
  author: { id: string; username: string; banned: boolean; isModerator: boolean } | null;
  reports: ModerationReport[]; // open ones only
};

type Row = {
  id: string;
  type: string;
  title: string;
  hidden: boolean;
  published_at: string;
  author: { id: string; username: string; banned: boolean; is_moderator: boolean } | null;
  reports: { reason: ReportReason; comment: string; created_at: string; reporter: { username: string } | null }[];
};

export const MODERATION_LIMIT = 100;

/** Hidden puzzles and puzzles with open reports, most reported first. Only moderators see hidden ones and all reports. */
export async function fetchModerationQueue(api: Api): Promise<ModerationItem[]> {
  const rows = await api.rest<Row[]>("puzzles", {
    query: {
      select:
        "id,type,title,hidden,published_at," +
        "author:profiles!puzzles_author_id_fkey(id,username,banned,is_moderator)," +
        "reports(reason,comment,created_at,reporter:profiles!reports_reporter_id_fkey(username))",
      or: "(hidden.is.true,report_count.gt.0)",
      "reports.resolved": "is.false",
      "reports.order": "created_at.asc",
      order: "report_count.desc,published_at.desc",
      limit: String(MODERATION_LIMIT),
    },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    hidden: row.hidden,
    publishedAt: row.published_at,
    author: row.author
      ? { id: row.author.id, username: row.author.username, banned: row.author.banned, isModerator: row.author.is_moderator }
      : null,
    reports: row.reports.map((r) => ({ reason: r.reason, comment: r.comment, reporter: r.reporter?.username ?? null, createdAt: r.created_at })),
  }));
}

/** Visible again, reports closed. */
export async function releasePuzzle(api: Api, puzzleId: string): Promise<void> {
  await api.rest("rpc/mod_release_puzzle", { body: { puzzle: puzzleId } });
}

/** Hidden until released, reports closed. */
export async function hidePuzzle(api: Api, puzzleId: string): Promise<void> {
  await api.rest("rpc/mod_hide_puzzle", { body: { puzzle: puzzleId } });
}

export async function setBanned(api: Api, userId: string, ban: boolean): Promise<void> {
  await api.rest("rpc/mod_set_banned", { body: { target: userId, ban } });
}

export async function resetUsername(api: Api, userId: string): Promise<void> {
  await api.rest("rpc/mod_reset_username", { body: { target: userId } });
}
