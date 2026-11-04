import { html, nothing, render } from "lit-html";
import { backend } from "./backend.ts";
import { PASSWORD_MIN, accountErrorText, deleteAccount, fetchProfile, renameUser, usernameAvailable, usernameProblem } from "./core/account.ts";
import type { UsernameProblem } from "./core/account.ts";
import { ApiError, apiErrorText, createApi } from "./core/api.ts";
import { SESSION_KEY, createAuth } from "./core/auth.ts";
import type { KeyValueStore, Session } from "./core/auth.ts";
import { DocumentError, loadDocument, shareableDocument } from "./core/document.ts";
import { fetchGalleryPage } from "./core/gallery.ts";
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
import { fetchModerationQueue, hidePuzzle, releasePuzzle, reportPuzzle, resetUsername, setBanned } from "./core/moderation.ts";
import type { ReportReason } from "./core/moderation.ts";
import { applyRating, fetchMyReaction, setLike, setRating } from "./core/reactions.ts";
import { formatRoute, parseRoute, startRouter } from "./core/router.ts";
import type { Route } from "./core/router.ts";
import * as session from "./core/session.ts";
import type { AnyPlaySession } from "./core/session.ts";
import { PUBLISH } from "./core/publish.ts";
import { decodeDocument, encodeDocument } from "./core/share.ts";
import { copyRecord, memoryStorage, newPuzzleId, openStorage, progressKey, recordSolve } from "./core/storage.ts";
import type { ProgressRecord, PuzzleRecord, Storage } from "./core/storage.ts";
import { createStore } from "./core/store.ts";
import { imageProblem, imageKey, publishedImageUrl, sniffImageType, toBase64 } from "./core/images.ts";
import type { AnyPuzzleType, ImageSource, PuzzleDocument, SolveResult } from "./core/types.ts";
import { t } from "./i18n/t.ts";
import type { MessageKey } from "./i18n/t.ts";
import { examples, registry } from "./puzzles/index.ts";
import type { PublishDialogModel } from "./ui/components/publish-dialog.ts";
import type { ShareDialogModel } from "./ui/components/share-dialog.ts";
import { accountView } from "./ui/views/account.ts";
import type { AccountMessage, AccountViewModel } from "./ui/views/account.ts";
import { editorView } from "./ui/views/editor.ts";
import { galleryView } from "./ui/views/gallery.ts";
import { moderationView } from "./ui/views/moderation.ts";
import type { ModerationViewModel } from "./ui/views/moderation.ts";
import type { GalleryViewModel } from "./ui/views/gallery.ts";
import { homeView, siteFooter } from "./ui/views/home.ts";
import { imprintView } from "./ui/views/imprint.ts";
import { libraryView } from "./ui/views/library.ts";
import type { LibraryItem } from "./ui/views/library.ts";
import { messageView } from "./ui/views/message.ts";
import { playView } from "./ui/views/play.ts";
import type { PlayLevel, PlayOrigin, PlayViewModel, PublishedInfo } from "./ui/views/play.ts";
import { privacyView } from "./ui/views/privacy.ts";
import { encodeImage } from "./ui/image-encode.ts";
import { buildSheet, tabBar, topNav } from "./ui/components/nav.ts";
import type { NavSection } from "./ui/components/nav.ts";
import { applyTheme, readTheme, setTheme, watchSystemTheme } from "./ui/theme.ts";
import type { ThemeChoice } from "./ui/theme.ts";
import type { EncodeError } from "./ui/image-encode.ts";

type EditorState = {
  id: string; // library id; a new puzzle is saved under it on its first change
  createdAt: string;
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
  notice: MessageKey | null; // e.g. saving failed
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
  buildSheet: boolean; // type choice for a new puzzle is open
  typeSheet: string | null; // home: type whose levels are shown in a sheet
  theme: ThemeChoice;
};

