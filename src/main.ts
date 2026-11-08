import { html, nothing, render } from "lit-html";
import { backend } from "./backend.ts";
import { PASSWORD_MIN, accountErrorText, deleteAccount, fetchProfile, renameUser, usernameAvailable, usernameProblem } from "./core/account.ts";
import type { UsernameProblem } from "./core/account.ts";
import { ApiError, apiErrorText, createApi } from "./core/api.ts";
import type { Api } from "./core/api.ts";
import { SESSION_KEY, createAuth } from "./core/auth.ts";
import type { KeyValueStore, Session } from "./core/auth.ts";
import { DocumentError, loadDocument, shareableDocument } from "./core/document.ts";
import { DEFAULT_FILTER, fetchGalleryPage } from "./core/gallery.ts";
import type { GalleryCursor, GalleryFilter, GalleryItem } from "./core/gallery.ts";
import * as editing from "./core/editor-session.ts";
import type { EditorSession } from "./core/editor-session.ts";
import {
  fetchPublished,
  findByContentKey,
  listOwnPublications,
  publishErrorText,
  publishPuzzle,
  registerPlay,
  updatePublication,
  withdrawPublication,
} from "./core/published.ts";
import type { PublishedPuzzle } from "./core/published.ts";
import {
  fetchModerationQueue,
  hasReportedChain,
  hideChain,
  hidePuzzle,
  releaseChain,
  releasePuzzle,
  reportChain,
  reportPuzzle,
  resetUsername,
  setBanned,
} from "./core/moderation.ts";
import type { ModerationItem } from "./core/moderation.ts";
import * as chains from "./core/chains.ts";
import * as dailies from "./core/daily.ts";
import type { Daily } from "./core/daily.ts";
import type { ChainDraft } from "./core/chains.ts";
import type { ReportReason } from "./core/moderation.ts";
import { applyRating, fetchMyReaction, setLike, setRating } from "./core/reactions.ts";
import { formatRoute, parseRoute, startRouter } from "./core/router.ts";
import type { Route } from "./core/router.ts";
import * as session from "./core/session.ts";
import type { AnyPlaySession } from "./core/session.ts";
import { PUBLISH } from "./core/publish.ts";
import * as scores from "./core/scores.ts";
import { IDLE_TIMER, elapsedMs, isRunning, pauseTimer, resumeTimer, startTimer } from "./core/timer.ts";
import type { LeaderboardModel, LeaderboardViewer } from "./ui/components/leaderboard.ts";
import { decodeDocument, encodeDocument } from "./core/share.ts";
import { copyRecord, memoryStorage, newPuzzleId, openStorage, progressKey, recordSolve } from "./core/storage.ts";
import { createSyncApi, mergeProgress, ownerDecision, readSyncMeta, syncOnce } from "./core/sync.ts";
import type { ProgressRecord, PuzzleRecord, Storage } from "./core/storage.ts";
import { createStore } from "./core/store.ts";
import { imageProblem, imageKey, publishedImageUrl, sniffImageType, toBase64 } from "./core/images.ts";
import type { AnyPuzzleType, ImageSource, PuzzleDocument, PuzzleLang, SolveResult } from "./core/types.ts";
import { contrastProblems, sameTheme } from "./core/puzzle-theme.ts";
import * as themes from "./core/saved-themes.ts";
import type { SavedTheme } from "./core/saved-themes.ts";
import type { PuzzleTheme } from "./core/puzzle-theme.ts";
import { language, t, tn } from "./i18n/t.ts";
import type { MessageKey } from "./i18n/t.ts";
import { examples, examplesIn, registry } from "./puzzles/index.ts";
import type { Example } from "./puzzles/index.ts";
import type { PublishDialogModel } from "./ui/components/publish-dialog.ts";
import type { ShareDialogModel } from "./ui/components/share-dialog.ts";
import { accountView } from "./ui/views/account.ts";
import type { AccountMessage, AccountViewModel, SyncViewModel } from "./ui/views/account.ts";
import { editorView } from "./ui/views/editor.ts";
import { galleryView } from "./ui/views/gallery.ts";
import { chainView } from "./ui/views/chain.ts";
import type { ChainAccess, ChainViewModel } from "./ui/views/chain.ts";
import { chainEditorView } from "./ui/views/chain-editor.ts";
import type { ChainEditorModel } from "./ui/views/chain-editor.ts";
import { moderationView } from "./ui/views/moderation.ts";
import type { DailyPlanModel, ModerationViewModel } from "./ui/views/moderation.ts";
import type { GalleryViewModel } from "./ui/views/gallery.ts";
import { homeView, siteFooter } from "./ui/views/home.ts";
import type { HomeDaily } from "./ui/views/home.ts";
import { imprintView } from "./ui/views/imprint.ts";
import { libraryView } from "./ui/views/library.ts";
import type { LibraryItem } from "./ui/views/library.ts";
import { messageView } from "./ui/views/message.ts";
import { playView } from "./ui/views/play.ts";
import type { PlayLevel, PlayOrigin, PlayStats, PlayViewModel, PublishedInfo } from "./ui/views/play.ts";
import { privacyView } from "./ui/views/privacy.ts";
import { encodeImage } from "./ui/image-encode.ts";
import { buildSheet, tabBar, topNav } from "./ui/components/nav.ts";
import type { NavSection } from "./ui/components/nav.ts";
import { applyTheme, readTheme, setTheme, watchSystemTheme } from "./ui/theme.ts";
import type { ThemeChoice } from "./ui/theme.ts";
import { applyLanguage, readLanguageChoice, storeLanguageChoice, watchSystemLanguage } from "./ui/language.ts";
import type { LanguageChoice } from "./ui/language.ts";
import type { EncodeError } from "./ui/image-encode.ts";

type EditorState = {
  id: string; // library id; a new puzzle is saved under it on its first change
  createdAt: string;
  lang: PuzzleLang; // M28: the UI language for new puzzles and old ones without a language
  theme?: PuzzleTheme; // M29: colors of the board; undefined = default colors
  themeNotice?: MessageKey; // M30: why saving a theme template failed
  type: AnyPuzzleType;
  session: EditorSession<unknown>;
  /** Data the creator solved in test play; compared by reference, so undo can restore "verified". */
  verifiedData: unknown;
};

type GalleryState = GalleryViewModel & { next: GalleryCursor | null };

/** `reload`: the content needs a newer app version, so the page offers to reload. */
type ErrorInfo = { text: MessageKey; action?: { href: string; label: MessageKey }; reload?: boolean };

type AppState = {
  route: Route;
  pending: boolean; // route content is loading (storage, share link)
  error: ErrorInfo | null; // route content could not be loaded
  notice: MessageKey | null; // e.g. saving failed; cleared when navigating
  // The database is held by another app instance: stays on every page until resolved, since nothing loads or saves.
  storageNotice: "storageBlocked" | "storageOutdated" | null;
  play: PlayViewModel | null; // play route or test play from the editor
  editor: EditorState | null; // kept while navigating, so undo history survives test play and back/forward
  share: ShareDialogModel | null;
  publish: PublishDialogModel | null;
  library: LibraryItem[] | null; // null = not loaded yet
  progress: ReadonlyMap<string, ProgressRecord>;
  exampleKeys: ReadonlyMap<string, string>; // example id → progress key
  account: AccountViewModel;
  gallery: GalleryState | null; // gallery route
  newest: GalleryItem[]; // "new in the gallery" on the home page
  moderation: ModerationViewModel | null; // moderation route
  chain: ChainViewModel | null; // the open chain; kept while playing its steps
  chainEditor: ChainEditorModel | null; // kept while navigating, so the draft survives looking up puzzles
  buildSheet: boolean; // type choice for a new puzzle is open
  typeSheet: string | null; // home: type whose levels are shown in a sheet
  theme: ThemeChoice;
  language: LanguageChoice; // M28; the language in effect is language() from i18n/t.ts
  daily: Daily | "loading" | "failed"; // the puzzle of the day (M26), loaded on the home page and #/daily
  dailyDays: readonly string[]; // days whose puzzle was solved on this device (streak when signed out)
  savedThemes: readonly SavedTheme[]; // own theme templates on this device (M30)
};

const SOLVE_LIMITS = { maxNodes: 200_000 };
const SOLVE_DELAY_MS = 250;
const SAVE_DELAY_MS = 400;
const SYNC_DELAY_MS = 3000; // after a local change, so a burst of edits is sent once

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

// Accounts only exist with a configured backend (src/backend.ts).
const browserStore: KeyValueStore = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn("localStorage unavailable", error);
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
  },
};
const auth = backend ? createAuth(backend, { store: browserStore }) : null;
const DAILY_DAYS_KEY = "raetsel-daily-days";
const api = backend && auth ? createApi(backend, { accessToken: auth.accessToken }) : null;

// Before anything is rendered or formatted: texts follow the chosen language from the start.
applyLanguage(readLanguageChoice());

const store = createStore<AppState>({
  route: parseRoute(location.hash),
  pending: false,
  error: null,
  notice: null,
  storageNotice: null,
  play: null,
  editor: null,
  share: null,
  publish: null,
  library: null,
  progress: new Map(),
  exampleKeys: new Map(),
  account: {
    user: auth?.session()?.user ?? null,
    profile: null,
    mode: "signIn",
    busy: false,
    message: null,
    confirmDelete: false,
    publications: null,
    chains: null,
    editingPublication: null,
    confirmWithdraw: null,
    panel: null,
    sync: { status: "off", lastSync: null, error: null, rejected: 0 },
  },
  gallery: null,
  newest: [],
  moderation: null,
  chain: null,
  chainEditor: null,
  buildSheet: false,
  typeSheet: null,
  theme: readTheme(),
  language: readLanguageChoice(),
  daily: "loading",
  dailyDays: dailies.parseLocalDays(browserStore.get(DAILY_DAYS_KEY)),
  savedThemes: [],
});

const storage: Promise<Storage> = openStorage({
  blocked: () => patch({ storageNotice: "storageBlocked" }),
  versionChange: () => patch({ storageNotice: "storageOutdated" }),
})
  .then((opened) => {
    if (store.get().storageNotice === "storageBlocked") patch({ storageNotice: null });
    return opened;
  })
  .catch((error: unknown) => {
    console.warn("IndexedDB unavailable, nothing will be saved", error);
    return memoryStorage();
  });

function patch(change: Partial<AppState>) {
  store.set((state) => ({ ...state, ...change }));
}

/** Async results only apply while their route is still active. */
function isCurrent(route: Route) {
  return store.get().route === route;
}

function now() {
  return new Date().toISOString();
}

// --- Routes ---

function enterRoute(route: Route) {
  flushSave();
  patch({ route, pending: false, error: null, notice: null, play: null, share: null, publish: null, buildSheet: false, typeSheet: null });
  if (route.name !== "account") resetAccountForm();
  switch (route.name) {
    case "home":
      void loadNewest();
      void loadDaily();
      break;
    case "daily":
      void openDaily(route);
      break;
    case "gallery":
      void openGallery(route);
      break;
    case "moderation":
      void openModeration(route);
      break;
    case "account":
      void loadPublications();
      void loadLibrary(); // number of own puzzles
      break;
    case "published":
      void openPublished(route);
      break;
    case "library":
      void loadLibrary();
      break;
    case "play":
      void openPlay(route);
      break;
    case "shared":
      void openShared(route);
      break;
    case "new":
      newEditor(route.type);
      break;
    case "edit":
      void openEditor(route);
      break;
    case "chain":
      void openChain(route);
      break;
    case "chainNew":
      void openChainEditor(route);
      break;
  }
}

