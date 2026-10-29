import { render } from "lit-html";
import { loadDocument } from "./core/document.ts";
import * as editing from "./core/editor-session.ts";
import type { EditorSession } from "./core/editor-session.ts";
import { createStore } from "./core/store.ts";
import { parseRoute, startRouter } from "./core/router.ts";
import type { Route } from "./core/router.ts";
import * as session from "./core/session.ts";
import type { AnyPlaySession } from "./core/session.ts";
import type { AnyPuzzleType, SolveResult } from "./core/types.ts";
import { t } from "./i18n/t.ts";
import { examples, registry } from "./puzzles/index.ts";
import { editorView } from "./ui/views/editor.ts";
import { homeView } from "./ui/views/home.ts";
import { messageView } from "./ui/views/message.ts";
import { playView } from "./ui/views/play.ts";
import type { PlayViewModel } from "./ui/views/play.ts";

type EditorState = {
  type: AnyPuzzleType;
  session: EditorSession<unknown>;
  /** Data the creator solved in test play; compared by reference, so undo can restore "verified". */
  verifiedData: unknown;
};

type AppState = {
  route: Route;
  play: PlayViewModel | null; // play route or test play from the editor
  editor: EditorState | null; // kept in memory while navigating; persisted in M4
};

const SOLVE_LIMITS = { maxNodes: 200_000 };
const SOLVE_DELAY_MS = 250;

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const store = createStore<AppState>({ route: parseRoute(location.hash), play: null, editor: null });

// --- Play ---

// Puzzle sources: built-in examples; local library and share links follow in M4.
function loadPlay(route: Route): PlayViewModel | null {
  if (route.name !== "play") return null;
  const example = examples.find((e) => e.id === route.id);
  if (!example) return null;
  try {
    const { type, doc } = loadDocument(example.doc, registry);
    return { title: doc.meta.title, session: session.createSession(type, doc.data), showSolved: false, mode: "play" };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function updateSession(change: (s: AnyPlaySession) => AnyPlaySession) {
  store.set((state) => {
    if (!state.play) return state;
    const prev = state.play.session;
    const next = change(prev);
    if (next === prev) return state;
    // The dialog appears when the puzzle becomes solved and stays until dismissed or unsolved.
    const showSolved = next.solved && (state.play.showSolved || !prev.solved);
    const play = { ...state.play, session: next, showSolved };
    const verified = state.play.mode === "test" && next.solved && !prev.solved && state.editor;
    const editor = verified ? { ...state.editor!, verifiedData: next.data } : state.editor;
    return { ...state, play, editor };
  });
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
  backToEditor: () => store.set((state) => ({ ...state, play: null })),
};

// --- Editor ---

function openEditor(route: Route, current: EditorState | null): EditorState | null {
  if (route.name !== "new") return current;
  if (current?.type.id === route.type) return current;
  const type = registry.get(route.type);
  if (!type) return null;
  return { type, session: editing.createEditorSession(type.createDefault(), t("untitled")), verifiedData: undefined };
}

function updateEditor(change: (s: EditorSession<unknown>) => EditorSession<unknown>) {
  store.set((state) => {
    if (!state.editor) return state;
    const next = change(state.editor.session);
    return next === state.editor.session ? state : { ...state, editor: { ...state.editor, session: next } };
  });
  scheduleSolve();
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

const editorActions = {
  update: (data: unknown) => updateEditor((s) => editing.updateData(s, data)),
  undo: () => updateEditor(editing.undoEdit),
  redo: () => updateEditor(editing.redoEdit),
  setTitle: (title: string) => updateEditor((s) => editing.setTitle(s, title)),
  testPlay: () =>
    store.set((state) => {
      if (!state.editor) return state;
      const { type, session: edit } = state.editor;
      const data = editing.currentData(edit);
      if (problemsOf(type, data).length > 0) return state;
      const play: PlayViewModel = {
        title: edit.title,
        session: session.createSession(type, data),
        showSolved: false,
        mode: "test",
      };
      return { ...state, play };
    }),
};

// --- Views ---

function view(state: AppState) {
  switch (state.route.name) {
    case "home":
      return homeView(registry.all(), examples);
    case "play":
    case "shared":
      return state.play ? playView(state.play, playActions) : messageView(t("puzzleNotFound"));
    case "new": {
      if (state.play?.mode === "test") return playView(state.play, playActions);
      const editor = state.editor;
      if (!editor) return messageView(t("unknownType"));
      const data = editing.currentData(editor.session);
      return editorView(
        {
          type: editor.type,
          session: editor.session,
          problems: problemsOf(editor.type, data),
          solve: cachedSolve(data),
          verified: editor.verifiedData !== undefined && editor.verifiedData === data,
        },
        editorActions,
      );
    }
    default:
      return messageView(t("comingSoon"));
  }
}

// Render loop: batch all store updates of one task into a single render.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render(view(store.get()), app!);
  });
}

store.subscribe(scheduleRender);
startRouter((route) => {
  store.set((state) => ({ route, play: loadPlay(route), editor: openEditor(route, state.editor) }));
  scheduleSolve();
});
scheduleRender();
