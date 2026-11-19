import type { PuzzleDocument, PuzzleLang } from "../core/types.ts";
import { lightsOutExamples } from "../puzzles/lightsout/examples.ts";
import { rushHourExamples } from "../puzzles/rushhour/examples.ts";
import type { EscapeRoomDocument } from "./logic.ts";

// A small escape room for tests and the player: two scenes, a puzzle with a code for a lock, a puzzle that turns on a
// switch, a hint text and a door that only opens later. Written once per language, like the quiz examples (M28); the
// home page shows the one in the app's language. The tap areas fit the built-in pictures "study" and "hall".

function embedded(doc: PuzzleDocument, title: string, result?: string): PuzzleDocument {
  const copy = structuredClone(doc);
  copy.meta.title = title;
  if (result) copy.meta.result = result;
  return copy;
}

type Texts = {
  title: string;
  intro: string;
  victory: string;
  flags: [safe: string, box: string];
  study: { name: string; text: string; hints: [string, string]; spots: [desk: string, painting: string, safe: string, door: string] };
  hall: { name: string; text: string; hints: [string]; spots: [back: string, box: string, exit: string] };
  puzzles: [lights: string, parking: string];
  lock: { name: string; prompt: string };
  views: [painting: string, doorLocked: string, safeOpen: string, exitLocked: string, key: string];
  viewNames: [painting: string, doorLocked: string, safeOpen: string, exitLocked: string, key: string];
};

const TEXTS: Record<PuzzleLang, Texts> = {
  de: {
    title: "Das Arbeitszimmer",
    intro: "Die Tür ist hinter dir ins Schloss gefallen. Irgendwo hier muss der Schlüssel sein.",
    victory: "Frische Luft! Du bist entkommen.",
    flags: ["Tresor offen", "Kiste offen"],
    study: {
      name: "Arbeitszimmer",
      text: "Ein Schreibtisch, ein Bild an der Wand, ein kleiner Tresor.",
      hints: ["Auf dem Schreibtisch liegt ein Lichterspiel.", "Die Zahlen aus dem Lichterspiel öffnen den Tresor."],
      spots: ["Schreibtisch", "Bild an der Wand", "Tresor", "Tür"],
    },
    hall: {
      name: "Flur",
      text: "Ein langer Flur. Am Ende die Haustür, davor eine Kiste.",
      hints: ["Die Kiste klemmt. Vielleicht hilft das Rangierspiel auf dem Deckel."],
      spots: ["Zurück ins Arbeitszimmer", "Kiste", "Haustür"],
    },
    puzzles: ["Lichterspiel", "Rangierspiel"],
    lock: { name: "Tresor", prompt: "Drei Ziffern" },
    views: [
      "Ein Leuchtturm bei Nacht. Auf der Rückseite steht: „Erst Licht aus, dann Tür auf.“",
      "Abgeschlossen. Der Schlüssel steckt nicht.",
      "Im Tresor liegt der Zimmerschlüssel. Du schließt die Tür auf.",
      "Die Haustür ist zu. Ein Schlüssel muss her.",
      "Die Kiste springt auf. Darin: der Haustürschlüssel!",
    ],
    viewNames: ["Bild", "Tür verschlossen", "Tresor offen", "Haustür verschlossen", "Schlüssel"],
  },
  en: {
    title: "The Study",
    intro: "The door has slammed shut behind you. The key must be somewhere in here.",
    victory: "Fresh air! You escaped.",
    flags: ["Safe open", "Box open"],
    study: {
      name: "Study",
      text: "A desk, a painting on the wall, a small safe.",
      hints: ["There is a game of lights on the desk.", "The numbers from the game of lights open the safe."],
      spots: ["Desk", "Painting on the wall", "Safe", "Door"],
    },
    hall: {
      name: "Hallway",
      text: "A long hallway. At its end the front door, a box in front of it.",
      hints: ["The box is stuck. Maybe the parking puzzle on its lid helps."],
      spots: ["Back to the study", "Box", "Front door"],
    },
    puzzles: ["Game of lights", "Parking puzzle"],
    lock: { name: "Safe", prompt: "Three digits" },
    views: [
      "A lighthouse at night. On the back it says: “Lights out first, then the door.”",
      "Locked. The key is not in it.",
      "The key to the room lies in the safe. You unlock the door.",
      "The front door is shut. You need a key.",
      "The box pops open. Inside: the key to the front door!",
    ],
    viewNames: ["Painting", "Door locked", "Safe open", "Front door locked", "Key"],
  },
};

