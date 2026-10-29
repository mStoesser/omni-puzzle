import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.ts";

test("get returns the initial state", () => {
  assert.deepEqual(createStore({ n: 1 }).get(), { n: 1 });
});

test("set with value and with updater", () => {
  const store = createStore(1);
  store.set(5);
  assert.equal(store.get(), 5);
  store.set((n) => n * 2);
  assert.equal(store.get(), 10);
});

test("listeners receive the new state", () => {
  const store = createStore(0);
  const seen: number[] = [];
  store.subscribe((s) => seen.push(s));
  store.set(1);
  store.set(2);
  assert.deepEqual(seen, [1, 2]);
});

test("listeners are not called when the state is unchanged", () => {
  const state = { n: 1 };
  const store = createStore(state);
  let calls = 0;
  store.subscribe(() => calls++);
  store.set(state);
  store.set((s) => s);
  assert.equal(calls, 0);
});

test("unsubscribe stops notifications", () => {
  const store = createStore(0);
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.set(1);
  unsubscribe();
  store.set(2);
  assert.equal(calls, 1);
});

test("a listener may unsubscribe while being notified", () => {
  const store = createStore(0);
  const seen: string[] = [];
  const unsubscribeA = store.subscribe(() => {
    seen.push("a");
    unsubscribeA();
  });
  store.subscribe(() => seen.push("b"));
  store.set(1);
  store.set(2);
  assert.deepEqual(seen, ["a", "b", "b"]);
});
