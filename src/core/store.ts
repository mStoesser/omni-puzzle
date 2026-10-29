export type Listener<T> = (state: T) => void;

export type Store<T> = {
  get(): T;
  /** Accepts a new state or an updater. Listeners only run if the state changed (Object.is). */
  set(next: T | ((prev: T) => T)): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: Listener<T>): () => void;
};

// T must not be a function type, otherwise `set` cannot tell values from updaters.
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => state,
    set(next) {
      const value = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