function fail(route: Route, error: ErrorInfo) {
  if (isCurrent(route)) patch({ pending: false, error });
}

// --- Play ---

async function openPlay(route: Route & { name: "play" }) {
  const example = exampleById(route.id);
  if (example) return startPlay(route, example.doc, "example");

  patch({ pending: true });
  const record = await (await storage).getPuzzle(route.id);
  if (!isCurrent(route)) return;
  if (!record) return fail(route, { text: "puzzleNotFound" });
  startPlay(route, record.doc, "own", { localId: record.id });
}

async function openShared(route: Route & { name: "shared" }) {
  patch({ pending: true });
  try {
    const doc = await decodeDocument(route.code);
    if (isCurrent(route)) startPlay(route, doc, "shared");
  } catch (error) {
    console.warn(error);
    fail(route, linkError(error));
  }
}

/** Errors that a newer app version fixes (an unknown type, a newer format) offer a reload. */
function linkError(error: unknown): ErrorInfo {
  const text = linkErrorText(error);
  return text === "linkUnknownType" || text === "linkUnsupported" ? { text, reload: true } : { text };
}

function linkErrorText(error: unknown): MessageKey {
  if (!(error instanceof DocumentError)) return "linkInvalid";
  switch (error.code) {
    case "too-large":
      return "linkTooLarge";
    case "unsupported":
      return "linkUnsupported";
    case "unknown-type":
      return "linkUnknownType";
    case "invalid":
      return "linkInvalid";
  }
}

/** An example by id, with its title in the app's language; also one written in another language. */
function exampleById(id: string): Example | undefined {
  return examplesIn(language(), "all").find((e) => e.id === id);
}

/** The examples of the same type and in the same language as `current`, in their order. */
function sameKindExamples(current: Example): Example[] {
  const lang = current.lang ?? language();
  return examplesIn(language(), "all").filter((e) => e.doc.type === current.doc.type && (!e.lang || e.lang === lang));
}

/** All examples of the same type with their progress, for the level list beside the board. */
function exampleLevels(state: AppState, id: string): PlayLevel[] {
  const current = exampleById(id);
  if (!current) return [];
  return sameKindExamples(current)
    .map((e) => ({
      href: formatRoute({ name: "play", id: e.id }),
      title: e.doc.meta.title,
      current: e.id === id,
      solved: state.progress.get(state.exampleKeys.get(e.id) ?? "")?.solved === true,
      minMoves: e.doc.meta.minMoves ?? null,
    }));
}

/** Level position and the following example of the same type. */
function exampleNeighbours(route: Route): Pick<PlayViewModel, "level" | "next"> {
  if (route.name !== "play") return {};
  const current = exampleById(route.id);
  if (!current) return {};
  const own = sameKindExamples(current);
  const index = own.indexOf(current);
  const next = own[index + 1];
  return {
    level: { index: index + 1, total: own.length },
    ...(next ? { next: { href: formatRoute({ name: "play", id: next.id }), title: next.doc.meta.title } } : {}),
  };
}

function startPlay(
  route: Route,
  raw: unknown,
  origin: PlayOrigin,
  extra: Pick<PlayViewModel, "localId" | "published" | "backHref" | "daily"> & { title?: string; images?: ImageSource } = {},
): boolean {
  let loaded: { type: AnyPuzzleType; doc: PuzzleDocument };
  try {
    loaded = loadDocument(raw, registry);
  } catch (error) {
    console.warn(error);
    const info = linkError(error);
    if (origin === "own" && !info.reload) {
      fail(route, { text: "notPlayable", action: { href: `#/edit/${extra.localId}`, label: "edit" } });
    } else {
      fail(route, info);
    }
    return false;
  }
  const { type, doc } = loaded;
  const play: PlayViewModel = {
    title: extra.title ?? doc.meta.title,
    session: session.createSession(type, doc.data),
    showSolved: false,
    origin,
    progressKey: progressKey(doc),
    ...(doc.meta.lang ? { lang: doc.meta.lang } : {}),
    ...(doc.meta.theme ? { theme: doc.meta.theme } : {}),
    images: extra.images ?? localImages,
    minMoves: doc.meta.minMoves ?? null,
    timer: IDLE_TIMER,
  };
  if (origin === "example") Object.assign(play, exampleNeighbours(route));
  if (extra.localId !== undefined) play.localId = extra.localId;
  if (extra.published !== undefined) play.published = extra.published;
  if (extra.backHref !== undefined) play.backHref = extra.backHref;
  if (extra.daily !== undefined) play.daily = extra.daily;
  patch({ pending: false, play });
  return true;
}

async function openPublished(route: Route & { name: "published" }) {
  if (!api) return fail(route, { text: "publishedUnavailable" });
  patch({ pending: true });
  try {
    const puzzle = await fetchPublished(api, route.id);
    if (!isCurrent(route)) return;
    if (!puzzle) return fail(route, { text: "publishedNotFound" });
    const published = publishedInfoOf(puzzle);
    // Back to the gallery with the filter the player came from.
    const gallery = store.get().gallery;
    const backHref = formatRoute({ name: "gallery", filter: gallery?.filter ?? DEFAULT_FILTER });
    const images = publishedImages(puzzle.id);
    if (startPlay(route, puzzle.doc, "published", { title: puzzle.title, published, backHref, images })) {
      countPlayOnce(puzzle.id);
      void loadReaction();
      openLeaderboard();
    }
  } catch (error) {
    console.warn(error);
    fail(route, { text: apiErrorText(error) });
  }
}

function publishedInfoOf(puzzle: PublishedPuzzle): PublishedInfo {
  return {
    id: puzzle.id,
    author: puzzle.author,
    authorId: puzzle.authorId,
    description: puzzle.description,
    hidden: puzzle.hidden,
    likeCount: puzzle.likeCount,
    ratingSum: puzzle.ratingSum,
    ratingCount: puzzle.ratingCount,
    me: null,
    busy: false,
    report: null,
    leaderboard: null,
  };
}

// --- Puzzle of the day (M26) ---

/** Loads today's puzzle for the home card; a loaded one stays visible while reloading. */
async function loadDaily(): Promise<Daily | null> {
  if (!api) return null;
  try {
    const daily = await dailies.fetchDaily(api);
    patch({ daily });
    return daily;
  } catch (error) {
    console.warn("daily", error);
    if (typeof store.get().daily === "string") patch({ daily: "failed" });
    return null;
  }
}

/** #/daily plays today's puzzle in place, with the leaderboard of the day. */
async function openDaily(route: Route & { name: "daily" }) {
  if (!api) return fail(route, { text: "publishedUnavailable" });
  patch({ pending: true });
  try {
    const daily = await loadDaily();
    if (!isCurrent(route)) return;
    if (!daily) return fail(route, { text: "dailyFailed" });
    const puzzle = daily.puzzle ? await fetchPublished(api, daily.puzzle.id) : null;
    if (!isCurrent(route)) return;
    if (!puzzle || puzzle.hidden) return fail(route, { text: "dailyNone", action: { href: "#/gallery", label: "gallery" } });
    const extra = { title: puzzle.title, published: publishedInfoOf(puzzle), images: publishedImages(puzzle.id), daily: { day: daily.day } };
    if (startPlay(route, puzzle.doc, "published", extra)) {
      countPlayOnce(puzzle.id);
      void loadReaction();
      openLeaderboard();
    }
  } catch (error) {
    console.warn("daily", error);
    fail(route, { text: apiErrorText(error) });
  }
}

/** Remembers a solved day on this device (the streak when signed out, and until the server knows). */
function rememberDailyDay(day: string) {
  const days = dailies.addLocalDay(store.get().dailyDays, day);
  if (days === store.get().dailyDays) return;
  patch({ dailyDays: days });
  browserStore.set(DAILY_DAYS_KEY, JSON.stringify(days));
}

/** Streak and solved state of today, combining the server and this device. */
function dailyNow(state: AppState) {
  return typeof state.daily === "string" ? null : { day: state.daily.day, ...dailies.dailyStatus(state.daily, state.dailyDays) };
}

function homeDaily(state: AppState): HomeDaily | null {
  if (!api || state.daily === "failed") return null;
  if (state.daily === "loading") return { status: "loading" };
  const now = dailyNow(state)!;
  return state.daily.puzzle ? { status: "ready", puzzle: state.daily.puzzle, solved: now.solved, streak: now.streak } : { status: "none" };
}

// --- Likes and ratings ---

function setPublished(change: Partial<PublishedInfo>, id: string) {
  store.set((state) => {
    const published = state.play?.published;
    if (!state.play || published?.id !== id) return state; // the player moved on
    return { ...state, play: { ...state.play, published: { ...published, ...change } } };
  });
}

/** Loads the own like and rating of the open puzzle, if signed in. */
async function loadReaction() {
  const { play, account } = store.get();
  const published = play?.published;
  if (!api || !published || !account.user) return;
  try {
    setPublished({ me: await fetchMyReaction(api, account.user.id, published.id) }, published.id);
  } catch (error) {
    console.warn("reactions", error);
  }
}

function reactionAccess(published: PublishedInfo, user: { id: string } | null): NonNullable<PublishedInfo["access"]> {
  if (published.hidden) return "hidden";
  if (!user) return "signed-out";
  if (published.authorId === user.id) return "own";
  return published.me === null ? "loading" : "yes";
}

/** Runs a like or rating change optimistically; reverts and shows a notice if the server refuses. */
async function react(change: (p: PublishedInfo) => Partial<PublishedInfo>, send: (p: PublishedInfo, userId: string) => Promise<void>) {
  const { play, account } = store.get();
  const published = play?.published;
  if (!api || !published || !account.user || published.busy || reactionAccess(published, account.user) !== "yes") return;
  setPublished({ ...change(published), busy: true }, published.id);
  try {
    await send(published, account.user.id);
    setPublished({ busy: false }, published.id);
  } catch (error) {
    console.warn("reactions", error);
    setPublished({ ...published, busy: false }, published.id);
    patch({ notice: apiErrorText(error) });
  }
}

function toggleLike() {
  void react(
    (p) => ({ me: { ...p.me!, liked: !p.me!.liked }, likeCount: p.likeCount + (p.me!.liked ? -1 : 1) }),
    (p, userId) => setLike(api!, userId, p.id, !p.me!.liked),
  );
}

function rate(value: number) {
  void react(
    (p) => ({ me: { ...p.me!, rating: value }, ...applyRating(p, p.me!.rating, value) }),
    (p, userId) => (p.me!.rating === value ? Promise.resolve() : setRating(api!, userId, p.id, value, p.me!.rating !== null)),
  );
}

// --- Reports ---

function openReport() {
  const published = store.get().play?.published;
  if (published && !published.me?.reported) setPublished({ report: { state: "form", error: null } }, published.id);
}