const SOLVE_LIMITS = { maxNodes: 200_000 };
const SOLVE_DELAY_MS = 250;
const SAVE_DELAY_MS = 400;

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
const api = backend && auth ? createApi(backend, { accessToken: auth.accessToken }) : null;

const store = createStore<AppState>({
  route: parseRoute(location.hash),
  pending: false,
  error: null,
  notice: null,
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
    editingPublication: null,
    confirmWithdraw: null,
    panel: null,
  },
  gallery: null,
  newest: [],
  moderation: null,
  buildSheet: false,
  typeSheet: null,
  theme: readTheme(),
});

const storage: Promise<Storage> = openStorage({
  blocked: () => patch({ notice: "storageBlocked" }),
  versionChange: () => patch({ notice: "storageOutdated" }),
})
  .then((opened) => {
    if (store.get().notice === "storageBlocked") patch({ notice: null });
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
  }
}

function fail(route: Route, error: ErrorInfo) {
  if (isCurrent(route)) patch({ pending: false, error });
}

// --- Play ---

async function openPlay(route: Route & { name: "play" }) {
  const example = examples.find((e) => e.id === route.id);
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

/** All examples of the same type with their progress, for the level list beside the board. */
function exampleLevels(state: AppState, id: string): PlayLevel[] {
  const current = examples.find((e) => e.id === id);
  return examples
    .filter((e) => e.doc.type === current?.doc.type)
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
  const current = examples.find((e) => e.id === route.id);
  if (!current) return {};
  const own = examples.filter((e) => e.doc.type === current.doc.type);
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
  extra: Pick<PlayViewModel, "localId" | "published" | "backHref"> & { title?: string; images?: ImageSource } = {},
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
    images: extra.images ?? localImages,
    minMoves: doc.meta.minMoves ?? null,
  };
  if (origin === "example") Object.assign(play, exampleNeighbours(route));
  if (extra.localId !== undefined) play.localId = extra.localId;
  if (extra.published !== undefined) play.published = extra.published;
  if (extra.backHref !== undefined) play.backHref = extra.backHref;
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
    const published: PublishedInfo = {
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
    };
    // Back to the gallery with the filter the player came from.
    const gallery = store.get().gallery;
    const backHref = formatRoute({ name: "gallery", filter: gallery?.filter ?? { type: null, level: null, sort: "new" } });
    const images = publishedImages(puzzle.id);
    if (startPlay(route, puzzle.doc, "published", { title: puzzle.title, published, backHref, images })) {
      countPlayOnce(puzzle.id);
      void loadReaction();
    }
  } catch (error) {
    console.warn(error);
    fail(route, { text: apiErrorText(error) });
  }
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
  patch({ moderation: { status: "loading", items: [], message: null, busy: false, confirmDelete: null } });
  const { account } = store.get();
  if (account.user && !account.profile) await loadProfile(account.user.id);
  if (!isCurrent(route) || !store.get().account.profile?.isModerator) return;
  await loadModerationQueue();
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
  release: (id: string) => void moderate(() => releasePuzzle(api!, id)),
  hide: (id: string) => void moderate(() => hidePuzzle(api!, id)),
  askDelete: (id: string | null) => setModeration({ confirmDelete: id, message: null }),
  remove: (id: string) => void moderate(() => withdrawPublication(api!, id)),
  setBanned: (userId: string, ban: boolean) => void moderate(() => setBanned(api!, userId, ban)),
  resetName: (userId: string) => void moderate(() => resetUsername(api!, userId)),
  imageUrl: (puzzleId: string, key: string) => (backend ? publishedImageUrl(backend.url, puzzleId, key) : null),
};

// Plays are counted once per device and puzzle; the ids are remembered in localStorage.
const PLAYS_KEY = "raetsel-plays";
const MAX_REMEMBERED_PLAYS = 500;

