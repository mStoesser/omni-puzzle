import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PIECE_ICONS, isPieceIcon } from "./icon-catalog.ts";

const DIR = new URL("../icons/pieces/", import.meta.url);

// The UI inserts these files as markup (ui/piece-icons.ts), so they may only contain plain shapes:
// no scripts, styles, links, text or own colors. The theme colors them through the classes main and detail.
const ELEMENTS: Record<string, readonly string[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  polygon: ["points"],
  g: ["transform"],
};
const COMMON = ["class", "transform"];
const NUMBER = /^-?\d+(\.\d+)?$/;
const MAX_BYTES = 4096;

test("the catalog lists exactly the icon files", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(files, [...PIECE_ICONS].sort());
  assert.equal(new Set(PIECE_ICONS).size, PIECE_ICONS.length);
  assert.ok(PIECE_ICONS.every((id) => /^[a-z][a-z0-9-]*$/.test(id)));
  assert.ok(isPieceIcon("cat") && !isPieceIcon("unicorn") && !isPieceIcon(3));
});

for (const id of PIECE_ICONS) {
  test(`icon ${id} follows the rules`, () => {
    const text = readFileSync(new URL(`${id}.svg`, DIR), "utf8");
    assert.ok(text.length <= MAX_BYTES, "size");
    const match = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">([\s\S]*)<\/svg>\s*$/.exec(text);
    assert.ok(match, "root element with the shared viewBox");
    const body = match[1]!;
    // Nothing but tags and whitespace (no text, comments or entities).
    assert.equal(body.replace(/<[^>]*>/g, "").trim(), "", "only elements");
    let shapes = 0;
    for (const tag of body.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
      const [, closing, name, attrs] = tag;
      assert.ok(name! in ELEMENTS, `element ${name}`);
      if (closing) continue;
      if (name !== "g") shapes++;
      const allowed = [...ELEMENTS[name!]!, ...COMMON];
      const parsed = [...attrs!.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)];
      assert.equal(attrs!.replace(/\s([a-zA-Z-]+)="[^"]*"/g, "").trim(), "", `attributes of ${name} are name="value"`);
      for (const [, attr, value] of parsed) {
        assert.ok(allowed.includes(attr!), `attribute ${attr} on ${name}`);
        if (attr === "class") assert.ok(value === "main" || value === "detail", `class ${value}`);
        else if (attr === "d") assert.match(value!, /^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/, "path data");
        else if (attr === "points") assert.match(value!, /^[0-9 .,-]+$/, "points");
        else if (attr === "transform") assert.match(value!, /^(translate|rotate|scale)\([0-9 .,-]+\)$/, "transform");
        else assert.match(value!, NUMBER, `${attr} is a number`);
      }
      if (name !== "g") assert.ok(parsed.some(([, attr]) => attr === "class"), `${name} has a color class`);
    }
    assert.ok(shapes > 0 && /class="main"/.test(body), "at least one main shape");
  });
}
