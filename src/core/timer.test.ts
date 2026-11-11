import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_TIMER, continuedTimer, elapsedMs, formatDuration, isRunning, pauseTimer, resumeTimer, startTimer } from "./timer.ts";

test("the timer runs from the first move and only counts visible time", () => {
  assert.equal(resumeTimer(IDLE_TIMER, 5), IDLE_TIMER, "an idle timer waits for the first move");
  let timer = startTimer(IDLE_TIMER, 1000);
  assert.ok(isRunning(timer));
  assert.equal(startTimer(timer, 1500), timer, "later moves do not restart it");
  assert.equal(elapsedMs(timer, 1600), 600);
  timer = pauseTimer(timer, 2000); // page hidden
  assert.ok(!isRunning(timer));
  assert.equal(elapsedMs(timer, 9000), 1000);
  assert.equal(pauseTimer(timer, 9000), timer);
  timer = resumeTimer(timer, 10_000);
  assert.equal(elapsedMs(timer, 10_500), 1500);
  assert.equal(resumeTimer(timer, 11_000), timer, "a running timer keeps its start");
  assert.equal(elapsedMs(timer, 9000), 1000, "a clock jumping back does not count negative time");
});

test("formatDuration shows minutes and seconds, hours when needed", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(7999), "0:07");
  assert.equal(formatDuration(754_000), "12:34");
  assert.equal(formatDuration(3_723_000), "1:02:03");
  assert.equal(formatDuration(-5), "0:00");
});

test("a continued timer starts paused with the time so far and runs again when resumed", () => {
  const timer = continuedTimer(4200);
  assert.equal(isRunning(timer), false);
  assert.equal(elapsedMs(timer, 99_999), 4200);
  assert.equal(startTimer(timer, 100), timer); // already started: a new move does not reset it
  assert.equal(elapsedMs(resumeTimer(timer, 100), 1100), 5200);
  assert.equal(continuedTimer(-5).elapsedMs, 0);
});