async function sendReport(reason: ReportReason, comment: string) {
  const { play, account } = store.get();
  const published = play?.published;
  if (!api || !published?.report || !published.me || !account.user || published.report.state !== "form") return;
  setPublished({ report: { state: "busy", error: null } }, published.id);
  try {
    await reportPuzzle(api, account.user.id, published.id, reason, comment);
    setPublished({ report: { state: "done", error: null }, me: { ...published.me, reported: true } }, published.id);
  } catch (error) {
    console.warn("report", error);
    const already = error instanceof ApiError && error.kind === "conflict";
    setPublished({ report: { state: "form", error: already ? "reportAlready" : apiErrorText(error) } }, published.id);
  }
}

const reportActions = {
  send: (reason: ReportReason, comment: string) => void sendReport(reason, comment),
  close: () => {
    const published = store.get().play?.published;
    if (published) setPublished({ report: null }, published.id);
  },
};

// --- Moderation ---

function setModeration(change: Partial<ModerationViewModel>) {
  store.set((state) => (state.moderation ? { ...state, moderation: { ...state.moderation, ...change } } : state));
}

async function openModeration(route: Route & { name: "moderation" }) {
  if (!api) return fail(route, { text: "accountUnavailable" });
  const plan: DailyPlanModel = { status: "loading", days: [], busy: false, message: null };
  patch({ moderation: { status: "loading", items: [], message: null, busy: false, confirmDelete: null, plan } });
  const { account } = store.get();
  if (account.user && !account.profile) await loadProfile(account.user.id);
  if (!isCurrent(route) || !store.get().account.profile?.isModerator) return;
  await Promise.all([loadModerationQueue(), loadDailyPlan()]);
}

// Puzzle of the day (M26): moderators plan today and the next 14 days.

function setPlan(change: Partial<DailyPlanModel>) {
  store.set((state) => (state.moderation ? { ...state, moderation: { ...state.moderation, plan: { ...state.moderation.plan, ...change } } } : state));
}

async function loadDailyPlan() {
  try {
    setPlan({ status: "idle", days: await dailies.fetchDailyPlan(api!) });
  } catch (error) {
    console.warn("daily plan", error);
    setPlan({ status: "error", message: { tone: "error", text: apiErrorText(error) } });
  }
}

/** Runs one planning action, then reloads the plan. */
async function planTask(action: () => Promise<void>): Promise<boolean> {
  if (!api || store.get().moderation?.plan.busy) return false;
  setPlan({ busy: true, message: null });
  try {
    await action();
    await loadDailyPlan();
    setPlan({ busy: false, message: { tone: "ok", text: "moderationDone" } });
    return true;
  } catch (error) {
    console.warn("daily plan", error);
    setPlan({ busy: false, message: { tone: "error", text: dailies.planErrorText(error) } });
    return false;
  }
}

async function loadModerationQueue() {
  try {
    setModeration({ status: "idle", items: await fetchModerationQueue(api!) });
  } catch (error) {
    console.warn("moderation", error);
    setModeration({ status: "error", message: { tone: "error", text: apiErrorText(error) } });
  }
}

/** Runs one moderator action, then reloads the queue. */
async function moderate(action: () => Promise<void>) {
  if (!api || store.get().moderation?.busy) return;
  setModeration({ busy: true, message: null, confirmDelete: null });
  try {
    await action();
    await loadModerationQueue();
    setModeration({ busy: false, message: { tone: "ok", text: "moderationDone" } });
  } catch (error) {
    console.warn("moderation", error);
    setModeration({ busy: false, message: { tone: "error", text: apiErrorText(error) } });
  }
}

const moderationActions = {
  release: (item: ModerationItem) =>
    void moderate(() => (item.kind === "chain" ? releaseChain(api!, item.id) : releasePuzzle(api!, item.id))),
  hide: (item: ModerationItem) => void moderate(() => (item.kind === "chain" ? hideChain(api!, item.id) : hidePuzzle(api!, item.id))),
  askDelete: (id: string | null) => setModeration({ confirmDelete: id, message: null }),
  remove: (item: ModerationItem) =>
    void moderate(() => (item.kind === "chain" ? chains.withdrawChain(api!, item.id) : withdrawPublication(api!, item.id))),
  setBanned: (userId: string, ban: boolean) => void moderate(() => setBanned(api!, userId, ban)),
  resetName: (userId: string) => void moderate(() => resetUsername(api!, userId)),
  clearScores: (userId: string) => void moderate(() => scores.clearScores(api!, userId)),
  imageUrl: (puzzleId: string, key: string) => (backend ? publishedImageUrl(backend.url, puzzleId, key) : null),
  planDaily: async (day: string, link: string) => {
    const id = chains.puzzleIdFromLink(link);
    if (!id) {
      setPlan({ message: { tone: "error", text: "chainLinkInvalid" } });
      return false;
    }
    return planTask(() => dailies.planDaily(api!, day, id));
  },
  unplanDaily: (day: string) => void planTask(() => dailies.unplanDaily(api!, day)),
};

// Plays are counted once per device and puzzle; the ids are remembered in localStorage.
const PLAYS_KEY = "raetsel-plays";
const MAX_REMEMBERED_PLAYS = 500;

/** Puzzle and chain ids share the list; uuids do not collide. */
function countPlayOnce(id: string, register: (api: Api, id: string) => Promise<void> = registerPlay) {
  let ids: unknown;
  try {
    ids = JSON.parse(browserStore.get(PLAYS_KEY) ?? "[]");
  } catch {
    ids = [];
  }
  const played = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  if (played.includes(id)) return;
  browserStore.set(PLAYS_KEY, JSON.stringify([...played, id].slice(-MAX_REMEMBERED_PLAYS)));
  register(api!, id).catch((error: unknown) => console.warn("play counter", error));
}

/** `restart`: a new attempt, so the time starts again with the next move. */
function updateSession(change: (s: AnyPlaySession) => AnyPlaySession, options: { restart?: boolean } = {}) {
  const state = store.get();
  if (!state.play) return;
  const prev = state.play.session;
  const next = change(prev);
  if (next === prev) return;

  const justSolved = next.solved && !prev.solved;
  // The dialog appears when the puzzle becomes solved and stays until dismissed or unsolved.
  const showSolved = next.solved && (state.play.showSolved || !prev.solved);
  const play = { ...state.play, session: next, showSolved, timer: nextTimer(state.play.timer, prev, next, options.restart === true) };
  ensureTicking(play.timer);

  if (justSolved && play.origin === "test" && state.editor) {
    patch({ play, editor: { ...state.editor, verifiedData: next.data } });
    editorChanged();
    return;
  }
  if (justSolved && play.progressKey !== null) {
    const timeMs = solveTime(play.timer);
    const record = recordSolve(state.progress.get(play.progressKey), play.progressKey, session.moveCount(next), timeMs);
    patch({ play, progress: new Map(state.progress).set(record.key, record) });
    void save(async (s) => s.putProgress(record));
    if (play.daily) rememberDailyDay(play.daily.day);
    if (play.published?.leaderboard) void submitResult(play.published.id, session.path(next), timeMs, play.daily?.day);
    return;
  }
  patch({ play });
}

// --- Play time (M25) ---

/** Runs from the first move until solved; restarting starts a new attempt, undoing a solution continues it. */
function nextTimer(timer: PlayViewModel["timer"], prev: AnyPlaySession, next: AnyPlaySession, restart: boolean) {
  const at = performance.now();
  if (restart) return IDLE_TIMER;
  if (next.solved) return pauseTimer(startTimer(timer, at), at);
  if (prev.solved) return resumeTimer(timer, at);
  return document.visibilityState === "hidden" ? timer : startTimer(timer, at);
}

/** Whole milliseconds, at least 1 (a one-move puzzle can be solved within the same millisecond). */
function solveTime(timer: PlayViewModel["timer"]) {
  return Math.max(1, Math.round(elapsedMs(timer, performance.now())));
}

// While the time runs, the page renders once a second, so the "time" tile counts up.
let tick: ReturnType<typeof setInterval> | undefined;
function ensureTicking(timer: PlayViewModel["timer"]) {
  if (isRunning(timer) && tick === undefined) {
    tick = setInterval(() => {
      const play = store.get().play;
      if (!play || !isRunning(play.timer)) {
        clearInterval(tick);
        tick = undefined;
        return;
      }
      scheduleRender();
    }, 1000);
  }
}

/** The time pauses while the page is hidden (other tab, app in the background, screen off). */
function onVisibility() {
  store.set((state) => {
    if (!state.play) return state;
    const at = performance.now();
    const timer =
      document.visibilityState === "hidden" ? pauseTimer(state.play.timer, at) : state.play.session.solved ? state.play.timer : resumeTimer(state.play.timer, at);
    return timer === state.play.timer ? state : { ...state, play: { ...state.play, timer } };
  });
  const play = store.get().play;
  if (play) ensureTicking(play.timer);
}

// --- Leaderboards (M25) ---

function setLeaderboard(change: Partial<LeaderboardModel>, puzzleId: string) {
  store.set((state) => {
    const published = state.play?.published;
    if (!state.play || published?.id !== puzzleId || !published.leaderboard) return state;
    return { ...state, play: { ...state.play, published: { ...published, leaderboard: { ...published.leaderboard, ...change } } } };
  });
}

/** After a published puzzle was opened: a leaderboard if its type has one; the day's one for the puzzle of the day. */
function openLeaderboard() {
  const play = store.get().play;
  const ranking = play?.session.type.ranking;
  if (!play?.published || !ranking) return;
  const leaderboard: LeaderboardModel = {
    ranking,
    day: play.daily?.day ?? null,
    board: null,
    error: null,
    submit: { status: "idle" },
    confirmClear: null,
    busy: false,
  };
  setPublished({ leaderboard }, play.published.id);
  void loadLeaderboard(play.published.id);
}

/** (Re)loads the leaderboard shown for the open puzzle. */
async function loadLeaderboard(puzzleId: string) {
  const published = store.get().play?.published;
  if (!api || published?.id !== puzzleId || !published.leaderboard) return;
  const { day } = published.leaderboard;
  try {
    const board = day ? await dailies.fetchDailyLeaderboard(api, day) : await scores.fetchLeaderboard(api, puzzleId);
    setLeaderboard({ board, error: null }, puzzleId);
  } catch (error) {
    console.warn("leaderboard", error);
    setLeaderboard({ error: apiErrorText(error) }, puzzleId);
  }
}

function leaderboardViewer(published: PublishedInfo, state: AppState): LeaderboardViewer {
  const { user, profile } = state.account;
  if (!user) return "signed-out";
  if (published.authorId === user.id) return "own";
  return profile?.isModerator ? "moderator" : "player";
}

/**
 * Sends a solution of the open puzzle; offline it waits in the queue. Signed out and own puzzles only get a hint;
 * the author's solution of the puzzle of the day is still sent, for the streak.
 */
async function submitResult(puzzleId: string, moves: unknown[], timeMs: number, daily: string | undefined) {
  const state = store.get();
  const published = state.play?.published;
  const user = state.account.user;
  if (!api || !published || !user || (published.authorId === user.id && !daily)) return;
  const request: scores.ScoreRequest = { puzzle: puzzleId, moves, timeMs };
  if (daily) request.daily = daily;
  setLeaderboard({ submit: { status: "sending" } }, puzzleId);
  try {
    const result = await scores.submitScore(api, request);
    setLeaderboard({ submit: submitDone(result) }, puzzleId);
    await loadLeaderboard(puzzleId);
  } catch (error) {
    console.warn("submit score", error);
    if (scores.isRetryable(error)) {
      writeQueue(scores.enqueue(readQueue(), { ...request, userId: user.id }));
      setLeaderboard({ submit: { status: "queued" } }, puzzleId);
    } else {
      setLeaderboard({ submit: { status: "error", text: scores.scoreErrorText(error) } }, puzzleId);
    }
  }
}