function study(lang: PuzzleLang): EscapeRoomDocument {
  const x = TEXTS[lang];
  return {
    format: 1,
    kind: "escape-room",
    version: 1,
    meta: { title: x.title, createdAt: "2026-11-19T00:00:00.000Z", lang, verified: true },
    data: {
      start: "study",
      intro: x.intro,
      victory: x.victory,
      flags: [
        { id: "safe-open", name: x.flags[0] },
        { id: "box-open", name: x.flags[1] },
      ],
      scenes: [
        {
          id: "study",
          name: x.study.name,
          image: { builtin: "study" },
          text: x.study.text,
          hints: x.study.hints,
          spots: [
            { id: "desk", label: x.study.spots[0], rect: { x: 8, y: 55, w: 30, h: 25 }, when: [], action: [{ do: "puzzle", puzzle: "lights" }] },
            { id: "painting", label: x.study.spots[1], rect: { x: 45, y: 15, w: 18, h: 25 }, when: [], action: [{ do: "view", view: "painting" }] },
            { id: "safe", label: x.study.spots[2], rect: { x: 70, y: 50, w: 12, h: 18 }, when: [], action: [{ do: "lock", lock: "safe" }] },
            { id: "door-locked", label: x.study.spots[3], rect: { x: 86, y: 20, w: 12, h: 60 }, when: [{ flag: "safe-open", on: false }], action: [{ do: "view", view: "door-locked" }] },
            { id: "door", label: x.study.spots[3], rect: { x: 86, y: 20, w: 12, h: 60 }, when: [{ flag: "safe-open", on: true }], action: [{ do: "go", scene: "hall" }] },
          ],
        },
        {
          id: "hall",
          name: x.hall.name,
          image: { builtin: "hall" },
          text: x.hall.text,
          hints: x.hall.hints,
          spots: [
            { id: "back", label: x.hall.spots[0], rect: { x: 0, y: 30, w: 10, h: 50 }, when: [], action: [{ do: "go", scene: "study" }] },
            { id: "box", label: x.hall.spots[1], rect: { x: 35, y: 60, w: 25, h: 25 }, when: [], action: [{ do: "puzzle", puzzle: "parking" }] },
            { id: "exit-locked", label: x.hall.spots[2], rect: { x: 75, y: 15, w: 15, h: 70 }, when: [{ flag: "box-open", on: false }], action: [{ do: "view", view: "exit-locked" }] },
            { id: "exit", label: x.hall.spots[2], rect: { x: 75, y: 15, w: 15, h: 70 }, when: [{ flag: "box-open", on: true }], action: [{ do: "win" }] },
          ],
        },
      ],
      puzzles: [
        { id: "lights", name: x.puzzles[0], doc: embedded(lightsOutExamples[0]!.doc, x.puzzles[0], "3 1 4"), onSolve: [] },
        { id: "parking", name: x.puzzles[1], doc: embedded(rushHourExamples[0]!.doc, x.puzzles[1]), onSolve: [{ do: "flag", flag: "box-open" }, { do: "view", view: "key" }] },
      ],
      locks: [{ id: "safe", name: x.lock.name, prompt: x.lock.prompt, code: "314", onOpen: [{ do: "flag", flag: "safe-open" }, { do: "view", view: "safe-open" }] }],
      views: [
        { id: "painting", name: x.viewNames[0], text: x.views[0] },
        { id: "door-locked", name: x.viewNames[1], text: x.views[1] },
        { id: "safe-open", name: x.viewNames[2], text: x.views[2] },
        { id: "exit-locked", name: x.viewNames[3], text: x.views[3] },
        { id: "key", name: x.viewNames[4], text: x.views[4] },
      ],
    },
  };
}

export type EscapeRoomExample = { id: string; lang: PuzzleLang; doc: EscapeRoomDocument };

/** One per language; the first is German (tests use it). */
export const escapeRoomExamples: readonly EscapeRoomExample[] = [
  { id: "room-study", lang: "de", doc: study("de") },
  { id: "room-study-en", lang: "en", doc: study("en") },
];

export function escapeRoomExample(id: string): EscapeRoomExample | undefined {
  return escapeRoomExamples.find((e) => e.id === id);
}