function countPlayOnce(id: string) {
  let ids: unknown;
  try {
    ids = JSON.parse(browserStore.get(PLAYS_KEY) ?? "[]");
  } catch {
    ids = [];
  }
  const played = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  if (played.includes(id)) return;
  browserStore.set(PLAYS_KEY, JSON.stringify([...played, id].slice(-MAX_REMEMBERED_PLAYS)));
  registerPlay(api!, id).catch((error: unknown) => console.warn("play counter", error));
}

function updateSession(change: (s: AnyPlaySession) => AnyPlaySession) {
  const state = store.get();
  if (!state.play) return;
  const prev = state.play.session;
  const next = change(prev);
  if (next === prev) return;

  const justSolved = next.solved && !prev.solved;
  // The dialog appears when the puzzle becomes solved and stays until dismissed or unsolved.
  const showSolved = next.solved && (state.play.showSolved || !prev.solved);
  const play = { ...state.play, session: next, showSolved };

  if (justSolved && play.origin === "test" && state.editor) {
    patch({ play, editor: { ...state.editor, verifiedData: next.data } });
    editorChanged();
    return;
  }
  if (justSolved && play.progressKey !== null) {
    const record = recordSolve(state.progress.get(play.progressKey), play.progressKey, session.moveCount(next));
    patch({ play, progress: new Map(state.progress).set(record.key, record) });
    void save(async (s) => s.putProgress(record));
    return;
  }
  patch({ play });
}

const playActions = {
  dispatch: (move: unknown) => updateSession((s) => session.dispatch(s, move)),
  undo: () => updateSession(session.undo),
  redo: () => updateSession(session.redo),
  restart: () => updateSession(session.restart),
  dismissSolved: () =>
    store.set((state) =>
      state.play?.showSolved ? { ...state, play: { ...state.play, showSolved: false } } : state,
    ),
  backToEditor: () => patch({ play: null }),
  toggleLike,
  rate,
  openReport,
  report: reportActions,
  // Remixing: the copy is a new, unverified draft of the creator.
  copyToLibrary: async () => {
    const play = store.get().play;
    if (!play) return;
    const { type, data } = play.session;
    if (play.published) await downloadImages(play.published.id, type.imageKeys?.(data) ?? []);
    const record: PuzzleRecord = {
      id: newPuzzleId(),
      doc: { format: 1, type: type.id, typeVersion: type.version, meta: { title: play.title, createdAt: now() }, data },
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
    const { items } = await fetchGalleryPage(api, { type: null, level: null, sort: "new" }, null, NEWEST_ON_HOME);
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
    gallery: { filter: route.filter, items: [], status: "loading", error: null, hasMore: false, announcement: "", next: null },
  });
  await loadGalleryPage(route);
}