// Results solved offline wait in localStorage and are sent on start, when the connection returns and after signing in.
const SCORE_QUEUE_KEY = "raetsel-score-queue";

function readQueue() {
  return scores.parseQueue(browserStore.get(SCORE_QUEUE_KEY));
}

function writeQueue(queue: scores.PendingScore[]) {
  if (queue.length === 0) browserStore.remove(SCORE_QUEUE_KEY);
  else browserStore.set(SCORE_QUEUE_KEY, JSON.stringify(queue));
}

function submitDone(result: scores.ScoreResult): LeaderboardModel["submit"] {
  return result.daily ? { status: "done", improved: result.improved, daily: result.daily } : { status: "done", improved: result.improved };
}

let flushing = false;
async function flushScoreQueue() {
  const user = store.get().account.user;
  if (!api || !user || flushing) return;
  flushing = true;
  try {
    for (const item of readQueue().filter((q) => q.userId === user.id)) {
      let result: scores.ScoreResult = { improved: false };
      try {
        const { userId: _, ...request } = item;
        result = await scores.submitScore(api, request);
      } catch (error) {
        if (scores.isRetryable(error)) return; // still offline: try again later
        console.warn("queued score refused", error); // dropped, like a refused direct submission
      }
      const sent = JSON.stringify(item);
      writeQueue(readQueue().filter((q) => JSON.stringify(q) !== sent));
      const published = store.get().play?.published;
      if (published?.id === item.puzzle && published.leaderboard) {
        if (published.leaderboard.submit.status === "queued") setLeaderboard({ submit: submitDone(result) }, item.puzzle);
        void loadLeaderboard(item.puzzle);
      }
    }
  } finally {
    flushing = false;
  }
}

const leaderboardActions = {
  askClear: (userId: string | null) => {
    const id = store.get().play?.published?.id;
    if (id) setLeaderboard({ confirmClear: userId }, id);
  },
  clear: async (userId: string) => {
    const id = store.get().play?.published?.id;
    if (!api || !id) return;
    setLeaderboard({ busy: true }, id);
    try {
      await scores.clearScores(api, userId);
      setLeaderboard({ busy: false, confirmClear: null }, id);
      await loadLeaderboard(id);
    } catch (error) {
      console.warn("clear scores", error);
      setLeaderboard({ busy: false, confirmClear: null, error: apiErrorText(error) }, id);
    }
  },
};

const playActions = {
  dispatch: (move: unknown) => updateSession((s) => session.dispatch(s, move)),
  undo: () => updateSession(session.undo),
  redo: () => updateSession(session.redo),
  restart: () => updateSession(session.restart, { restart: true }),
  dismissSolved: () =>
    store.set((state) =>
      state.play?.showSolved ? { ...state, play: { ...state.play, showSolved: false } } : state,
    ),
  backToEditor: () => patch({ play: null }),
  toggleLike,
  rate,
  openReport,
  report: reportActions,
  leaderboard: leaderboardActions,
  // Remixing: the copy is a new, unverified draft of the creator.
  copyToLibrary: async () => {
    const play = store.get().play;
    if (!play) return;
    const { type, data } = play.session;
    if (play.published) await downloadImages(play.published.id, type.imageKeys?.(data) ?? []);
    const record: PuzzleRecord = {
      id: newPuzzleId(),
      doc: { format: 1, type: type.id, typeVersion: type.version, meta: { title: play.title, createdAt: now(), lang: play.lang ?? language(), ...(play.theme ? { theme: play.theme } : {}) }, data },
      updatedAt: now(),
    };
    if (await save((s) => s.putPuzzle(record))) location.hash = formatRoute({ name: "edit", id: record.id });
  },
};

// --- Gallery ---

const NEWEST_ON_HOME = 4;

async function loadNewest() {
  if (!api) return;
  try {
    const { items } = await fetchGalleryPage(api, DEFAULT_FILTER, null, NEWEST_ON_HOME);
    patch({ newest: items });
  } catch (error) {
    console.warn("gallery", error); // the home page then only links to the gallery
  }
}

async function openGallery(route: Route & { name: "gallery" }) {
  if (!api) return fail(route, { text: "galleryUnavailable" });
  const keep = store.get().gallery;
  // Back from a puzzle to the same filter: keep what was loaded instead of starting over.
  if (keep && keep.status !== "error" && JSON.stringify(keep.filter) === JSON.stringify(route.filter)) return;
  patch({
    gallery: { filter: route.filter, items: [], chains: [], status: "loading", error: null, hasMore: false, announcement: "", next: null },
  });
  await loadGalleryPage(route);
}

async function loadGalleryPage(route: Route & { name: "gallery" }) {
  const gallery = store.get().gallery;
  if (!api || !gallery) return;
  const more = gallery.items.length + gallery.chains.length > 0;
  patch({ gallery: { ...gallery, status: more ? "loading-more" : "loading", error: null, announcement: "" } });
  try {
    const page =
      route.filter.view === "chains"
        ? { chains: await chains.fetchChainPage(api, route.filter.sort, gallery.next) }
        : { puzzles: await fetchGalleryPage(api, route.filter, gallery.next) };
    if (!isCurrent(route)) return;
    const next = page.chains?.next ?? page.puzzles?.next ?? null;
    const count = page.chains?.items.length ?? page.puzzles?.items.length ?? 0;
    patch({
      gallery: {
        ...gallery,
        items: [...gallery.items, ...(page.puzzles?.items ?? [])],
        chains: [...gallery.chains, ...(page.chains?.items ?? [])],
        next,
        hasMore: next !== null,
        status: "idle",
        error: null,
        announcement: more ? tn(route.filter.view === "chains" ? "galleryChainsLoaded" : "galleryLoaded", count) : "",
      },
    });
  } catch (error) {
    console.warn("gallery", error);
    if (isCurrent(route)) patch({ gallery: { ...gallery, status: "error", error: apiErrorText(error) } });
  }
}

function currentGalleryRoute() {
  const { route } = store.get();
  return route.name === "gallery" ? route : null;
}

const galleryActions = {
  // Filters are part of the route; replace, so the back button leaves the gallery instead of undoing filters.
  setFilter: (filter: GalleryFilter) => location.replace(formatRoute({ name: "gallery", filter })),
  loadMore: () => {
    const route = currentGalleryRoute();
    if (route && store.get().gallery?.status === "idle") void loadGalleryPage(route);
  },
  retry: () => {
    const route = currentGalleryRoute();
    if (route) void loadGalleryPage(route);
  },
};

function isSolved(contentKey: string) {
  return store.get().progress.get(contentKey)?.solved === true;
}

// --- Chains ---

/** Shown on the overview after a locked step was opened; set before redirecting, read when the overview loads. */
let chainNotice: MessageKey | null = null;

function chainOverview(id: string) {
  return formatRoute({ name: "chain", id, step: null });
}

/** Back from a chain to the chain gallery with the filter the player came from. */
function chainBackHref() {
  const filter = store.get().gallery?.filter;
  return formatRoute({ name: "gallery", filter: filter?.view === "chains" ? filter : { ...DEFAULT_FILTER, view: "chains" } });
}

function progressOf(model: ChainViewModel) {
  return chains.chainProgress(model.chain.steps, (step) => model.puzzles.has(step.puzzle), isSolved);
}

function setChain(change: Partial<ChainViewModel>, id: string) {
  store.set((state) => (state.chain?.chain.id === id ? { ...state, chain: { ...state.chain, ...change } } : state));
}

/** The chain with its puzzles; the overview always reloads, steps reuse what the overview loaded. */
async function loadChain(id: string, reuse: boolean): Promise<ChainViewModel | null> {
  const cached = store.get().chain;
  if (reuse && cached?.chain.id === id) return cached;
  const chain = await chains.fetchChain(api!, id);
  if (!chain) return null;
  const puzzles = await chains.fetchStepPuzzles(api!, chain.steps.map((s) => s.puzzle));
  const keep = cached?.chain.id === id ? cached : null;
  const model: ChainViewModel = { chain, puzzles, reported: keep?.reported ?? null, report: null, notice: null };
  patch({ chain: model });
  return model;
}

async function openChain(route: Route & { name: "chain" }) {
  if (!api) return fail(route, { text: "chainUnavailable" });
  // Steps always load their puzzle; the overview shows a loaded chain right away while reloading it.
  if (route.step !== null || store.get().chain?.chain.id !== route.id) patch({ pending: true });
  try {
    const model = await loadChain(route.id, route.step !== null);
    if (!isCurrent(route)) return;
    if (!model) return fail(route, { text: "chainNotFound" });
    if (route.step === null) {
      patch({ pending: false });
      setChain({ notice: chainNotice }, route.id);
      chainNotice = null;
      countPlayOnce(route.id, chains.registerChainPlay);
      void loadChainReport();
      return;
    }
    await openChainStep(route, model);
  } catch (error) {
    console.warn("chain", error);
    fail(route, { text: apiErrorText(error) });
  }
}

/** Plays step `route.step` like a published puzzle; locked or unavailable steps lead back to the overview. */
async function openChainStep(route: Route & { name: "chain" }, model: ChainViewModel) {
  const index = route.step! - 1;
  const progress = progressOf(model);
  const step = model.chain.steps[index];
  const back = () => {
    chainNotice = step && progress.states[index] === "locked" ? "chainLockedRedirect" : null;
    location.replace(chainOverview(route.id));
  };
  if (!step || !chains.isUnlocked(progress, index)) return back();
  const puzzle = await fetchPublished(api!, step.puzzle);
  if (!isCurrent(route)) return;
  if (!puzzle || puzzle.hidden) return back();
  const published = publishedInfoOf(puzzle);
  const extra = { title: puzzle.title, published, backHref: chainOverview(route.id), images: publishedImages(puzzle.id) };
  if (!startPlay(route, puzzle.doc, "published", extra)) return;
  // After solving: the next available step, or the closing screen on the overview.
  const following = model.chain.steps.findIndex((s, i) => i > index && model.puzzles.has(s.puzzle));
  const next =
    following === -1
      ? { href: chainOverview(route.id), title: model.chain.title, label: t("chainFinale") }
      : {
          href: formatRoute({ name: "chain", id: route.id, step: following + 1 }),
          title: model.puzzles.get(model.chain.steps[following]!.puzzle)!.title,
          label: t("chainNextStep", { index: following + 1 }),
        };
  store.set((state) =>
    state.play
      ? { ...state, play: { ...state.play, level: { index: index + 1, total: model.chain.steps.length }, next, chain: { story: step.text } } }
      : state,
  );
  countPlayOnce(puzzle.id);
  void loadReaction();
  openLeaderboard();
}

function chainAccess(model: ChainViewModel, user: { id: string } | null): ChainAccess {
  if (model.chain.hidden) return "hidden";
  if (!user) return "signed-out";
  if (model.chain.authorId === user.id) return "own";
  return model.reported === null ? "loading" : "yes";
}

