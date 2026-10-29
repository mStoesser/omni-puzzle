import { render } from "lit-html";
import { createStore } from "./core/store.ts";
import { parseRoute, startRouter } from "./core/router.ts";
import type { Route } from "./core/router.ts";
import * as session from "./core/session.ts";
import type { AnyPlaySession } from "./core/session.ts";
import { t } from "./i18n/t.ts";
import { registry } from "./puzzles/index.ts";
import { homeView } from "./ui/views/home.ts";
import { messageView } from "./ui/views/message.ts";
import { playView } from "./ui/views/play.ts";
import type { PlayViewModel } from "./ui/views/play.ts";

type AppState = {
  route: Route;
  play: PlayViewModel | null;
};

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const store = createStore<AppState>({ route: parseRoute(location.hash), play: null });

// Puzzle sources follow later: built-in examples (M2), local library and share links (M4).
function loadPlay(_route: Route): PlayViewModel | null {
  return null;
}

function updateSession(change: (s: AnyPlaySession) => AnyPlaySession) {
  store.set((state) => {
    if (!state.play) return state;
    const prev = state.play.session;
    const next = change(prev);
    if (next === prev) return state;
    // The dialog appears when the puzzle becomes solved and stays until dismissed or unsolved.
    const showSolved = next.solved && (state.play.showSolved || !prev.solved);
    return { ...state, play: { ...state.play, session: next, showSolved } };
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
};

function view(state: AppState) {
  switch (state.route.name) {
    case "home":
      return homeView(registry.all());
    case "play":
    case "shared":
      return state.play ? playView(state.play, playActions) : messageView(t("puzzleNotFound"));
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
startRouter((route) => store.set({ route, play: loadPlay(route) }));
scheduleRender();
