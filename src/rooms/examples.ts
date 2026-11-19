import type { ExampleTitle, PuzzleDocument } from "../core/types.ts";
import { lightsOutExamples } from "../puzzles/lightsout/examples.ts";
import { rushHourExamples } from "../puzzles/rushhour/examples.ts";
import type { EscapeRoomDocument } from "./logic.ts";

// A small escape room for tests and, later, the player (M44): two scenes, a puzzle with a code for a lock, a puzzle
// that turns on a switch, a hint picture and a door that only opens later. The texts are German for now; the built-in
// pictures ("study", "hall") come with M44.

function embedded(doc: PuzzleDocument, result?: string): PuzzleDocument {
  const copy = structuredClone(doc);
  if (result) copy.meta.result = result;
  return copy;
}

const doc: EscapeRoomDocument = {
  format: 1,
  kind: "escape-room",
  version: 1,
  meta: { title: "Das Arbeitszimmer", createdAt: "2026-11-19T00:00:00.000Z", lang: "de", verified: true },
  data: {
    start: "study",
    intro: "Die Tür ist hinter dir ins Schloss gefallen. Irgendwo hier muss der Schlüssel sein.",
    victory: "Frische Luft! Du bist entkommen.",
    flags: [
      { id: "safe-open", name: "Tresor offen" },
      { id: "box-open", name: "Kiste offen" },
    ],
    scenes: [
      {
        id: "study",
        name: "Arbeitszimmer",
        image: { builtin: "study" },
        text: "Ein Schreibtisch, ein Bild an der Wand, ein kleiner Tresor.",
        hints: ["Auf dem Schreibtisch liegt ein Lichterspiel.", "Die Zahlen aus dem Lichterspiel öffnen den Tresor."],
        spots: [
          { id: "desk", label: "Schreibtisch", rect: { x: 8, y: 55, w: 30, h: 25 }, when: [], action: [{ do: "puzzle", puzzle: "lights" }] },
          { id: "painting", label: "Bild an der Wand", rect: { x: 45, y: 15, w: 18, h: 25 }, when: [], action: [{ do: "view", view: "painting" }] },
          { id: "safe", label: "Tresor", rect: { x: 70, y: 50, w: 12, h: 18 }, when: [], action: [{ do: "lock", lock: "safe" }] },
          { id: "door-locked", label: "Tür", rect: { x: 86, y: 20, w: 12, h: 60 }, when: [{ flag: "safe-open", on: false }], action: [{ do: "view", view: "door-locked" }] },
          { id: "door", label: "Tür", rect: { x: 86, y: 20, w: 12, h: 60 }, when: [{ flag: "safe-open", on: true }], action: [{ do: "go", scene: "hall" }] },
        ],
      },
      {
        id: "hall",
        name: "Flur",
        image: { builtin: "hall" },
        text: "Ein langer Flur. Am Ende die Haustür, davor eine Kiste.",
        hints: ["Die Kiste klemmt. Vielleicht hilft das Rangierspiel auf dem Deckel."],
        spots: [
          { id: "back", label: "Zurück ins Arbeitszimmer", rect: { x: 0, y: 30, w: 10, h: 50 }, when: [], action: [{ do: "go", scene: "study" }] },
          { id: "box", label: "Kiste", rect: { x: 35, y: 60, w: 25, h: 25 }, when: [], action: [{ do: "puzzle", puzzle: "parking" }] },
          { id: "exit-locked", label: "Haustür", rect: { x: 75, y: 15, w: 15, h: 70 }, when: [{ flag: "box-open", on: false }], action: [{ do: "view", view: "exit-locked" }] },
          { id: "exit", label: "Haustür", rect: { x: 75, y: 15, w: 15, h: 70 }, when: [{ flag: "box-open", on: true }], action: [{ do: "win" }] },
        ],
      },
    ],
    puzzles: [
      { id: "lights", name: "Lichterspiel", doc: embedded(lightsOutExamples[0]!.doc, "3 1 4"), onSolve: [] },
      { id: "parking", name: "Rangierspiel", doc: embedded(rushHourExamples[0]!.doc), onSolve: [{ do: "flag", flag: "box-open" }, { do: "view", view: "key" }] },
    ],
    locks: [{ id: "safe", name: "Tresor", prompt: "Drei Ziffern", code: "314", onOpen: [{ do: "flag", flag: "safe-open" }, { do: "view", view: "safe-open" }] }],
    views: [
      { id: "painting", name: "Bild", text: "Ein Leuchtturm bei Nacht. Auf der Rückseite steht: „Erst Licht aus, dann Tür auf.“" },
      { id: "door-locked", name: "Tür verschlossen", text: "Abgeschlossen. Der Schlüssel steckt nicht." },
      { id: "safe-open", name: "Tresor offen", text: "Im Tresor liegt der Zimmerschlüssel. Du schließt die Tür auf." },
      { id: "exit-locked", name: "Haustür verschlossen", text: "Die Haustür ist zu. Ein Schlüssel muss her." },
      { id: "key", name: "Schlüssel", text: "Die Kiste springt auf. Darin: der Haustürschlüssel!" },
    ],
  },
};

export const escapeRoomExamples: readonly { id: string; title: ExampleTitle; doc: EscapeRoomDocument }[] = [
  { id: "room-study", title: { de: "Das Arbeitszimmer", en: "The Study" }, doc },
];