async function loadChainReport() {
  const { chain, account } = store.get();
  if (!api || !chain || !account.user || chain.reported !== null) return;
  try {
    setChain({ reported: await hasReportedChain(api, account.user.id, chain.chain.id) }, chain.chain.id);
  } catch (error) {
    console.warn("chain report", error);
  }
}

async function sendChainReport(reason: ReportReason, comment: string) {
  const { chain, account } = store.get();
  if (!api || !chain?.report || !account.user || chain.report.state !== "form") return;
  const id = chain.chain.id;
  setChain({ report: { state: "busy", error: null } }, id);
  try {
    await reportChain(api, account.user.id, id, reason, comment);
    setChain({ report: { state: "done", error: null }, reported: true }, id);
  } catch (error) {
    console.warn("chain report", error);
    const already = error instanceof ApiError && error.kind === "conflict";
    setChain({ report: { state: "form", error: already ? "chainReportAlready" : apiErrorText(error) } }, id);
  }
}

const chainActions = {
  openReport: () => {
    const chain = store.get().chain;
    if (chain && chain.reported === false) setChain({ report: { state: "form", error: null } }, chain.chain.id);
  },
  report: {
    send: (reason: ReportReason, comment: string) => void sendChainReport(reason, comment),
    close: () => {
      const chain = store.get().chain;
      if (chain) setChain({ report: null }, chain.chain.id);
    },
  },
};

// --- Chain editor ---

function setChainEditor(change: Partial<ChainEditorModel>) {
  store.set((state) => (state.chainEditor ? { ...state, chainEditor: { ...state.chainEditor, ...change } } : state));
}

function editDraft(change: (draft: ChainDraft) => ChainDraft) {
  store.set((state) =>
    state.chainEditor ? { ...state, chainEditor: { ...state.chainEditor, draft: change(state.chainEditor.draft), error: null } } : state,
  );
}

async function openChainEditor(route: Route & { name: "chainNew" }) {
  if (!api) return fail(route, { text: "chainUnavailable" });
  const userId = store.get().account.user?.id;
  if (!userId) return;
  if (!store.get().chainEditor) {
    patch({ chainEditor: { draft: chains.EMPTY_DRAFT, own: null, checking: false, addError: null, publishing: false, error: null } });
  }
  try {
    const own = (await listOwnPublications(api, userId)).filter((p) => !p.hidden);
    setChainEditor({ own: own.map((p) => ({ id: p.id, title: p.title, type: p.type })) });
  } catch (error) {
    console.warn("chain editor", error);
    setChainEditor({ own: [], addError: apiErrorText(error) });
  }
}

const ADD_TEXT: Record<chains.AddStepProblem, MessageKey> = { duplicate: "chainAlreadyAdded", full: "chainFull" };

function addDraftStep(step: chains.DraftStep): boolean {
  const editor = store.get().chainEditor;
  if (!editor) return false;
  const result = chains.addStep(editor.draft, step);
  if (typeof result === "string") {
    setChainEditor({ addError: ADD_TEXT[result] });
    return false;
  }
  setChainEditor({ draft: result, addError: null, error: null });
  return true;
}

const chainEditorActions = {
  setField: (field: "title" | "description" | "outro", value: string) => editDraft((d) => ({ ...d, [field]: value })),
  setStepText: (index: number, text: string) => editDraft((d) => chains.setStepText(d, index, text)),
  move: (index: number, delta: -1 | 1) => editDraft((d) => chains.moveStep(d, index, delta)),
  remove: (index: number) => editDraft((d) => chains.removeStep(d, index)),
  addOwn: (puzzleId: string) => {
    const own = store.get().chainEditor?.own?.find((p) => p.id === puzzleId);
    if (own) addDraftStep({ puzzle: own.id, title: own.title, type: own.type, text: "" });
  },
  addLink: async (text: string): Promise<boolean> => {
    const editor = store.get().chainEditor;
    if (!api || !editor || editor.checking) return false;
    const id = chains.puzzleIdFromLink(text);
    if (!id) {
      setChainEditor({ addError: "chainLinkInvalid" });
      return false;
    }
    if (editor.draft.steps.some((s) => s.puzzle === id)) {
      setChainEditor({ addError: "chainAlreadyAdded" });
      return false;
    }
    setChainEditor({ checking: true, addError: null });
    try {
      const puzzle = (await chains.fetchStepPuzzles(api, [id])).get(id);
      setChainEditor({ checking: false });
      if (!puzzle) {
        setChainEditor({ addError: "chainLinkNotFound" });
        return false;
      }
      return addDraftStep({ puzzle: id, title: puzzle.title, type: puzzle.type, text: "" });
    } catch (error) {
      console.warn("chain editor", error);
      setChainEditor({ checking: false, addError: apiErrorText(error) });
      return false;
    }
  },
  publish: async () => {
    const editor = store.get().chainEditor;
    if (!api || !editor || editor.publishing) return;
    const problem = chains.draftProblem(editor.draft);
    if (problem) return setChainEditor({ error: problem });
    setChainEditor({ publishing: true, error: null });
    try {
      const id = await chains.publishChain(api, editor.draft);
      patch({ chainEditor: null });
      location.hash = chainOverview(id);
    } catch (error) {
      console.warn("publish chain", error);
      setChainEditor({ publishing: false, error: chains.chainErrorText(error) });
    }
  },
};

// --- Editor ---

function newEditor(typeId: string) {
  const type = registry.get(typeId);
  if (!type) return patch({ error: { text: "unknownType" } });
  const editor: EditorState = {
    id: newPuzzleId(),
    createdAt: now(),
    lang: language(),
    type,
    session: editing.createEditorSession(type.createDefault(), t("untitled")),
    verifiedData: undefined,
  };
  patch({ editor });
  scheduleSolve();
}

async function openEditor(route: Route & { name: "edit" }) {
  if (store.get().editor?.id === route.id) return scheduleSolve();

  patch({ pending: true });
  const record = await (await storage).getPuzzle(route.id);
  if (!isCurrent(route)) return;
  if (!record) return fail(route, { text: "puzzleNotFound" });
  try {
    const { type, doc } = loadDocument(record.doc, registry, { draft: true });
    const editor: EditorState = {
      id: record.id,
      createdAt: doc.meta.createdAt,
      lang: doc.meta.lang ?? language(),
      ...(doc.meta.theme ? { theme: doc.meta.theme } : {}),
      type,
      session: editing.createEditorSession(doc.data, doc.meta.title),
      verifiedData: doc.meta.verified ? doc.data : undefined,
    };
    patch({ pending: false, editor });
    scheduleSolve();
  } catch (error) {
    console.warn(error);
    fail(route, { text: "puzzleBroken" });
  }
}

function updateEditor(change: (s: EditorSession<unknown>) => EditorSession<unknown>) {
  const editor = store.get().editor;
  if (!editor) return;
  const next = change(editor.session);
  if (next === editor.session) return;
  patch({ editor: { ...editor, session: next } });
  editorChanged();
  scheduleSolve();
}

function isVerified(editor: EditorState) {
  return editor.verifiedData !== undefined && editor.verifiedData === editing.currentData(editor.session);
}

function editorDocument(editor: EditorState): PuzzleDocument {
  return editing.toDocument(editor.session, {
    type: editor.type.id,
    typeVersion: editor.type.version,
    createdAt: editor.createdAt,
    lang: editor.lang,
    ...(editor.theme ? { theme: editor.theme } : {}),
    verified: isVerified(editor),
    solve: cachedSolve(editing.currentData(editor.session)),
  });
}

function problemsOf(type: AnyPuzzleType, data: unknown): string[] {
  if (type.problems) return type.problems(data);
  try {
    type.validate(data);
    return [];
  } catch (error) {
    return [String(error)];
  }
}

function editorCheck(editor: EditorState) {
  const data = editing.currentData(editor.session);
  return {
    problems: problemsOf(editor.type, data),
    hasSolver: editor.type.solve !== undefined,
    solve: cachedSolve(data),
    verified: isVerified(editor),
  };
}

function minMovesOf(solve: SolveResult<unknown> | null): number | null {
  return solve?.status === "solved" ? solve.moves.length : null;
}

// Solver results per data object; undo/redo hits the cache.
const solveCache = new WeakMap<object, SolveResult<unknown>>();
let solveTimer: ReturnType<typeof setTimeout> | undefined;

function cachedSolve(data: unknown): SolveResult<unknown> | null {
  return typeof data === "object" && data !== null ? (solveCache.get(data) ?? null) : null;
}

// Runs the solver shortly after the last edit, so fast tapping stays smooth.
function scheduleSolve() {
  clearTimeout(solveTimer);
  solveTimer = setTimeout(() => {
    const editor = store.get().editor;
    if (!editor?.type.solve) return;
    const data = editing.currentData(editor.session);
    if (typeof data !== "object" || data === null || solveCache.has(data)) return;
    if (problemsOf(editor.type, data).length > 0) return;
    solveCache.set(data, editor.type.solve(data, SOLVE_LIMITS));
    store.set((state) => ({ ...state })); // re-render with the new result
  }, SOLVE_DELAY_MS);
}

// --- Saving ---

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = ""; // JSON of the last saved editor document, to skip identical writes

/** Runs a storage write; shows a notice if it fails. */
async function save(write: (s: Storage) => Promise<void>): Promise<boolean> {
  try {
    await write(await storage);
    requestSync(SYNC_DELAY_MS);
    return true;
  } catch (error) {
    console.error(error);
    patch({ notice: "storageFailed" });
    return false;
  }
}

/** Called after every change by the creator. A new puzzle becomes a library entry here. */
function editorChanged() {
  const { route, editor } = store.get();
  if (!editor) return;
  if (route.name === "new") {
    const next: Route = { name: "edit", id: editor.id };
    history.replaceState(null, "", formatRoute(next));
    patch({ route: next });
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEditor, SAVE_DELAY_MS);
}

async function saveEditor() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const editor = store.get().editor;
  if (!editor) return;
  const doc = editorDocument(editor);
  const json = JSON.stringify([editor.id, doc]);
  if (json === lastSaved) return;
  lastSaved = json;
  if (!(await save((s) => s.putPuzzle({ id: editor.id, doc, updatedAt: now() })))) lastSaved = "";
}

function flushSave() {
  if (saveTimer !== undefined) void saveEditor();
}

// --- Sharing ---

const shareActions = {
  copied: (ok: boolean) =>
    store.set((state) => (state.share ? { ...state, share: { ...state.share, copy: ok ? "copied" : "failed" } } : state)),
  close: () => patch({ share: null }),
};

async function openShare() {
  const editor = store.get().editor;
  if (!editor || !editing.readiness(editorCheck(editor)).canShare) return;
  let doc: PuzzleDocument;
  try {
    doc = shareableDocument(editorDocument(editor), registry);
  } catch (error) {
    console.warn(error); // problems() let through a puzzle that validate rejects
    return;
  }
  const hasImages = (editor.type.imageKeys?.(doc.data).length ?? 0) > 0;
  const share: ShareDialogModel = { title: doc.meta.title, url: null, copy: "idle", hasImages };
  patch({ share });
  const code = await encodeDocument(doc);
  const url = `${location.origin}${location.pathname}${formatRoute({ name: "shared", code })}`;
  store.set((state) => (state.share === share ? { ...state, share: { ...share, url } } : state));
}

