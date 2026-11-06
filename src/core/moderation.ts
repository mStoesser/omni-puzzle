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

/** Reports a chain once, like reportPuzzle. */
export async function reportChain(api: Api, userId: string, chainId: string, reason: ReportReason, comment: string): Promise<void> {
  await api.rest("reports", {
    body: { chain_id: chainId, reporter_id: userId, reason, comment: comment.trim().slice(0, REPORT_COMMENT_MAX) },
    headers: { Prefer: "return=minimal" },
  });
}

export async function hasReportedChain(api: Api, userId: string, chainId: string): Promise<boolean> {
  const rows = await api.rest<unknown[]>("reports", { query: { reporter_id: `eq.${userId}`, chain_id: `eq.${chainId}`, select: "id" } });
  return rows.length > 0;
}

export type ModerationReport = { reason: ReportReason; comment: string; reporter: string | null; createdAt: string };

/** A hidden puzzle or chain, or one with open reports, as shown to moderators. */
export type ModerationItem = {
  kind: "puzzle" | "chain";
  id: string;
  type: string; // "" for chains
  stepCount: number; // 0 for puzzles
  title: string;
  hidden: boolean;
  publishedAt: string;
  doc: unknown; // untrusted; for showing its images
  author: { id: string; username: string; banned: boolean; isModerator: boolean } | null;
  reports: ModerationReport[]; // open ones only
};

type Row = {
  id: string;
  type?: string;
  title: string;
  hidden: boolean;
  report_count: number;
  published_at: string;
  doc?: unknown;
  steps?: unknown;
  author: { id: string; username: string; banned: boolean; is_moderator: boolean } | null;
  reports: { reason: ReportReason; comment: string; created_at: string; reporter: { username: string } | null }[];
};

export const MODERATION_LIMIT = 100;

const MODERATION_REPORTS = "reports(reason,comment,created_at,reporter:profiles!reports_reporter_id_fkey(username))";

function moderationQuery(select: string, author: string): Record<string, string> {
  return {
    select: `${select},report_count,author:profiles!${author}(id,username,banned,is_moderator),${MODERATION_REPORTS}`,
    or: "(hidden.is.true,report_count.gt.0)",
    "reports.resolved": "is.false",
    "reports.order": "created_at.asc",
    order: "report_count.desc,published_at.desc",
    limit: String(MODERATION_LIMIT),
  };
}

/**
 * Hidden puzzles and chains and those with open reports, most reported first (at most MODERATION_LIMIT of each).
 * Only moderators see hidden ones and all reports.
 */
export async function fetchModerationQueue(api: Api): Promise<ModerationItem[]> {
  const [puzzles, chains] = await Promise.all([
    api.rest<Row[]>("puzzles", { query: moderationQuery("id,type,title,hidden,published_at,doc", "puzzles_author_id_fkey") }),
    api.rest<Row[]>("chains", { query: moderationQuery("id,title,hidden,published_at,steps", "chains_author_id_fkey") }),
  ]);
  const rows = [...puzzles.map((row) => ({ row, kind: "puzzle" as const })), ...chains.map((row) => ({ row, kind: "chain" as const }))];
  return rows
    .sort((a, b) => b.row.report_count - a.row.report_count || b.row.published_at.localeCompare(a.row.published_at))
    .map(({ row, kind }) => toItem(row, kind));
}

function toItem(row: Row, kind: ModerationItem["kind"]): ModerationItem {
  return {
    kind,
    id: row.id,
    type: row.type ?? "",
    stepCount: Array.isArray(row.steps) ? row.steps.length : 0,
    title: row.title,
    hidden: row.hidden,
    publishedAt: row.published_at,
    doc: row.doc ?? null,
    author: row.author
      ? { id: row.author.id, username: row.author.username, banned: row.author.banned, isModerator: row.author.is_moderator }
      : null,
    reports: row.reports.map((r) => ({ reason: r.reason, comment: r.comment, reporter: r.reporter?.username ?? null, createdAt: r.created_at })),
  };
}

/** Visible again, reports closed. */
export async function releasePuzzle(api: Api, puzzleId: string): Promise<void> {
  await api.rest("rpc/mod_release_puzzle", { body: { puzzle: puzzleId } });
}

/** Hidden until released, reports closed. */
export async function hidePuzzle(api: Api, puzzleId: string): Promise<void> {
  await api.rest("rpc/mod_hide_puzzle", { body: { puzzle: puzzleId } });
}

export async function releaseChain(api: Api, chainId: string): Promise<void> {
  await api.rest("rpc/mod_release_chain", { body: { chain: chainId } });
}

export async function hideChain(api: Api, chainId: string): Promise<void> {
  await api.rest("rpc/mod_hide_chain", { body: { chain: chainId } });
}

export async function setBanned(api: Api, userId: string, ban: boolean): Promise<void> {
  await api.rest("rpc/mod_set_banned", { body: { target: userId, ban } });
}

export async function resetUsername(api: Api, userId: string): Promise<void> {
  await api.rest("rpc/mod_reset_username", { body: { target: userId } });
}
