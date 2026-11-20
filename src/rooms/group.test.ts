import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesRegistry } from "../puzzles/rules.ts";
import { escapeRoomExamples } from "./examples.ts";
import {
  CODE_ALPHABET,
  applyGroupEvents,
  cleanPlayerName,
  isPlayerToken,
  isRoundCode,
  mergeServerShared,
  newPlayerToken,
  newRoundCode,
  normalizeRoundCode,
  parseGroupEvents,
  parseRoundState,
  sameShared,
  sharedFor,
} from "./group.ts";
import type { GroupEvent } from "./group.ts";
import { EMPTY_SHARED, applyEvent, loadEscapeRoom, startProgress } from "./logic.ts";

const data = loadEscapeRoom(escapeRoomExamples[0]!.doc, rulesRegistry).data;
const bytes = (values: number[]) => () => new Uint8Array(values);

test("round codes are six readable characters, typed in any form", () => {
  assert.equal(CODE_ALPHABET.length, 32);
  assert.equal(newRoundCode(bytes([0, 31, 32, 255, 8, 100])), "A9A9JE");
  assert.equal(isRoundCode("A9A9JE"), true);
  assert.equal(isRoundCode("A9A9J0"), false); // no zero
  assert.equal(isRoundCode("A9A9J"), false);
  assert.equal(normalizeRoundCode(" a9a-9je "), "A9A9JE");
  const token = newPlayerToken(bytes(Array.from({ length: 32 }, (_, i) => i * 7)));
  assert.equal(isPlayerToken(token), true);
  assert.equal(token.length, 64);
});

test("player names are cleaned and limited", () => {
  assert.equal(cleanPlayerName("  Anna   Lena "), "Anna Lena");
  assert.equal(cleanPlayerName("A\u0000b\u200e"), "Ab");
  assert.equal(cleanPlayerName("   "), null);
  assert.equal(cleanPlayerName("x".repeat(25)), null);
  assert.equal(cleanPlayerName("😀".repeat(24)), "😀".repeat(24));
  assert.equal(cleanPlayerName(3), null);
});

test("events from a request are checked for shape and number", () => {
  const ok = [{ scene: "study", event: { kind: "code", lock: "safe", code: "314" } }, { scene: "hall", event: { kind: "solved", puzzle: "parking", extra: 1 } }];
  assert.deepEqual(parseGroupEvents(ok), [
    { scene: "study", event: { kind: "code", lock: "safe", code: "314" } },
    { scene: "hall", event: { kind: "solved", puzzle: "parking" } },
  ]);
  assert.equal(parseGroupEvents([]), null);
  assert.equal(parseGroupEvents(Array(21).fill(ok[0])), null);
  assert.equal(parseGroupEvents([{ scene: "study", event: { kind: "move" } }]), null);
  assert.equal(parseGroupEvents([{ scene: "a b", event: { kind: "spot", spot: "desk" } }]), null);
  assert.equal(parseGroupEvents({}), null);
});

test("the server replays events on the round's state and tells what is new", () => {
  const events: GroupEvent[] = [
    { scene: "study", event: { kind: "solved", puzzle: "lights" } },
    { scene: "study", event: { kind: "code", lock: "safe", code: "999" } }, // wrong code
    { scene: "study", event: { kind: "code", lock: "safe", code: "3 1 4" } },
    { scene: "nowhere", event: { kind: "spot", spot: "desk" } },
  ];
  const result = applyGroupEvents(data, EMPTY_SHARED, events);
  assert.deepEqual(result.shared, { flags: ["safe-open"], solved: ["lights"], opened: ["safe"], won: false });
  assert.deepEqual(result.news, [{ kind: "solved", target: "lights" }, { kind: "opened", target: "safe" }]);
  assert.equal(result.refused, 2);
  // Solving again tells nothing new.
  assert.deepEqual(applyGroupEvents(data, result.shared, [events[0]!]).news, []);
});

test("two players together escape: one opens the safe, the other the box and the door", () => {
  const a = applyGroupEvents(data, EMPTY_SHARED, [{ scene: "study", event: { kind: "code", lock: "safe", code: "314" } }]);
  // B stood in the hallway (the door is open now that the safe is: the union decides).
  const b = applyGroupEvents(data, a.shared, [
    { scene: "hall", event: { kind: "solved", puzzle: "parking" } },
    { scene: "hall", event: { kind: "spot", spot: "exit" } },
  ]);
  assert.equal(b.shared.won, true);
  assert.deepEqual(b.news.map((n) => n.kind), ["solved", "won"]);
  // Tapping the exit before the box is open is refused.
  assert.equal(applyGroupEvents(data, EMPTY_SHARED, [{ scene: "hall", event: { kind: "spot", spot: "exit" } }]).refused, 1);
});

test("the server's state is cut to the room's ids and merged into the local one", () => {
  const shared = sharedFor(data, { flags: ["box-open", "evil", 3], solved: ["lights", "lights"], opened: "safe", won: true });
  assert.deepEqual(shared, { flags: ["box-open"], solved: ["lights"], opened: [], won: true });
  assert.equal(sameShared(shared, { ...shared }), true);
  assert.equal(sameShared(shared, EMPTY_SHARED), false);

  const raw = {
    round: "11111111-1111-4111-8111-111111111111",
    room: "22222222-2222-4222-8222-222222222222",
    code: "ABCDEF",
    me: "p1",
    startedAt: "2026-11-20T10:00:00Z",
    wonAt: null,
    expired: false,
    flags: ["safe-open"],
    solved: [],
    opened: ["safe"],
    players: [{ id: "p1", name: "Anna", seenAt: "2026-11-20T10:01:00Z" }, { id: 2 }],
    news: [{ id: 4, player: "p2", kind: "opened", target: "safe" }, { id: "x" }],
    lastNews: 4,
  };
  const state = parseRoundState(raw)!;
  assert.equal(state.players.length, 1);
  assert.deepEqual(state.news, [{ id: 4, player: "p2", kind: "opened", target: "safe" }]);
  const local = applyEvent(data, startProgress(data), { kind: "solved", puzzle: "lights" }).progress.shared;
  assert.deepEqual(mergeServerShared(data, local, state), { flags: ["safe-open"], solved: ["lights"], opened: ["safe"], won: false });
  assert.equal(parseRoundState(null), null);
  assert.equal(parseRoundState({ ...raw, code: "0" }), null);
  assert.equal(parseRoundState({ ...raw, wonAt: "2026-11-20T10:30:00Z" })!.shared.won, true);
});