// --- Publishing ---

function publishing(state: AppState): "signed-in" | "signed-out" | null {
  if (!api) return null;
  return state.account.user && state.account.profile ? "signed-in" : "signed-out";
}

function openPublish() {
  const state = store.get();
  const { editor, account } = state;
  if (!editor || !account.profile || publishing(state) !== "signed-in") return;
  if (!editing.readiness(editorCheck(editor)).canShare) return;
  const { themeRoles, themeFixed } = editor.type;
  // The publish function refuses a theme with too little contrast (M30); the share sheet disables the button too.
  if (editor.theme && themeRoles && contrastProblems(editor.theme, { roles: themeRoles, fixed: themeFixed }).length > 0) return;
  patch({
    share: null,
    publish: { title: editor.session.title, author: account.profile.username, state: "confirm", error: null, publishedId: null },
  });
}

function setPublish(change: Partial<PublishDialogModel>) {
  store.set((state) => (state.publish ? { ...state, publish: { ...state.publish, ...change } } : state));
}

async function publish(description: string) {
  const { editor, publish: dialog } = store.get();
  if (!api || !editor || !dialog || dialog.state !== "confirm") return;
  let doc: PuzzleDocument;
  try {
    doc = shareableDocument(editorDocument(editor), registry);
  } catch (error) {
    console.warn(error); // problems() let through a puzzle that validate rejects
    setPublish({ error: publishErrorText(error) });
    return;
  }
  setPublish({ state: "busy", error: null, publishedId: null });
  try {
    const images = await imagesForUpload(editor.type.imageKeys?.(doc.data) ?? []);
    const id = await publishPuzzle(api, { doc, title: doc.meta.title, description, images });
    setPublish({ state: "done", publishedId: id });
    setAccount({ publications: null }); // reload on the account page
  } catch (error) {
    console.warn(error);
    setPublish({ state: "confirm", error: error instanceof InputProblem ? error.text : publishErrorText(error) });
    if (error instanceof ApiError && error.code === "duplicate") {
      // Same key as the server computes: progressKey of the checked document.
      const existing = await findByContentKey(api, progressKey(doc)).catch(() => null);
      if (existing) setPublish({ publishedId: existing });
    }
  }
}

const publishActions = {
  publish: (description: string) => void publish(description),
  close: () => patch({ publish: null }),
};

const editorActions = {
  update: (data: unknown, group?: number) => updateEditor((s) => editing.updateData(s, data, group)),
  undo: () => updateEditor(editing.undoEdit),
  redo: () => updateEditor(editing.redoEdit),
  setTitle: (title: string) => updateEditor((s) => editing.setTitle(s, title)),
  setLanguage: (lang: PuzzleLang) => {
    const editor = store.get().editor;
    if (!editor || editor.lang === lang) return;
    patch({ editor: { ...editor, lang } });
    editorChanged();
  },
  // A theme only changes how the puzzle looks, so the creator's solution stays valid (it is not part of the data).
  setTheme: (theme: PuzzleTheme | undefined) => {
    const editor = store.get().editor;
    if (!editor || sameTheme(editor.theme, theme)) return;
    const { theme: _old, themeNotice: _notice, ...rest } = editor;
    patch({ editor: theme ? { ...rest, theme } : rest });
    editorChanged();
  },
  saveTheme: (name: string) => {
    const editor = store.get().editor;
    if (!editor?.theme) return;
    const result = themes.addSavedTheme(store.get().savedThemes, newPuzzleId(), name, editor.theme);
    finishThemeChange(result);
  },
  renameTheme: (id: string, name: string) => finishThemeChange(themes.renameSavedTheme(store.get().savedThemes, id, name)),
  deleteTheme: (id: string) => finishThemeChange({ list: themes.removeSavedTheme(store.get().savedThemes, id) }),
  testPlay: () => {
    const editor = store.get().editor;
    if (!editor || !editing.readiness(editorCheck(editor)).canTest) return;
    const play: PlayViewModel = {
      title: editor.session.title,
      session: session.createSession(editor.type, editing.currentData(editor.session)),
      showSolved: false,
      origin: "test",
      progressKey: null,
      ...(editor.theme ? { theme: editor.theme } : {}),
      images: localImages,
      minMoves: minMovesOf(cachedSolve(editing.currentData(editor.session))),
      timer: IDLE_TIMER,
    };
    patch({ play });
  },
  backToEditor: () => patch({ play: null }),
  openShare: () => void openShare(),
  share: shareActions,
  openPublish,
  publish: publishActions,
};

// --- Images ---

// Object URLs of local images by key; "loading" while IndexedDB is read, null if missing.
const localImageUrls = new Map<string, string | "loading" | null>();

function rememberImage(key: string, record: { type: string; bytes: Uint8Array } | null) {
  const previous = localImageUrls.get(key);
  if (previous && previous !== "loading") URL.revokeObjectURL(previous);
  localImageUrls.set(key, record ? URL.createObjectURL(new Blob([new Uint8Array(record.bytes)], { type: record.type })) : null);
}

/** Pictures of own puzzles, from IndexedDB. Unknown keys (e.g. from share links) resolve to null. */
const localImages: ImageSource = {
  url(key) {
    const known = localImageUrls.get(key);
    if (known !== undefined) return known;
    localImageUrls.set(key, "loading");
    storage
      .then((s) => s.getImage(key))
      .then((record) => record ?? downloadSyncedImage(key))
      .then((record) => rememberImage(key, record), () => rememberImage(key, null))
      .finally(() => store.set((state) => ({ ...state }))); // re-render with the picture
    return "loading";
  },
};

const ENCODE_TEXT: Record<EncodeError, MessageKey> = { unreadable: "imageUnreadable", "too-large": "imageTooLarge" };

const editorImages = {
  ...localImages,
  /** Scales, encodes and stores a picture; shows the reason and rejects if that fails. */
  async add(file: Blob): Promise<string> {
    try {
      const { type, bytes } = await encodeImage(file);
      const key = imageKey(bytes);
      await (await storage).putImage({ key, type, bytes });
      rememberImage(key, { type, bytes });
      return key;
    } catch (error) {
      console.warn("image", error);
      patch({ notice: typeof error === "string" && error in ENCODE_TEXT ? ENCODE_TEXT[error as EncodeError] : "imageStoreFailed" });
      showNotice();
      throw error;
    }
  },
};

/** The notice sits at the top of the page; bring it into view when it concerns something further down. */
function showNotice() {
  setTimeout(() => document.querySelector(".page-notice")?.scrollIntoView({ behavior: "smooth", block: "center" }));
}

function publishedImages(puzzleId: string): ImageSource {
  return { url: (key) => (backend ? publishedImageUrl(backend.url, puzzleId, key) : null) };
}

/** Base64 bytes of local images for publishing; throws InputProblem if one is missing. */
async function imagesForUpload(keys: string[]): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  for (const key of keys) {
    const record = await (await storage).getImage(key);
    if (!record) throw new InputProblem("publishImageMissing");
    images[key] = toBase64(record.bytes);
  }
  return images;
}

/** Copies the pictures of a published puzzle into IndexedDB, so a library copy keeps them. Best effort. */
async function downloadImages(puzzleId: string, keys: string[]) {
  if (!backend) return;
  for (const key of keys) {
    try {
      const response = await fetch(publishedImageUrl(backend.url, puzzleId, key));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const type = sniffImageType(bytes);
      if (!response.ok || !type || imageProblem(key, bytes)) continue;
      await (await storage).putImage({ key, type, bytes });
      rememberImage(key, { type, bytes });
    } catch (error) {
      console.warn("image download", error);
    }
  }
}

/** Deletes local images no library puzzle uses any more (removed questions, deleted puzzles). */
async function removeUnusedImages(items: readonly LibraryItem[]) {
  const used = new Set(items.flatMap(({ record, type }) => {
    try {
      return type.imageKeys?.(loadDocument(record.doc, registry, { draft: true }).doc.data) ?? [];
    } catch {
      return [];
    }
  }));
  try {
    const s = await storage;
    for (const key of await s.listImageKeys()) {
      if (!used.has(key)) {
        await s.deleteImage(key);
        localImageUrls.delete(key);
      }
    }
  } catch (error) {
    console.warn("image cleanup", error);
  }
}

/** A picture of a synced puzzle that is not on this device yet (M27): loaded when it is first shown. */
async function downloadSyncedImage(key: string) {
  const user = store.get().account.user;
  if (!syncApi || !user || !/^[0-9a-f]{64}$/.test(key)) return null;
  try {
    const bytes = await syncApi.downloadImage(user.id, key);
    const type = sniffImageType(bytes);
    if (!type || imageProblem(key, bytes)) return null;
    const record = { key, type, bytes };
    await (await storage).putImage(record);
    return record;
  } catch (error) {
    // Not found: a picture of a share link or of a puzzle whose pictures were never uploaded.
    if (!(error instanceof ApiError) || error.status >= 500 || error.status === 0) console.warn("synced image", error);
    return null;
  }
}

// --- Sync (M27) ---

const syncApi = api ? createSyncApi(api) : null;
const OWNER_KEY = "owner"; // the account this device's data last synced with
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncRunning = false;
let syncAgain = false;

function setSync(change: Partial<SyncViewModel>) {
  store.set((state) => ({ ...state, account: { ...state.account, sync: { ...state.account.sync, ...change } } }));
}

/** Syncs soon (or right away); several requests in a row lead to one run. */
function requestSync(delayMs = 0) {
  if (!syncApi || !store.get().account.user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void runSync(), delayMs);
}

/** Whether the document can be kept: readable as a draft, or made by a newer app version (shown after updating). */
function acceptSynced(doc: unknown) {
  try {
    loadDocument(doc, registry, { draft: true });
    return true;
  } catch (error) {
    return error instanceof DocumentError && (error.code === "unsupported" || error.code === "unknown-type");
  }
}

function imageKeysOf(doc: PuzzleDocument) {
  try {
    const { type, doc: checked } = loadDocument(doc, registry, { draft: true });
    return type.imageKeys?.(checked.data) ?? [];
  } catch {
    return [];
  }
}

async function hasLocalData(s: Storage) {
  return (await s.listPuzzles()).length > 0 || (await s.listProgress()).length > 0 || (await s.listTombstones()).length > 0;
}

/** The device's data goes into `userId`'s account: everything is sent, and everything is pulled again. */
async function takeOver(s: Storage, userId: string) {
  await s.markAllDirty();
  await s.putMeta(`sync:${userId}`, { ...(await readSyncMeta(s, userId)), cursor: 0 });
  await s.putMeta(OWNER_KEY, userId);
}