async function loadGalleryPage(route: Route & { name: "gallery" }) {
  const gallery = store.get().gallery;
  if (!api || !gallery) return;
  const more = gallery.items.length > 0;
  patch({ gallery: { ...gallery, status: more ? "loading-more" : "loading", error: null, announcement: "" } });
  try {
    const page = await fetchGalleryPage(api, route.filter, gallery.next);
    if (!isCurrent(route)) return;
    patch({
      gallery: {
        ...gallery,
        items: [...gallery.items, ...page.items],
        next: page.next,
        hasMore: page.next !== null,
        status: "idle",
        error: null,
        announcement: more ? t("galleryLoaded", { count: page.items.length }) : "",
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

// --- Editor ---

function newEditor(typeId: string) {
  const type = registry.get(typeId);
  if (!type) return patch({ error: { text: "unknownType" } });
  const editor: EditorState = {
    id: newPuzzleId(),
    createdAt: now(),
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
  testPlay: () => {
    const editor = store.get().editor;
    if (!editor || !editing.readiness(editorCheck(editor)).canTest) return;
    const play: PlayViewModel = {
      title: editor.session.title,
      session: session.createSession(editor.type, editing.currentData(editor.session)),
      showSolved: false,
      origin: "test",
      progressKey: null,
      images: localImages,
      minMoves: minMovesOf(cachedSolve(editing.currentData(editor.session))),
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
    if (await save((s) => s.deletePuzzle(id))) await loadLibrary();
  },
};

// --- Progress ---

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
    const list = await listOwnPublications(api, userId);
    const publications = list.map((p) => {
      const type = registry.get(p.type);
      return { ...p, typeName: type ? t(type.name) : p.type };
    });
    if (store.get().account.user?.id === userId) setAccount({ publications });
  } catch (error) {
    console.warn("publications", error);
    if (store.get().account.user?.id === userId) setAccount({ publications: [], message: { tone: "error", text: apiErrorText(error) } });
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
  setAccount({ user, profile: null, confirmDelete: false, publications: null, editingPublication: null, confirmWithdraw: null, panel: null });
  if (user) void loadProfile(user.id);
  if (user && store.get().route.name === "account") void loadPublications();
  const published = store.get().play?.published;
  if (published) {
    setPublished({ me: null }, published.id);
    void loadReaction();
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
      if (await auth!.signUp(email.trim(), password, name, authRedirect())) return { tone: "ok", text: "accountSignedIn" };
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
  askWithdraw: (id: string | null) => setAccount({ confirmWithdraw: id, editingPublication: null, message: null }),
  withdraw: (id: string) =>
    void accountTask(async () => {
      await withdrawPublication(api!, id);
      setAccount({ confirmWithdraw: null });
      await loadPublications();
      return { tone: "ok", text: "myPublicationsWithdrawn" };
    }),
  openPanel: (panel: AccountViewModel["panel"]) => setAccount({ panel, message: null, editingPublication: null, confirmWithdraw: null }),
  deleteAccount: () =>
    void accountTask(async () => {
      await deleteAccount(api!);
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
      const solved = examples.filter((e) => state.progress.get(state.exampleKeys.get(e.id) ?? "")?.solved);
      const gallery = api ? { newest: state.newest, solved: isSolved } : null;
      const model = {
        types: registry.all(),
        examples,
        solvedExamples: new Set(solved.map((e) => e.id)),
        account: { ...navAccount(state), username: state.account.user ? (state.account.profile?.username ?? null) : null },
        gallery,
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
      return html`${libraryView(state.library, libraryActions)} ${siteFooter()}`;
    case "imprint":
      return imprintView();
    case "privacy":
      return privacyView(backend !== null);
    case "account": {
      const extras = {
        theme: state.theme,
        stats: { solved: [...state.progress.values()].filter((r) => r.solved).length, built: state.library?.length ?? 0 },
      };
      return accountView(auth ? state.account : null, auth ? accountActions : null, extras, profileActions);
    }
    case "play":
    case "shared":
    case "published": {
      if (!state.play) return messageView(t("puzzleNotFound"));
      const best = state.progress.get(state.play.progressKey ?? "")?.bestMoves ?? null;
      const { published } = state.play;
      let play = published
        ? { ...state.play, published: { ...published, access: reactionAccess(published, state.account.user) } }
        : state.play;
      if (play.origin === "example" && state.route.name === "play") play = { ...play, levels: exampleLevels(state, state.route.id) };
      return playView(play, best, playActions);
    }
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
          testPlay: state.play?.origin === "test" ? playView(state.play, null, playActions, { embedded: true }) : null,
          ...editorCheck(editor),
        },
        editorActions,
      );
    }
  }
}

/** Navigation section of a route; null = focus mode (play, editor) without navigation. */
function navSection(route: Route): NavSection | "focus" {
  switch (route.name) {
    case "home":
    case "gallery":
    case "library":
    case "account":
      return route.name;
    case "play":
    case "shared":
    case "published":
    case "new":
    case "edit":
      return "focus";
    case "imprint":
    case "privacy":
    case "moderation":
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
store.subscribe(scheduleRender);
// Save pending edits before the page is hidden (tab switch, app switch, closing).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});
if (auth) {
  auth.subscribe(onSession);
  const user = store.get().account.user;
  if (user) void loadProfile(user.id);
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
scheduleRender();
