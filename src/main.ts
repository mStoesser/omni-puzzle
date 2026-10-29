import { html, nothing, render } from "lit-html";
import { DocumentError, loadDocument } from "./core/document.ts";
import * as editing from "./core/editor-session.ts";
import type { EditorSession } from "./core/editor-session.ts";
import { formatRoute, parseRoute, startRouter } from "./core/router.ts";
import type { Route } from "./core/router.ts";
import * as session from "./core/session.ts";
import type { AnyPlaySession } from "./core/session.ts";
import { decodeDocument, encodeDocument } from "./core/share.ts";
import { copyRecord, memoryStorage, newPuzzleId, openStorage, progressKey, recordSolve } from "./core/storage.ts";
import type { ProgressRecord, PuzzleRecord, Storage } from "./core/storage.ts";
import { createStore } from "./core/store.ts";
import type { AnyPuzzleType, PuzzleDocument, SolveResult } from "./core/types.ts";
import { t } from "./i18n/t.ts";
import type { MessageKey } from "./i18n/t.ts";
import { examples, registry } from "./puzzles/index.ts";
import type { ShareDialogModel } from "./ui/components/share-dialog.ts";
import { editorView } from "./ui/views/editor.ts";
import { homeView } from "./ui/views/home.ts";
import { libraryView } from "./ui/views/library.ts";
import type { LibraryItem } from "./ui/views/library.ts";
import { messageView } from "./ui/views/message.ts";
import { playView } from "./ui/views/play.ts";
import type { PlayOrigin, PlayViewModel } from "./ui/views/play.ts";

type EditorState = {
  id: string; // library id; a new puzzle is saved under it on its first change
  createdAt: string;
  type: AnyPuzzleType;
  session: EditorSession<unknown>;
  /** Data the creator solved in test play; compared by reference, so undo can restore "verified". */
  verifiedData: unknown;
};

type ErrorInfo = { text: MessageKey; action?: { href: string; label: MessageKey } };

type AppState = {
  route: Route;
  pending: boolean; // route content is loading (storage, share link)
  error: ErrorInfo | null; // route content could not be loaded
  notice: MessageKey | null; // e.g. saving failed
  play: PlayViewModel | null; // play route or test play from the editor
  editor: EditorState | null; // kept while navigating, so undo history survives test play and back/forward
  share: ShareDialogModel | null;
  library: LibraryItem[] | null; // null = not loaded yet
  progress: ReadonlyMap<string, ProgressRecord>;
  exampleKeys: ReadonlyMap<string, string>; // example id → progress key
};

const SOLVE_LIMITS = { maxNodes: 200_000 };
const SOLVE_DELAY_MS = 250;
const SAVE_DELAY_MS = 400;

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const store = createStore<AppState>({
  route: parseRoute(location.hash),
  pending: false,
  error: null,
  notice: null,
  play: null,
  editor: null,
  share: null,
  library: null,
  progress: new Map(),
  exampleKeys: new Map(),
});

const storage: Promise<Storage> = openStorage().catch((error: unknown) => {
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
  patch({ route, pending: false, error: null, notice: null, play: null, share: null });
  switch (route.name) {
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
  startPlay(route, record.doc, "own", record.id);
}

async function openShared(route: Route & { name: "shared" }) {
  patch({ pending: true });
  try {
    const doc = await decodeDocument(route.code);
    if (isCurrent(route)) startPlay(route, doc, "shared");
  } catch (error) {
    console.warn(error);
    fail(route, { text: linkErrorText(error) });
  }
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

function startPlay(route: Route, raw: unknown, origin: PlayOrigin, localId?: string) {
  let loaded: { type: AnyPuzzleType; doc: PuzzleDocument };
  try {
    loaded = loadDocument(raw, registry);
  } catch (error) {
    console.warn(error);
    if (origin === "own") {
      return fail(route, { text: "notPlayable", action: { href: `#/edit/${localId}`, label: "edit" } });
    }
    return fail(route, { text: linkErrorText(error) });
  }
  const { type, doc } = loaded;
  const play: PlayViewModel = {
    title: doc.meta.title,
    session: session.createSession(type, doc.data),
    showSolved: false,
    origin,
    progressKey: null,
  };
  if (localId !== undefined) play.localId = localId;
  patch({ pending: false, play });

  void progressKey(doc).then((key) => {
    if (isCurrent(route) && store.get().play?.session.data === doc.data) {
      store.set((state) => ({ ...state, play: { ...state.play!, progressKey: key } }));
    }
  });
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
  // Remixing: the copy is a new, unverified draft of the creator.
  copyToLibrary: async () => {
    const play = store.get().play;
    if (!play) return;
    const { type, data } = play.session;
    const record: PuzzleRecord = {
      id: newPuzzleId(),
      doc: { format: 1, type: type.id, typeVersion: type.version, meta: { title: play.title, createdAt: now() }, data },
      updatedAt: now(),
    };
    if (await save((s) => s.putPuzzle(record))) location.hash = formatRoute({ name: "edit", id: record.id });
  },
};

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
  const doc = editorDocument(editor);
  const share: ShareDialogModel = { title: doc.meta.title, url: null, copy: "idle" };
  patch({ share });
  const code = await encodeDocument(doc);
  const url = `${location.origin}${location.pathname}${formatRoute({ name: "shared", code })}`;
  store.set((state) => (state.share === share ? { ...state, share: { ...share, url } } : state));
}

const editorActions = {
  update: (data: unknown) => updateEditor((s) => editing.updateData(s, data)),
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
    };
    patch({ play });
  },
  openShare: () => void openShare(),
  share: shareActions,
};

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
}

const libraryActions = {
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
  const [records, keys] = await Promise.all([
    storage.then((s) => s.listProgress()),
    Promise.all(examples.map(async (e) => [e.id, await progressKey(loadDocument(e.doc, registry).doc)] as const)),
  ]);
  store.set((state) => ({
    ...state,
    // Keep results recorded while loading.
    progress: new Map([...records.map((r) => [r.key, r] as const), ...state.progress]),
    exampleKeys: new Map(keys),
  }));
}

// --- Views ---

function view(state: AppState) {
  if (state.pending) return html`<p>${t("loading")}</p>`;
  if (state.error) return messageView(t(state.error.text), state.error.action);
  switch (state.route.name) {
    case "home": {
      const solved = examples.filter((e) => state.progress.get(state.exampleKeys.get(e.id) ?? "")?.solved);
      return homeView(registry.all(), examples, new Set(solved.map((e) => e.id)));
    }
    case "library":
      return libraryView(state.library, registry.all(), libraryActions);
    case "play":
    case "shared": {
      if (!state.play) return messageView(t("puzzleNotFound"));
      const best = state.progress.get(state.play.progressKey ?? "")?.bestMoves ?? null;
      return playView(state.play, best, playActions);
    }
    case "new":
    case "edit": {
      if (state.play?.origin === "test") return playView(state.play, null, playActions);
      const editor = state.editor;
      if (!editor) return messageView(t("unknownType"));
      return editorView({ type: editor.type, session: editor.session, share: state.share, ...editorCheck(editor) }, editorActions);
    }
  }
}

function page(state: AppState) {
  return html`
    ${state.notice ? html`<p class="notice" role="alert">${t(state.notice)}</p>` : nothing}
    ${view(state)}
  `;
}

// Render loop: batch all store updates of one task into a single render.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render(page(store.get()), app!);
  });
}

store.subscribe(scheduleRender);
// Save pending edits before the page is hidden (tab switch, app switch, closing).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});
startRouter(enterRoute);
void loadProgress();
scheduleRender();