async function runSync() {
  const user = store.get().account.user;
  if (!syncApi || !user) return;
  if (syncRunning) {
    syncAgain = true;
    return;
  }
  syncRunning = true;
  clearTimeout(syncTimer);
  try {
    const s = await storage;
    const owner = await s.getMeta(OWNER_KEY);
    const decision = ownerDecision(typeof owner === "string" ? owner : null, user.id, await hasLocalData(s));
    if (decision === "ask") {
      setSync({ status: "choice" });
      return;
    }
    if (decision === "adopt") await takeOver(s, user.id);
    setSync({ status: "running" });
    if (saveTimer !== undefined) await saveEditor(); // pending edits go along
    const outcome = await syncOnce({ api: syncApi, storage: s, userId: user.id, accept: acceptSynced, imageKeys: imageKeysOf, now });
    if (store.get().account.user?.id !== user.id) return; // signed out or switched meanwhile
    const { lastSync } = await readSyncMeta(s, user.id);
    setSync({ status: "idle", lastSync, error: null, rejected: outcome.rejected });
    if (outcome.changed) await reloadLocal(false);
  } catch (error) {
    console.warn("sync", error);
    if (store.get().account.user?.id === user.id) setSync({ status: "error", error: apiErrorText(error) });
  } finally {
    syncRunning = false;
    if (syncAgain) {
      syncAgain = false;
      requestSync();
    }
  }
}

/** Shows what sync changed: the library (if loaded) and the progress. `replace` drops progress kept in memory. */
async function reloadLocal(replace: boolean) {
  if (store.get().library !== null) await loadLibrary();
  const records = await (await storage).listProgress();
  store.set((state) => {
    const progress = new Map(replace ? [] : state.progress);
    for (const record of records) progress.set(record.key, mergeProgress(progress.get(record.key), record));
    return { ...state, progress };
  });
}

async function resolveSync(choice: "merge" | "replace") {
  const user = store.get().account.user;
  if (!user) return;
  try {
    const s = await storage;
    if (choice === "merge") {
      await takeOver(s, user.id);
    } else {
      flushSave();
      await s.clearLocal();
      await s.putMeta(`sync:${user.id}`, { ...(await readSyncMeta(s, user.id)), cursor: 0 });
      await s.putMeta(OWNER_KEY, user.id);
      for (const url of localImageUrls.values()) if (url && url !== "loading") URL.revokeObjectURL(url);
      localImageUrls.clear();
      patch({ editor: null, progress: new Map() });
      await reloadLocal(true);
      setAccount({ message: { tone: "ok", text: "syncReplaced" } });
    }
    setSync({ status: "idle" });
    await runSync();
  } catch (error) {
    console.error(error);
    patch({ notice: "storageFailed" });
  }
}

// --- Library ---

async function loadLibrary() {
  const records = await (await storage).listPuzzles();
  const items = records.flatMap((record): LibraryItem[] => {
    try {
      const { type } = loadDocument(record.doc, registry, { draft: true });
      let playable = true;
      try {
        loadDocument(record.doc, registry);
      } catch {
        playable = false;
      }
      return [{ record, type, playable }];
    } catch {
      return []; // unknown or broken entries stay in storage but are not listed
    }
  });
  patch({ library: items });
  void removeUnusedImages(items);
}

const libraryActions = {
  openBuild: () => patch({ buildSheet: true }),
  duplicate: async (id: string) => {
    const record = store.get().library?.find((item) => item.record.id === id)?.record;
    if (!record) return;
    const title = t("copyTitle", { title: record.doc.meta.title || t("untitled") });
    if (await save((s) => s.putPuzzle(copyRecord(record, newPuzzleId(), title, now())))) await loadLibrary();
  },
  remove: async (id: string) => {
    if (store.get().editor?.id === id) patch({ editor: null });
    if (await save((s) => s.deletePuzzle(id, now()))) await loadLibrary();
  },
};

// --- Progress ---

// --- Own theme templates (M30), only on this device ---

async function loadSavedThemes() {
  try {
    patch({ savedThemes: themes.parseSavedThemes(await (await storage).getMeta(themes.SAVED_THEMES_KEY)) });
  } catch (error) {
    console.warn(error);
  }
}

function finishThemeChange(result: themes.SaveResult) {
  const editor = store.get().editor;
  if (result.error) {
    if (editor) patch({ editor: { ...editor, themeNotice: result.error === "full" ? "editorThemeFull" : "editorThemeNameInvalid" } });
    return;
  }
  if (editor?.themeNotice) {
    const { themeNotice: _notice, ...rest } = editor;
    patch({ editor: rest });
  }
  patch({ savedThemes: result.list });
  void storage.then((s) => s.putMeta(themes.SAVED_THEMES_KEY, result.list)).catch((error: unknown) => {
    console.error(error);
    patch({ notice: "storageFailed" });
  });
}

async function loadProgress() {
  const records = await (await storage).listProgress();
  const keys = examples.map((e) => [e.id, progressKey(loadDocument(e.doc, registry).doc)] as const);
  store.set((state) => ({
    ...state,
    // Keep results recorded while loading.
    progress: new Map([...records.map((r) => [r.key, r] as const), ...state.progress]),
    exampleKeys: new Map(keys),
  }));
}

// --- Account ---

function setAccount(change: Partial<AccountViewModel>) {
  store.set((state) => ({ ...state, account: { ...state.account, ...change } }));
}

function resetAccountForm() {
  const { account } = store.get();
  if (account.message || account.confirmDelete || account.mode !== "signIn" || account.editingPublication || account.confirmWithdraw || account.panel) {
    setAccount({ message: null, confirmDelete: false, mode: "signIn", editingPublication: null, confirmWithdraw: null, panel: null });
  }
}

async function loadPublications() {
  const userId = store.get().account.user?.id;
  if (!api || !userId) return;
  try {
    const [list, ownChains] = await Promise.all([listOwnPublications(api, userId), chains.listOwnChains(api, userId)]);
    const publications = list.map((p) => {
      const type = registry.get(p.type);
      return { ...p, typeName: type ? t(type.name) : p.type };
    });
    if (store.get().account.user?.id === userId) setAccount({ publications, chains: ownChains });
  } catch (error) {
    console.warn("publications", error);
    if (store.get().account.user?.id === userId) {
      setAccount({ publications: [], chains: [], message: { tone: "error", text: apiErrorText(error) } });
    }
  }
}

/** Rejected input, reported like a server error. */
class InputProblem extends Error {
  readonly text: MessageKey;

  constructor(text: MessageKey) {
    super(text);
    this.text = text;
  }
}

const USERNAME_TEXT: Record<UsernameProblem, MessageKey> = {
  "too-short": "usernameTooShort",
  "too-long": "usernameTooLong",
  "invalid-chars": "usernameInvalidChars",
};

function checkUsername(name: string) {
  const problem = usernameProblem(name);
  if (problem) throw new InputProblem(USERNAME_TEXT[problem]);
}

function checkPassword(password: string) {
  if (password.length < PASSWORD_MIN) throw new InputProblem("authWeakPassword");
}

/** Runs one account action at a time; its result or error becomes the message. */
async function accountTask(task: () => Promise<AccountMessage | null>): Promise<boolean> {
  if (store.get().account.busy) return false;
  setAccount({ busy: true, message: null });
  try {
    setAccount({ busy: false, message: await task() });
    return true;
  } catch (error) {
    if (!(error instanceof InputProblem)) console.warn(error);
    const text = error instanceof InputProblem ? error.text : accountErrorText(error);
    setAccount({ busy: false, message: { tone: "error", text } });
    return false;
  }
}

// Mail links come back to the app itself; the URL fragment then carries the tokens instead of a route.
function authRedirect() {
  return `${location.origin}${location.pathname}`;
}

function onSession(session: Session | null) {
  const { account } = store.get();
  const user = session?.user ?? null;
  if (user?.id === account.user?.id) return;
  setAccount({ user, profile: null, confirmDelete: false, publications: null, chains: null, editingPublication: null, confirmWithdraw: null, panel: null });
  if (user) void loadProfile(user.id);
  if (user) void updateMailLanguage();
  const { route } = store.get();
  if (user && route.name === "account") void loadPublications();
  // The draft belongs to the account that started it.
  patch({ chainEditor: null });
  if (route.name === "chainNew") void openChainEditor(route);
  const chain = store.get().chain;
  if (chain) {
    setChain({ reported: null, report: null }, chain.chain.id);
    void loadChainReport();
  }
  const published = store.get().play?.published;
  if (published) {
    setPublished({ me: null }, published.id);
    void loadReaction();
    if (published.leaderboard) void loadLeaderboard(published.id); // "is me" depends on the user
  }
  if (route.name === "home" || route.name === "daily") void loadDaily(); // solved and streak are the user's
  if (user) void flushScoreQueue();
  // Signing out keeps the device's data; it stays with that account until another one signs in (ownerDecision).
  setSync({ status: "off", lastSync: null, error: null, rejected: 0 });
  if (user) requestSync();
  else clearTimeout(syncTimer);
}

// The account's mails (confirmation, password reset) are written in user_metadata.lang (M28).
let mailLanguageSent: string | null = null; // "<user id>:<lang>"; the token knows it only after its next refresh

async function updateMailLanguage() {
  const user = store.get().account.user;
  if (!auth || !user) return;
  const lang = language();
  const key = `${user.id}:${lang}`;
  if (mailLanguageSent === key) return;
  if (!mailLanguageSent?.startsWith(`${user.id}:`) && auth.sessionLanguage() === lang) {
    mailLanguageSent = key;
    return;
  }
  try {
    await auth.updateLanguage(lang);
    mailLanguageSent = key;
  } catch (error) {
    console.warn("mail language", error); // tried again with the next session or language change
  }
}

async function loadProfile(userId: string) {
  if (!api) return;
  try {
    const profile = await fetchProfile(api, userId);
    if (store.get().account.user?.id === userId) setAccount({ profile });
  } catch (error) {
    console.warn("profile", error);
  }
}

const accountActions = {
  setMode: (mode: AccountViewModel["mode"]) => setAccount({ mode, message: null }),
  signIn: (email: string, password: string) =>
    accountTask(async () => {
      await auth!.signIn(email.trim(), password);
      return null;
    }),
  signUp: (username: string, email: string, password: string) =>
    accountTask(async () => {
      const name = username.trim();
      checkUsername(name);
      checkPassword(password);
      if (!(await usernameAvailable(api!, name))) throw new InputProblem("usernameTaken");
      if (await auth!.signUp(email.trim(), password, name, authRedirect(), language())) return { tone: "ok", text: "accountSignedIn" };
      setAccount({ mode: "signIn" });
      return { tone: "ok", text: "accountCheckMail" };
    }),
  requestReset: (email: string) =>
    accountTask(async () => {
      await auth!.requestPasswordReset(email.trim(), authRedirect());
      setAccount({ mode: "signIn" });
      return { tone: "ok", text: "accountResetSent" };
    }),
  setNewPassword: (password: string) =>
    accountTask(async () => {
      checkPassword(password);
      await auth!.updatePassword(password);
      setAccount({ mode: "signIn" });
      return { tone: "ok", text: "accountPasswordChanged" };
    }),
  rename: (username: string) =>
    accountTask(async () => {
      const { user, profile } = store.get().account;
      const name = username.trim();
      if (!user || !profile || name === profile.username) return null;
      checkUsername(name);
      await renameUser(api!, user.id, name);
      await loadProfile(user.id);
      return { tone: "ok", text: "accountRenamed" };
    }),
  signOut: () =>
    void accountTask(async () => {
      await auth!.signOut();
      return { tone: "ok", text: "accountSignedOut" };
    }),
  askDelete: (confirm: boolean) => setAccount({ confirmDelete: confirm, message: null }),
  editPublication: (id: string | null) => setAccount({ editingPublication: id, confirmWithdraw: null, message: null }),
  savePublication: (id: string, title: string, description: string) =>
    accountTask(async () => {
      const clean = title.trim();
      if (clean === "" || clean.length > PUBLISH.maxTitle) throw new InputProblem("publishInvalidTitle");
      if (description.trim().length > PUBLISH.maxDescription) throw new InputProblem("publishInvalidDescription");
      await updatePublication(api!, id, { title: clean, description: description.trim() });
      setAccount({ editingPublication: null });
      await loadPublications();
      return { tone: "ok", text: "myPublicationsSaved" };
    }),
  saveChain: (id: string, title: string, description: string) =>
    accountTask(async () => {
      const clean = title.trim();
      if (clean === "" || clean.length > chains.CHAIN.maxTitle) throw new InputProblem("chainInvalidTitle");
      if (description.trim().length > chains.CHAIN.maxDescription) throw new InputProblem("chainInvalidDescription");
      await chains.updateChain(api!, id, { title: clean, description: description.trim() });
      setAccount({ editingPublication: null });
      await loadPublications();
      return { tone: "ok", text: "myPublicationsSaved" };
    }),
  withdrawChain: (id: string) =>
    void accountTask(async () => {
      await chains.withdrawChain(api!, id);
      setAccount({ confirmWithdraw: null });
      await loadPublications();
      return { tone: "ok", text: "myChainsWithdrawn" };
    }),
  askWithdraw: (id: string | null) => setAccount({ confirmWithdraw: id, editingPublication: null, message: null }),
  withdraw: (id: string) =>
    void accountTask(async () => {
      await withdrawPublication(api!, id);
      setAccount({ confirmWithdraw: null });
      await loadPublications();
      return { tone: "ok", text: "myPublicationsWithdrawn" };
    }),
  openPanel: (panel: AccountViewModel["panel"]) => setAccount({ panel, message: null, editingPublication: null, confirmWithdraw: null }),
  syncNow: () => void runSync(),
  resolveSync: (choice: "merge" | "replace") => void resolveSync(choice),
  deleteAccount: () =>
    void accountTask(async () => {
      await deleteAccount(api!);
      // The device's data is no one's now: the next account to sign in takes it over without asking.
      await (await storage).putMeta(OWNER_KEY, null).catch(() => {});
      auth!.forget();
      return { tone: "ok", text: "accountDeleted" };
    }),
};

/** Handles the return from a confirmation or password-reset mail; true if the URL was such a link. */
function handleAuthCallback(): boolean {
  const result = auth?.handleCallback(location.hash);
  if (!result) return false;
  history.replaceState(null, "", formatRoute({ name: "account" }));
  if (result.kind === "error") {
    setAccount({ message: { tone: "error", text: accountErrorText(new ApiError("invalid", 0, "", result.code)) } });
  } else if (result.type === "recovery") {
    setAccount({ mode: "newPassword", message: { tone: "ok", text: "accountChooseNewPassword" } });
  } else {
    setAccount({ message: { tone: "ok", text: result.type === "signup" ? "accountConfirmed" : "accountSignedIn" } });
  }
  return true;
}

// --- Views ---

function view(state: AppState) {
  if (state.pending) return html`<p>${t("loading")}</p>`;
  if (state.error) return messageView(t(state.error.text), state.error.action, state.error.reload);
  switch (state.route.name) {
    case "home": {
      const listed = examplesIn(language());
      const solved = listed.filter((e) => state.progress.get(state.exampleKeys.get(e.id) ?? "")?.solved);
      const gallery = api ? { newest: state.newest, solved: isSolved } : null;
      const model = {
        types: registry.all(),
        examples: listed,
        solvedExamples: new Set(solved.map((e) => e.id)),
        account: { ...navAccount(state), username: state.account.user ? (state.account.profile?.username ?? null) : null },
        gallery,
        daily: homeDaily(state),
        typeSheet: state.typeSheet,
      };
      return homeView(model, homeActions);
    }
    case "gallery":
      return state.gallery ? galleryView(state.gallery, registry, isSolved, galleryActions) : nothing;
    case "moderation":
      if (!state.account.profile?.isModerator) {
        return state.account.user && !state.account.profile ? html`<p>${t("loading")}</p>` : messageView(t("moderationOnly"));
      }
      return state.moderation ? moderationView(state.moderation, registry, moderationActions) : nothing;
    case "library":
      return html`${libraryView(state.library, libraryActions, syncApi !== null && state.account.user !== null)} ${siteFooter()}`;
    case "imprint":
      return imprintView();
    case "privacy":
      return privacyView(backend !== null);
    case "account": {
      const extras = {
        theme: state.theme,
        language: state.language,
        stats: { solved: [...state.progress.values()].filter((r) => r.solved).length, built: state.library?.length ?? 0 },
      };
      return accountView(auth ? state.account : null, auth ? accountActions : null, extras, profileActions);
    }
    case "chain":
      if (state.route.step === null) {
        if (!state.chain) return nothing;
        return chainView(state.chain, progressOf(state.chain), chainAccess(state.chain, state.account.user), chainBackHref(), registry, chainActions);
      }
    // A step is played like a published puzzle.
    // falls through
    case "play":
    case "shared":
    case "published":
    case "daily": {
      if (!state.play) return messageView(t("puzzleNotFound"));
      const { published, daily } = state.play;
      let play = published
        ? {
            ...state.play,
            published: { ...published, access: reactionAccess(published, state.account.user), viewer: leaderboardViewer(published, state) },
          }
        : state.play;
      if (daily) {
        // The streak only shows for today's puzzle; after midnight the open puzzle may be yesterday's.
        const now = dailyNow(state);
        play = { ...play, daily: now?.day === daily.day ? { ...daily, streak: now.streak } : daily };
      }
      if (play.origin === "example" && state.route.name === "play") play = { ...play, levels: exampleLevels(state, state.route.id) };
      return playView(play, playStats(state), playActions);
    }
    case "chainNew":
      return chainEditorView(state.chainEditor, state.account.user !== null, registry, chainEditorActions);
    case "new":
    case "edit": {
      const editor = state.editor;
      if (!editor) return messageView(t("unknownType"));
      return editorView(
        {
          type: editor.type,
          session: editor.session,
          share: state.share,
          publishing: publishing(state),
          username: state.account.profile?.username ?? null,
          publish: state.publish,
          images: editorImages,
          lang: editor.lang,
          ...(editor.theme ? { theme: editor.theme } : {}),
          ...(editor.themeNotice ? { themeNotice: editor.themeNotice } : {}),
          savedThemes: state.savedThemes,
          testPlay: state.play?.origin === "test" ? playView(state.play, playStats(state), playActions, { embedded: true }) : null,
          ...editorCheck(editor),
        },
        editorActions,
      );
    }
  }
}

function playStats(state: AppState): PlayStats {
  const record = state.play?.progressKey ? state.progress.get(state.play.progressKey) : undefined;
  return {
    bestMoves: record?.solved ? record.bestMoves : null,
    bestTimeMs: record?.solved ? (record.bestTimeMs ?? null) : null,
    timeMs: state.play ? elapsedMs(state.play.timer, performance.now()) : 0,
  };
}

/** Navigation section of a route; null = focus mode (play, editor) without navigation. */
function navSection(route: Route): NavSection | "focus" {
  switch (route.name) {
    case "home":
    case "gallery":
    case "library":
    case "account":
      return route.name;
    case "chain":
      return route.step === null ? "gallery" : "focus";
    case "play":
    case "shared":
    case "published":
    case "daily":
    case "new":
    case "edit":
      return "focus";
    case "imprint":
    case "privacy":
    case "moderation":
    case "chainNew":
      return null;
  }
}

function navAccount(state: AppState) {
  const { user, profile } = state.account;
  return { initial: user && profile ? profile.username.slice(0, 1).toUpperCase() : null };
}

const profileActions = {
  setTheme: (theme: ThemeChoice) => {
    setTheme(theme);
    patch({ theme });
  },
  setLanguage: (choice: LanguageChoice) => {
    storeLanguageChoice(choice);
    applyLanguage(choice);
    patch({ language: choice }); // renders everything again in the new language
    void updateMailLanguage();
  },
};

const homeActions = {
  openType: (id: string) => patch({ typeSheet: id }),
  closeType: () => patch({ typeSheet: null }),
  openBuild: () => patch({ buildSheet: true }),
};

const navActions = {
  openBuild: () => patch({ buildSheet: true }),
  closeBuild: () => patch({ buildSheet: false }),
};

function page(state: AppState) {
  const section = navSection(state.route);
  const content = html`
    ${state.storageNotice ? html`<p class="notice page-notice" role="alert">${t(state.storageNotice)}</p>` : nothing}
    ${state.notice ? html`<p class="notice page-notice" role="alert">${t(state.notice)}</p>` : nothing}
    ${view(state)}
  `;
  if (section === "focus") return html`<div class="page focus">${content}</div>`;
  const account = navAccount(state);
  const wide = state.route.name === "home" || state.route.name === "gallery";
  return html`<div class="with-tabbar">
    ${topNav(section, api !== null, account, navActions.openBuild)}
    <div class="page ${wide ? "wide" : ""}">${content}</div>
    ${tabBar(section, api !== null, navActions.openBuild)}
    ${state.buildSheet ? buildSheet(registry.all(), navActions.closeBuild) : nothing}
  </div>`;
}

function pageTitle(state: AppState): string {
  const { route } = state;
  const part =
    state.play?.title ||
    (route.name === "library" ? t("library")
    : route.name === "gallery" ? t("gallery")
    : route.name === "moderation" ? t("moderation")
    : route.name === "imprint" ? t("imprint")
    : route.name === "privacy" ? t("privacy")
    : route.name === "account" ? t("account")
    : route.name === "chain" && state.chain ? state.chain.chain.title
    : route.name === "chainNew" ? t("chainEditorTitle")
    : (route.name === "new" || route.name === "edit") && state.editor ? t(state.editor.type.name)
    : "");
  return part ? `${part} – ${t("appTitle")}` : t("appTitle");
}

// Render loop: batch all store updates of one task into a single render.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    const state = store.get();
    render(page(state), app!);
    document.title = pageTitle(state);
  });
}

applyTheme(readTheme());
watchSystemTheme();
watchSystemLanguage(() => {
  applyLanguage("system");
  store.set((state) => ({ ...state })); // render again in the new language
  void updateMailLanguage();
});
store.subscribe(scheduleRender);
// Save pending edits before the page is hidden (tab switch, app switch, closing).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
  else requestSync();
  onVisibility();
});
window.addEventListener("online", () => {
  void flushScoreQueue();
  requestSync();
});
if (auth) {
  auth.subscribe(onSession);
  const user = store.get().account.user;
  if (user) void loadProfile(user.id);
  void updateMailLanguage();
  void flushScoreQueue();
  requestSync();
  handleAuthCallback();
  // Another tab signed in or out.
  window.addEventListener("storage", (e) => {
    if (e.key === SESSION_KEY || e.key === null) auth.reload();
  });
}
startRouter(enterRoute);
// Offline support only in production builds; in development it would serve stale files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error: unknown) => console.warn("service worker", error));
}
void loadProgress();
void loadSavedThemes();
scheduleRender();
