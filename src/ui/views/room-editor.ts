import { html, nothing } from "lit-html";
import type { TemplateResult } from "lit-html";
import { PUZZLE_LANGS } from "../../core/types.ts";
import type { ImageSource, PuzzleLang } from "../../core/types.ts";
import * as edit from "../../rooms/edit.ts";
import type { DraftProblem } from "../../rooms/edit.ts";
import type { RoomCheck, RoomProblem } from "../../rooms/check.ts";
import { BUILTIN_IMAGES, ROOM_LIMITS } from "../../rooms/logic.ts";
import type { Condition, Effect, EscapeRoomData, EscapeRoomDocument, EscapeRoomMeta, ImageRef, Rect, Scene, Spot } from "../../rooms/logic.ts";
import { LANG_NAMES, t, tn } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { iconButton, segment, sheet } from "../components/ui.ts";
import { publishDialog } from "../components/publish-dialog.ts";
import type { PublishDialogActions, PublishDialogModel } from "../components/publish-dialog.ts";
import { shareDialog } from "../components/share-dialog.ts";
import type { ShareDialogActions, ShareDialogModel, SharePublish } from "../components/share-dialog.ts";
import { icon } from "../icons.ts";
import { drawnPicture, ROOM_VIEWBOX } from "../room-images.ts";
import * as compose from "../../rooms/compose.ts";
import type { ColorId, Composition, ItemPart, SurfaceSlot } from "../../rooms/compose.ts";
import { composedPicture, itemPreview } from "../room-parts.ts";

export type RoomEditorSection = "scenes" | "puzzles" | "locks" | "views" | "flags" | "story";

/** M49: what dragging on a built picture changes, its tap areas or its items. */
export type StageLayer = "spots" | "items";

/** The selected item of a built picture; `owner` is "scene:<id>" or "view:<id>". */
export type SelectedItem = { owner: string; index: number };

/** A library puzzle that can be copied into the room. */
export type PickablePuzzle = { id: string; title: string; typeName: MessageKey };

export type RoomEditorModel = {
  doc: EscapeRoomDocument;
  verified: boolean; // won by the creator in test play from the start, with exactly this data
  section: RoomEditorSection;
  scene: string; // selected scene
  spot: string | null; // selected tap area in that scene
  layer: StageLayer;
  item: SelectedItem | null;
  problems: readonly DraftProblem[]; // what the draft still lacks
  check: RoomCheck | null; // null while there are draft problems
  picker: readonly PickablePuzzle[] | null; // the puzzle picker is open
  images: ImageSource;
  typeName(typeId: string): string; // a puzzle type's name in the UI language
  /** M46: the share sheet (link and gallery) and the publish dialog. */
  share: ShareDialogModel | null;
  sharePublish: SharePublish;
  publish: PublishDialogModel | null;
};

export type RoomEditorActions = {
  setMeta(change: Partial<EscapeRoomMeta>): void;
  /** Every change of the room's data goes through a pure function of rooms/edit.ts. */
  change(update: (data: EscapeRoomData) => EscapeRoomData): void;
  setSection(section: RoomEditorSection): void;
  select(scene: string, spot: string | null): void;
  setLayer(layer: StageLayer): void;
  selectItem(owner: string, index: number | null): void;
  /** Stores an own picture and returns its key; `crop` = cut to 16:9 (scenes). Rejects (with a notice) on failure. */
  uploadImage(file: File, crop: boolean): Promise<string>;
  openPicker(): void;
  closePicker(): void;
  pickPuzzle(libraryId: string): void;
  testPlay(fromScene: string | null): void;
  openShare(): void;
  share: ShareDialogActions;
  publish: PublishDialogActions;
};

const SECTIONS: readonly { id: RoomEditorSection; label: MessageKey }[] = [
  { id: "scenes", label: "roomEdScenes" },
  { id: "puzzles", label: "roomEdPuzzles" },
  { id: "locks", label: "roomEdLocks" },
  { id: "views", label: "roomEdViews" },
  { id: "flags", label: "roomEdFlags" },
  { id: "story", label: "roomEdStory" },
];

const IMAGE_NAMES: Record<(typeof BUILTIN_IMAGES)[number], MessageKey> = {
  study: "roomImageStudy",
  hall: "roomImageHall",
  cellar: "roomImageCellar",
  lab: "roomImageLab",
};

const SLOT_NAMES: Record<SurfaceSlot, MessageKey> = {
  wall: "roomSlotWall",
  floor: "roomSlotFloor",
  ceiling: "roomSlotCeiling",
  left: "roomSlotLeft",
  right: "roomSlotRight",
};

const PART_NAMES: Record<string, MessageKey> = {
  "wall:plaster": "roomPartPlaster",
  "wall:panels": "roomPartPanels",
  "wall:bricks": "roomPartBricks",
  "wall:tiles": "roomPartTiles",
  "floor:boards": "roomPartBoards",
  "floor:checker": "roomPartChecker",
  "floor:flagstones": "roomPartFlagstones",
  "ceiling:plain": "roomPartCeilingPlain",
  "ceiling:beams": "roomPartBeams",
  "side:plain": "roomPartSidePlain",
  "side:window": "roomPartSideWindow",
};

const ITEM_NAMES: Record<ItemPart, MessageKey> = {
  desk: "roomItemDesk",
  showcase: "roomItemShowcase",
  bookshelf: "roomItemBookshelf",
  safe: "roomItemSafe",
  door: "roomItemDoor",
  chest: "roomItemChest",
  painting: "roomItemPainting",
  lamp: "roomItemLamp",
  plant: "roomItemPlant",
  clock: "roomItemClock",
  window: "roomItemWindow",
  barrel: "roomItemBarrel",
  rug: "roomItemRug",
};

const COLOR_NAMES: Record<ColorId, MessageKey> = {
  slate: "roomColorSlate",
  stone: "roomColorStone",
  sand: "roomColorSand",
  cream: "roomColorCream",
  white: "roomColorWhite",
  brick: "roomColorBrick",
  wood: "roomColorWood",
  walnut: "roomColorWalnut",
  green: "roomColorGreen",
  teal: "roomColorTeal",
  blue: "roomColorBlue",
  red: "roomColorRed",
  gold: "roomColorGold",
  black: "roomColorBlack",
};

const EFFECT_NAMES: Record<Effect["do"], MessageKey> = {
  puzzle: "roomEffectPuzzle",
  lock: "roomEffectLock",
  view: "roomEffectView",
  go: "roomEffectGo",
  flag: "roomEffectFlag",
  win: "roomEffectWin",
};

/**
 * The escape room editor (M45), made for the desktop first (CLAUDE.md rule 6 is waived here on purpose, see the
 * roadmap); playing works on phones. Sections on the left, the selected section in the middle, the check on the right.
 */
export function roomEditorView(model: RoomEditorModel, actions: RoomEditorActions) {
  const { doc } = model;
  const canTest = model.problems.length === 0;
  return html`
    <header class="editor-head room-editor-head">
      ${iconButton({ label: t("editorClose"), icon: "close", href: "#/library" })}
      <div class="editor-title">
        <span class="play-kicker"
          >${t("roomEdKicker")} · <span class="kicker-status">${model.verified ? t("editorReady") : t("libraryDraft")}</span
          ><span class="level-long"> · ${t("editorAutosaved")}</span></span
        >
        <label class="title-input">
          <span class="visually-hidden">${t("editorTitleLabel")}</span>
          <input type="text" maxlength=${ROOM_LIMITS.title} .value=${doc.meta.title} @input=${(e: Event) => actions.setMeta({ title: (e.target as HTMLInputElement).value })} />
          ${icon("pencil", 14)}
        </label>
      </div>
      <div class="editor-mode">
        ${segment(
          t("editorMode"),
          [
            { value: "build", label: t("editorBuild"), icon: "pencil" },
            { value: "test", label: t("testPlay"), icon: "play" },
          ],
          "build",
          (value) => value === "test" && canTest && actions.testPlay(null),
        )}
      </div>
    </header>
    <div class="room-editor">
      <nav class="room-editor-nav" aria-label=${t("roomEdSections")}>
        ${SECTIONS.map(
          (s) => html`<button type="button" class="room-editor-tab" aria-current=${s.id === model.section ? "true" : nothing} @click=${() => actions.setSection(s.id)}>
            ${t(s.label)}<span class="room-editor-count">${count(doc.data, s.id)}</span>
          </button>`,
        )}
      </nav>
      <main class="room-editor-main">${section(model, actions)}</main>
      <aside class="room-editor-check" aria-labelledby="room-check-title">${checkPanel(model, actions)}</aside>
    </div>
    ${model.picker ? pickerSheet(model.picker, actions) : nothing}
    ${model.share ? shareDialog(model.share, actions.share, model.sharePublish) : nothing}
    ${model.publish ? publishDialog(model.publish, actions.publish) : nothing}
  `;
}

function count(data: EscapeRoomData, s: RoomEditorSection): string | number {
  switch (s) {
    case "scenes":
      return data.scenes.length;
    case "puzzles":
      return data.puzzles.length;
    case "locks":
      return data.locks.length;
    case "views":
      return data.views.length;
    case "flags":
      return data.flags.length;
    case "story":
      return "";
  }
}

function section(model: RoomEditorModel, actions: RoomEditorActions) {
  switch (model.section) {
    case "scenes":
      return scenesSection(model, actions);
    case "puzzles":
      return puzzlesSection(model, actions);
    case "locks":
      return locksSection(model, actions);
    case "views":
      return viewsSection(model, actions);
    case "flags":
      return flagsSection(model, actions);
    case "story":
      return storySection(model, actions);
  }
}

// --- Small form helpers ---

function textField(label: string, value: string, max: number, onInput: (value: string) => void, options: { rows?: number; hint?: string; mono?: boolean } = {}) {
  const input = (e: Event) => onInput((e.target as HTMLInputElement | HTMLTextAreaElement).value);
  return html`<label class="field">
    <span>${label}</span>
    ${options.rows
      ? html`<textarea rows=${options.rows} maxlength=${max} .value=${value} @input=${input}></textarea>`
      : html`<input type="text" class=${options.mono ? "mono" : ""} maxlength=${max} .value=${value} @input=${input} />`}
    ${options.hint ? html`<span class="hint">${options.hint}</span>` : nothing}
  </label>`;
}

function removeButton(label: string, onClick: () => void) {
  return html`<button type="button" class="secondary danger room-ed-remove" @click=${onClick}>${icon("trash", 16)}${label}</button>`;
}

function confirmRemove(name: string, run: () => void) {
  if (confirm(t("roomEdConfirmRemove", { name: name || t("untitled") }))) run();
}

/** A picture: built in, own (uploaded) or – where allowed – none. */
function imagePicker(label: string, value: ImageRef | undefined, allowNone: boolean, actions: RoomEditorActions, set: (image: ImageRef | undefined) => void) {
  const crop = !allowNone; // scene pictures (no "none") are 16:9; pictures in views keep their shape
  const current = value === undefined ? "" : "builtin" in value ? `builtin:${value.builtin}` : "compose" in value ? "compose" : `key:${value.key}`;
  return html`<div class="field room-ed-image">
    <label>
      <span>${label}</span>
      <select
        @change=${(e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v === "") set(undefined);
          else if (v.startsWith("builtin:")) set({ builtin: v.slice(8) as (typeof BUILTIN_IMAGES)[number] });
          else if (v === "compose" && !(value && "compose" in value)) set({ compose: compose.newComposition() });
        }}
      >
        ${allowNone ? html`<option value="" ?selected=${current === ""}>${t("roomEdNoImage")}</option>` : nothing}
        ${BUILTIN_IMAGES.map((id) => html`<option value="builtin:${id}" ?selected=${current === `builtin:${id}`}>${t(IMAGE_NAMES[id])}</option>`)}
        <option value="compose" ?selected=${current === "compose"}>${t("roomEdComposeImage")}</option>
        ${value && "key" in value ? html`<option value=${current} selected>${t("roomEdOwnImage")}</option>` : nothing}
      </select>
    </label>
    <label class="button secondary room-ed-upload">
      ${icon("plus", 16)}${t("roomEdUpload")}
      <input
        type="file"
        accept="image/*"
        class="visually-hidden"
        @change=${async (e: Event) => {
          const input = e.target as HTMLInputElement;
          const file = input.files?.[0];
          input.value = "";
          if (!file) return;
          try {
            set({ key: await actions.uploadImage(file, crop) });
          } catch {
            // the notice is shown by the app
          }
        }}
      />
    </label>
  </div>`;
}

function picture(ref: ImageRef, images: ImageSource) {
  if (!("key" in ref)) return html`<svg class="room-picture" viewBox=${ROOM_VIEWBOX} aria-hidden="true">${drawnPicture(ref)}</svg>`;
  const url = images.url(ref.key);
  return url && url !== "loading" ? html`<img class="room-picture" src=${url} alt="" />` : html`<span class="room-picture room-picture-missing"></span>`;
}

// --- Built pictures (M49) ---

const SLOTS: readonly SurfaceSlot[] = ["wall", "floor", "ceiling", "left", "right"];

function partName(slot: SurfaceSlot, part: string): string {
  const key = `${slot === "left" || slot === "right" ? "side" : slot}:${part}`;
  return Object.hasOwn(PART_NAMES, key) ? t(PART_NAMES[key]!) : part;
}

function swatches(label: string, value: string, pick: (color: ColorId) => void) {
  return html`<div class="room-ed-swatches" role="group" aria-label=${label}>
    ${compose.COLOR_IDS.map(
      (id) => html`<button
        type="button"
        class="room-ed-swatch"
        style="background:${compose.COLORS[id]}"
        aria-label=${t(COLOR_NAMES[id])}
        title=${t(COLOR_NAMES[id])}
        aria-pressed=${id === value ? "true" : "false"}
        @click=${() => pick(id)}
      ></button>`,
    )}
  </div>`;
}

/** One surface: its parts as small pictures (the room without items), and its color. */
function slotField(slot: SurfaceSlot, c: Composition, set: (f: (c: Composition) => Composition) => void) {
  const current = c[slot];
  const optional = slot === "left" || slot === "right";
  const bare: Composition = { ...c, items: [] };
  return html`<fieldset class="room-ed-slot">
    <legend>${t(SLOT_NAMES[slot])}</legend>
    <div class="room-ed-parts">
      ${optional
        ? html`<button type="button" class="room-ed-part none" aria-pressed=${current ? "false" : "true"} @click=${() => set((x) => compose.setPart(x, slot, null))}>
            ${t("roomEdNoSide")}
          </button>`
        : nothing}
      ${compose.slotParts(slot).map(
        (part) => html`<button
          type="button"
          class="room-ed-part"
          aria-pressed=${current?.part === part ? "true" : "false"}
          aria-label=${partName(slot, part)}
          title=${partName(slot, part)}
          @click=${() => set((x) => compose.setPart(x, slot, part))}
        >
          <svg viewBox=${ROOM_VIEWBOX} aria-hidden="true">${composedPicture(compose.setPart(bare, slot, part))}</svg>
        </button>`,
      )}
    </div>
    ${current ? swatches(t("roomEdColorOf", { name: t(SLOT_NAMES[slot]) }), current.color, (color) => set((x) => compose.setColor(x, slot, color))) : nothing}
  </fieldset>`;
}

/** The parts of a built picture and its items: add, select, color, position, mirror, order, remove. */
function composer(owner: string, c: Composition, model: RoomEditorModel, actions: RoomEditorActions, set: (f: (c: Composition) => Composition) => void) {
  const id = `room-ed-compose-${owner.replace(":", "-")}`;
  const index = model.item?.owner === owner ? model.item.index : null;
  const item = index === null ? undefined : c.items[index];
  const itemName = (part: string) => (Object.hasOwn(ITEM_NAMES, part) ? t(ITEM_NAMES[part as ItemPart]) : part);
  const full = c.items.length >= compose.COMPOSE_LIMITS.items;
  const add = (part: ItemPart) => {
    const added = compose.addItem(c, part);
    if (added.index < 0) return;
    set(() => added.composition);
    actions.selectItem(owner, added.index);
    if (owner.startsWith("scene:")) actions.setLayer("items");
  };
  const reorder = (step: 1 | -1) => {
    const moved = compose.reorderItem(c, index!, step);
    set(() => moved.composition);
    actions.selectItem(owner, moved.index);
  };
  return html`<section class="box room-ed-panel room-ed-composer" aria-labelledby=${id}>
    <h2 id=${id}>${t("roomEdCompose")}</h2>
    <div class="room-ed-slots">${SLOTS.map((slot) => slotField(slot, c, set))}</div>
    <fieldset class="room-ed-slot">
      <legend>${t("roomEdItems")}</legend>
      <div class="room-ed-item-choice" role="group" aria-label=${t("roomEdAddItem")}>
        ${compose.ITEMS.map((part) => {
          const preview = itemPreview(part);
          return html`<button type="button" class="room-ed-part item" ?disabled=${full} aria-label=${t("roomEdAddNamed", { name: itemName(part) })} title=${itemName(part)} @click=${() => add(part)}>
            <svg viewBox=${preview.viewBox} aria-hidden="true">${preview.drawing}</svg>
          </button>`;
        })}
      </div>
      ${full ? html`<p class="hint">${t("roomEdItemsFull", { n: compose.COMPOSE_LIMITS.items })}</p>` : nothing}
      ${c.items.length === 0
        ? html`<p class="hint">${t("roomEdNoItems")}</p>`
        : html`<div class="chips" role="group" aria-label=${t("roomEdItems")}>
            ${c.items.map(
              (it, i) => html`<button type="button" class="chip ${i === index ? "active" : ""}" aria-pressed=${i === index ? "true" : "false"} @click=${() => actions.selectItem(owner, i === index ? null : i)}>
                ${itemName(it.part)}
              </button>`,
            )}
          </div>`}
      ${item
        ? html`<div class="room-ed-item-panel">
            <label class="field">
              <span>${t("roomEdItemPosition", { name: itemName(item.part) })}</span>
              <input type="range" min="0" max="100" step="0.5" .value=${String(item.x)}
                @input=${(e: Event) => set((x) => compose.updateItem(x, index!, { x: Number((e.target as HTMLInputElement).value) }))} />
            </label>
            ${swatches(t("roomEdColorOf", { name: itemName(item.part) }), item.color, (color) => set((x) => compose.updateItem(x, index!, { color })))}
            <div class="room-ed-actions">
              <button type="button" class="secondary compact" aria-pressed=${item.flip ? "true" : "false"} @click=${() => set((x) => compose.updateItem(x, index!, { flip: !item.flip }))}>
                ${icon("rotate", 16)}${t("roomEdFlip")}
              </button>
              <button type="button" class="secondary compact" ?disabled=${index === 0} @click=${() => reorder(-1)}>${t("roomEdToBack")}</button>
              <button type="button" class="secondary compact" ?disabled=${index === c.items.length - 1} @click=${() => reorder(1)}>${t("roomEdToFront")}</button>
              ${removeButton(t("roomEdRemoveItem"), () => {
                set((x) => compose.removeItem(x, index!));
                actions.selectItem(owner, null);
              })}
            </div>
          </div>`
        : nothing}
    </fieldset>
  </section>`;
}

// --- Effects and conditions ---

function targets(data: EscapeRoomData, kind: Effect["do"]): readonly { id: string; name: string }[] {
  switch (kind) {
    case "puzzle":
      return data.puzzles;
    case "lock":
      return data.locks;
    case "view":
      return data.views;
    case "go":
      return data.scenes;
    case "flag":
      return data.flags;
    case "win":
      return [{ id: "", name: "" }];
  }
}

function makeEffect(kind: Effect["do"], target: string): Effect {
  switch (kind) {
    case "puzzle":
      return { do: "puzzle", puzzle: target };
    case "lock":
      return { do: "lock", lock: target };
    case "view":
      return { do: "view", view: target };
    case "go":
      return { do: "go", scene: target };
    case "flag":
      return { do: "flag", flag: target };
    case "win":
      return { do: "win" };
  }
}

function targetOf(effect: Effect): string {
  switch (effect.do) {
    case "puzzle":
      return effect.puzzle;
    case "lock":
      return effect.lock;
    case "view":
      return effect.view;
    case "go":
      return effect.scene;
    case "flag":
      return effect.flag;
    case "win":
      return "";
  }
}

/** What happens: a list of effects; `opening` = a tap area's action (may open puzzles and locks). */
function effectsEditor(label: string, list: readonly Effect[], opening: boolean, data: EscapeRoomData, set: (list: Effect[]) => void) {
  const allowed = edit.allowedEffects(list, opening).filter((kind) => targets(data, kind).length > 0);
  return html`<fieldset class="room-ed-list">
    <legend>${label}</legend>
    ${list.length === 0 ? html`<p class="hint">${t("roomEdNothingYet")}</p>` : nothing}
    ${list.map(
      (effect, i) => html`<div class="room-ed-row">
        <span class="room-ed-kind">${t(EFFECT_NAMES[effect.do])}</span>
        ${effect.do === "win"
          ? html`<span class="room-ed-grow"></span>`
          : html`<select
              class="room-ed-grow"
              aria-label=${t(EFFECT_NAMES[effect.do])}
              @change=${(e: Event) => set(list.map((x, j) => (j === i ? makeEffect(effect.do, (e.target as HTMLSelectElement).value) : x)))}
            >
              ${targets(data, effect.do).map((item) => html`<option value=${item.id} ?selected=${item.id === targetOf(effect)}>${item.name || t("untitled")}</option>`)}
            </select>`}
        ${iconButton({ label: t("roomEdRemoveEffect"), icon: "trash", onClick: () => set(list.filter((_, j) => j !== i)) })}
      </div>`,
    )}
    ${allowed.length > 0
      ? html`<select
          class="room-ed-add"
          aria-label=${t("roomEdAddEffect")}
          @change=${(e: Event) => {
            const select = e.target as HTMLSelectElement;
            const kind = select.value as Effect["do"];
            select.value = "";
            if (kind) set([...list, makeEffect(kind, targets(data, kind)[0]!.id)]);
          }}
        >
          <option value="" selected>${t("roomEdAddEffect")}</option>
          ${allowed.map((kind) => html`<option value=${kind}>${t(EFFECT_NAMES[kind])}</option>`)}
        </select>`
      : nothing}
  </fieldset>`;
}

function conditionsEditor(list: readonly Condition[], data: EscapeRoomData, set: (list: Condition[]) => void) {
  return html`<fieldset class="room-ed-list">
    <legend>${t("roomEdWhen")}</legend>
    ${list.length === 0 ? html`<p class="hint">${t("roomEdAlways")}</p>` : nothing}
    ${list.map(
      (c, i) => html`<div class="room-ed-row">
        <select class="room-ed-grow" aria-label=${t("roomEdFlag")} @change=${(e: Event) => set(list.map((x, j) => (j === i ? { ...x, flag: (e.target as HTMLSelectElement).value } : x)))}>
          ${data.flags.map((f) => html`<option value=${f.id} ?selected=${f.id === c.flag}>${f.name || t("untitled")}</option>`)}
        </select>
        <select aria-label=${t("roomEdFlagState")} @change=${(e: Event) => set(list.map((x, j) => (j === i ? { ...x, on: (e.target as HTMLSelectElement).value === "on" } : x)))}>
          <option value="on" ?selected=${c.on}>${t("roomEdIsOn")}</option>
          <option value="off" ?selected=${!c.on}>${t("roomEdIsOff")}</option>
        </select>
        ${iconButton({ label: t("roomEdRemoveCondition"), icon: "trash", onClick: () => set(list.filter((_, j) => j !== i)) })}
      </div>`,
    )}
    ${data.flags.length === 0
      ? html`<p class="hint">${t("roomEdNoFlags")}</p>`
      : list.length < ROOM_LIMITS.conditions
        ? html`<button type="button" class="secondary compact" @click=${() => set([...list, { flag: data.flags[0]!.id, on: true }])}>${icon("plus", 16)}${t("roomEdAddCondition")}</button>`
        : nothing}
  </fieldset>`;
}

// --- Scenes and tap areas ---

function scenesSection(model: RoomEditorModel, actions: RoomEditorActions) {
  const { data } = model.doc;
  const scene = data.scenes.find((s) => s.id === model.scene) ?? data.scenes[0]!;
  const spot = scene.spots.find((s) => s.id === model.spot) ?? null;
  const change = (update: (d: EscapeRoomData) => EscapeRoomData) => actions.change(update);
  return html`
    <div class="room-ed-scenes chips" role="group" aria-label=${t("roomEdScenes")}>
      ${data.scenes.map(
        (s) => html`<button type="button" class="chip ${s.id === scene.id ? "active" : ""}" aria-pressed=${s.id === scene.id ? "true" : "false"} @click=${() => actions.select(s.id, null)}>
          ${s.id === data.start ? html`${icon("flag", 14)}` : nothing}${s.name || t("untitled")}
        </button>`,
      )}
      ${data.scenes.length < ROOM_LIMITS.scenes
        ? html`<button
            type="button"
            class="chip"
            @click=${() => {
              let id = "";
              change((d) => {
                const added = edit.addScene(d, t("roomEdNewScene", { n: d.scenes.length + 1 }));
                id = added.id;
                return added.data;
              });
              if (id) actions.select(id, null);
            }}
          >
            ${icon("plus", 14)}${t("roomEdAddScene")}
          </button>`
        : nothing}
    </div>
    ${"compose" in scene.image
      ? html`<div class="room-ed-layer">
          ${segment(
            t("roomEdLayer"),
            [
              { value: "spots" as const, label: t("roomEdLayerSpots") },
              { value: "items" as const, label: t("roomEdLayerItems") },
            ],
            model.layer,
            actions.setLayer,
          )}
          <p class="hint">${t(model.layer === "items" ? "roomEdItemsHint" : "roomEdDrawHint")}</p>
        </div>`
      : html`<p class="hint">${t("roomEdDrawHint")}</p>`}
    ${stage(model, scene, actions)}
    <div class="room-ed-spots chips" role="group" aria-label=${t("roomEdSpots")}>
      ${scene.spots.map(
        (s) => html`<button type="button" class="chip ${s.id === spot?.id ? "active" : ""}" aria-pressed=${s.id === spot?.id ? "true" : "false"} @click=${() => actions.select(scene.id, s.id)}>
          ${s.label || t("untitled")}${s.when.length > 0 ? html` <span class="hint">(${t("roomEdConditional")})</span>` : nothing}
        </button>`,
      )}
    </div>
    <div class="room-ed-columns">
      ${spot ? spotPanel(model, scene, spot, actions) : html`<section class="box room-ed-panel"><p class="hint">${t("roomEdNoSpot")}</p></section>`}
      ${scenePanel(model, scene, actions)}
    </div>
    ${"compose" in scene.image
      ? composer(`scene:${scene.id}`, scene.image.compose, model, actions, (f) => actions.change((d) => composeScene(d, scene.id, f)))
      : nothing}
  `;
}

/** Changes the built picture of a scene, from the current data (dragging sends many changes in a row). */
function composeScene(d: EscapeRoomData, sceneId: string, f: (c: Composition) => Composition): EscapeRoomData {
  const scene = d.scenes.find((s) => s.id === sceneId);
  if (!scene || !("compose" in scene.image)) return d;
  const next = f(scene.image.compose);
  return next === scene.image.compose ? d : edit.updateScene(d, sceneId, { image: { compose: next } });
}

function composeView(d: EscapeRoomData, viewId: string, f: (c: Composition) => Composition): EscapeRoomData {
  const view = d.views.find((v) => v.id === viewId);
  if (!view?.image || !("compose" in view.image)) return d;
  const next = f(view.image.compose);
  return next === view.image.compose ? d : edit.updateView(d, viewId, { image: { compose: next } });
}

type Drag = { mode: "draw" | "move" | "resize"; sceneId: string; spotId: string | null; startX: number; startY: number; rect: Rect; pointer: number };
let drag: Drag | null = null;
/** M49: dragging an item of a built picture sideways. */
let itemDrag: { sceneId: string; index: number; startX: number; x: number; pointer: number } | null = null;
let preview: Rect | null = null;

function percent(e: PointerEvent, stageEl: Element) {
  const box = stageEl.getBoundingClientRect();
  return { x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 };
}

/** The picture with all tap areas: drag on empty space to draw one, drag an area to move it, its corner to resize. */
function stage(model: RoomEditorModel, scene: Scene, actions: RoomEditorActions) {
  const stageOf = (e: Event) => (e.currentTarget as Element).closest(".room-ed-stage")!;
  const built = "compose" in scene.image ? scene.image.compose : null;
  const items = built !== null && model.layer === "items";
  const owner = `scene:${scene.id}`;
  const selectedItem = model.item?.owner === owner ? model.item.index : null;
  const itemDown = (e: PointerEvent, index: number, x: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = stageOf(e);
    itemDrag = { sceneId: scene.id, index, startX: percent(e, el).x, x, pointer: e.pointerId };
    (el as HTMLElement).setPointerCapture(e.pointerId);
    if (index !== selectedItem) actions.selectItem(owner, index);
  };
  const itemKey = (e: KeyboardEvent, index: number, x: number) => {
    const step = e.altKey ? 0.2 : 1;
    const d = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    if (!d) return;
    e.preventDefault();
    actions.change((data) => composeScene(data, scene.id, (c) => compose.updateItem(c, index, { x: x + d })));
  };
  const down = (e: PointerEvent, mode: Drag["mode"], spot: Spot | null) => {
    if (e.button !== 0) return;
    if (items) {
      if (selectedItem !== null) actions.selectItem(owner, null); // a tap on empty space deselects
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const el = stageOf(e);
    const p = percent(e, el);
    drag = { mode, sceneId: scene.id, spotId: spot?.id ?? null, startX: p.x, startY: p.y, rect: spot?.rect ?? { x: p.x, y: p.y, w: 0, h: 0 }, pointer: e.pointerId };
    (el as HTMLElement).setPointerCapture(e.pointerId);
    if (spot) actions.select(scene.id, spot.id);
  };
  const move = (e: PointerEvent) => {
    if (itemDrag && e.pointerId === itemDrag.pointer) {
      const { sceneId, index, startX, x } = itemDrag;
      const to = x + percent(e, e.currentTarget as Element).x - startX;
      actions.change((d) => composeScene(d, sceneId, (c) => compose.updateItem(c, index, { x: to })));
      return;
    }
    if (!drag || e.pointerId !== drag.pointer) return;
    const p = percent(e, e.currentTarget as Element);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.mode === "draw") {
      preview = { x: Math.min(drag.startX, p.x), y: Math.min(drag.startY, p.y), w: Math.abs(dx), h: Math.abs(dy) };
      actions.select(scene.id, null); // re-render with the preview
      return;
    }
    const r = drag.rect;
    const rect = drag.mode === "move" ? { ...r, x: r.x + dx, y: r.y + dy } : { ...r, w: r.w + dx, h: r.h + dy };
    const { sceneId, spotId } = drag;
    actions.change((d) => edit.updateSpot(d, sceneId, spotId!, { rect }));
  };
  const up = (e: PointerEvent) => {
    if (itemDrag && e.pointerId === itemDrag.pointer) itemDrag = null;
    if (!drag || e.pointerId !== drag.pointer) return;
    const done = drag;
    drag = null;
    if (done.mode !== "draw") return;
    const p = percent(e, e.currentTarget as Element);
    preview = null;
    // A plain click on empty space only deselects; a drag of at least a few percent draws an area.
    if (Math.abs(p.x - done.startX) < 2 && Math.abs(p.y - done.startY) < 2) return actions.select(scene.id, null);
    let id = "";
    actions.change((d) => {
      const added = edit.addSpot(d, scene.id, edit.rectBetween(done.startX, done.startY, p.x, p.y), t("roomEdNewSpot", { n: scene.spots.length + 1 }));
      id = added.id;
      return added.data;
    });
    actions.select(scene.id, id || null);
  };
  const key = (e: KeyboardEvent, spot: Spot) => {
    const step = e.altKey ? 0.2 : 1;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const r = spot.rect;
    const rect = e.shiftKey ? { ...r, w: r.w + d[0], h: r.h + d[1] } : { ...r, x: r.x + d[0], y: r.y + d[1] };
    actions.change((data) => edit.updateSpot(data, scene.id, spot.id, { rect }));
  };
  return html`<div class="room-ed-stage-wrap">
    <div
      class="room-ed-stage ${items ? "items" : ""}"
      @pointerdown=${(e: PointerEvent) => down(e, "draw", null)}
      @pointermove=${move}
      @pointerup=${up}
      @pointercancel=${() => ((drag = null), (preview = null), (itemDrag = null))}
    >
      ${picture(scene.image, model.images)}
      ${items
        ? html`${scene.spots.map(
            (s) => html`<div class="room-ed-spot passive" style="left:${s.rect.x}%;top:${s.rect.y}%;width:${s.rect.w}%;height:${s.rect.h}%"></div>`,
          )}
          ${built!.items.map((it, i) => {
            const r = compose.itemRect(it);
            if (!r) return nothing;
            const name = Object.hasOwn(ITEM_NAMES, it.part) ? t(ITEM_NAMES[it.part as ItemPart]) : it.part;
            return html`<div
              class="room-ed-item ${i === selectedItem ? "selected" : ""}"
              style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%"
              tabindex="0"
              role="button"
              aria-label=${t("roomEdItemMove", { name })}
              aria-pressed=${i === selectedItem ? "true" : "false"}
              @pointerdown=${(e: PointerEvent) => itemDown(e, i, it.x)}
              @keydown=${(e: KeyboardEvent) => itemKey(e, i, it.x)}
              @focus=${() => i !== selectedItem && actions.selectItem(owner, i)}
            ></div>`;
          })}`
        : scene.spots.map(
        (s) => html`<div
          class="room-ed-spot ${s.id === model.spot ? "selected" : ""} ${s.when.length > 0 ? "conditional" : ""}"
          style="left:${s.rect.x}%;top:${s.rect.y}%;width:${s.rect.w}%;height:${s.rect.h}%"
          tabindex="0"
          role="button"
          aria-label=${t("roomEdSpotMove", { name: s.label || t("untitled") })}
          aria-pressed=${s.id === model.spot ? "true" : "false"}
          @pointerdown=${(e: PointerEvent) => down(e, "move", s)}
          @keydown=${(e: KeyboardEvent) => key(e, s)}
          @focus=${() => s.id !== model.spot && actions.select(scene.id, s.id)}
        >
          <span class="room-ed-spot-label">${s.label || t("untitled")}</span>
          ${s.id === model.spot ? html`<span class="room-ed-handle" aria-hidden="true" @pointerdown=${(e: PointerEvent) => down(e, "resize", s)}></span>` : nothing}
        </div>`,
          )}
      ${preview ? html`<div class="room-ed-spot preview" style="left:${preview.x}%;top:${preview.y}%;width:${preview.w}%;height:${preview.h}%"></div>` : nothing}
    </div>
  </div>`;
}

function spotPanel(model: RoomEditorModel, scene: Scene, spot: Spot, actions: RoomEditorActions) {
  const { data } = model.doc;
  const set = (change: Partial<Omit<Spot, "id">>) => actions.change((d) => edit.updateSpot(d, scene.id, spot.id, change));
  return html`<section class="box room-ed-panel" aria-labelledby="room-ed-spot-title">
    <h2 id="room-ed-spot-title">${t("roomEdSpot")}</h2>
    ${textField(t("roomEdLabel"), spot.label, ROOM_LIMITS.label, (label) => set({ label }), { hint: t("roomEdLabelHint") })}
    ${effectsEditor(t("roomEdAction"), spot.action, true, data, (action) => set({ action }))}
    ${conditionsEditor(spot.when, data, (when) => set({ when }))}
    <p class="hint">${t("roomEdKeysHint")}</p>
    ${removeButton(t("roomEdRemoveSpot"), () => confirmRemove(spot.label, () => {
      actions.change((d) => edit.removeSpot(d, scene.id, spot.id));
      actions.select(scene.id, null);
    }))}
  </section>`;
}

function scenePanel(model: RoomEditorModel, scene: Scene, actions: RoomEditorActions) {
  const { data } = model.doc;
  const set = (change: Partial<Omit<Scene, "id" | "spots">>) => actions.change((d) => edit.updateScene(d, scene.id, change));
  return html`<section class="box room-ed-panel" aria-labelledby="room-ed-scene-title">
    <h2 id="room-ed-scene-title">${t("roomEdScene")}</h2>
    ${textField(t("roomEdName"), scene.name, ROOM_LIMITS.name, (name) => set({ name }))}
    ${imagePicker(t("roomEdImage"), scene.image, false, actions, (image) => image && set({ image }))}
    <p class="hint">${t("roomEdImageHint")}</p>
    ${textField(t("roomEdSceneText"), scene.text ?? "", ROOM_LIMITS.text, (text) => set({ text: text || undefined }), { rows: 2, hint: t("roomEdSceneTextHint") })}
    <fieldset class="room-ed-list">
      <legend>${t("roomHints")}</legend>
      ${scene.hints.map(
        (hint, i) => html`<div class="room-ed-row">
          <input type="text" class="room-ed-grow" maxlength=${ROOM_LIMITS.hint} aria-label=${t("roomEdHintN", { n: i + 1 })} .value=${hint}
            @input=${(e: Event) => set({ hints: scene.hints.map((h, j) => (j === i ? (e.target as HTMLInputElement).value : h)) })} />
          ${iconButton({ label: t("roomEdRemoveHint"), icon: "trash", onClick: () => set({ hints: scene.hints.filter((_, j) => j !== i) }) })}
        </div>`,
      )}
      ${scene.hints.length < ROOM_LIMITS.hints
        ? html`<button type="button" class="secondary compact" @click=${() => set({ hints: [...scene.hints, ""] })}>${icon("plus", 16)}${t("roomEdAddHint")}</button>`
        : nothing}
    </fieldset>
    <div class="room-ed-actions">
      ${scene.id === data.start
        ? html`<p class="hint">${icon("flag", 14)} ${t("roomEdIsStart")}</p>`
        : html`<button type="button" class="secondary compact" @click=${() => actions.change((d) => ({ ...d, start: scene.id }))}>${icon("flag", 16)}${t("roomEdMakeStart")}</button>`}
      <button type="button" class="secondary compact" ?disabled=${model.problems.length > 0} @click=${() => actions.testPlay(scene.id)}>${icon("play", 16)}${t("roomEdTestHere")}</button>
      ${data.scenes.length > 1
        ? removeButton(t("roomEdRemoveScene"), () => confirmRemove(scene.name, () => {
            actions.change((d) => edit.removeScene(d, scene.id));
            actions.select(data.scenes.find((s) => s.id !== scene.id)!.id, null);
          }))
        : nothing}
    </div>
  </section>`;
}

// --- Puzzles, locks, views, switches ---

function itemList<T extends { id: string; name: string }>(items: readonly T[], empty: MessageKey, render: (item: T) => TemplateResult) {
  return items.length === 0 ? html`<p class="empty">${t(empty)}</p>` : html`<ul class="room-ed-items">${items.map((item) => html`<li class="box room-ed-panel">${render(item)}</li>`)}</ul>`;
}

function puzzlesSection(model: RoomEditorModel, actions: RoomEditorActions) {
  const { data } = model.doc;
  return html`
    <div class="room-ed-section-head">
      <p class="hint">${t("roomEdPuzzlesHint")}</p>
      <button type="button" ?disabled=${data.puzzles.length >= ROOM_LIMITS.puzzles} @click=${actions.openPicker}>${icon("plus", 16)}${t("roomEdAddPuzzle")}</button>
    </div>
    ${itemList(data.puzzles, "roomEdNoPuzzles", (p) => html`
      ${textField(t("roomEdName"), p.name, ROOM_LIMITS.name, (name) => actions.change((d) => edit.renamePuzzle(d, p.id, name)))}
      <p class="hint">${p.doc.meta.title} · ${model.typeName(p.doc.type)}${p.doc.meta.verified ? "" : ` · ${t("libraryDraft")}`}</p>
      ${textField(t("editorResult"), p.doc.meta.result ?? "", 500, (result) => actions.change((d) => edit.setPuzzleResult(d, p.id, result)), { hint: t("roomEdResultHint") })}
      ${effectsEditor(t("roomEdOnSolve"), p.onSolve, false, data, (list) => actions.change((d) => edit.setPuzzleEffects(d, p.id, list)))}
      ${removeButton(t("roomEdRemovePuzzle"), () => confirmRemove(p.name, () => actions.change((d) => edit.removePuzzle(d, p.id))))}
    `)}
  `;
}

function locksSection(model: RoomEditorModel, actions: RoomEditorActions) {
  const { data } = model.doc;
  const add = () => actions.change((d) => edit.addLock(d, t("roomEdNewLock", { n: d.locks.length + 1 })).data);
  return html`
    <div class="room-ed-section-head">
      <p class="hint">${t("roomEdLocksHint")}</p>
      <button type="button" ?disabled=${data.locks.length >= ROOM_LIMITS.locks} @click=${add}>${icon("plus", 16)}${t("roomEdAddLock")}</button>
    </div>
    ${itemList(data.locks, "roomEdNoLocks", (l) => html`
      ${textField(t("roomEdName"), l.name, ROOM_LIMITS.name, (name) => actions.change((d) => edit.updateLock(d, l.id, { name })))}
      ${textField(t("roomEdPrompt"), l.prompt ?? "", ROOM_LIMITS.prompt, (prompt) => actions.change((d) => edit.updateLock(d, l.id, { prompt: prompt || undefined })), { hint: t("roomEdPromptHint") })}
      ${textField(t("roomLockCode"), l.code, ROOM_LIMITS.code, (code) => actions.change((d) => edit.updateLock(d, l.id, { code })), { hint: t("roomEdCodeHint"), mono: true })}
      ${effectsEditor(t("roomEdOnOpen"), l.onOpen, false, data, (onOpen) => actions.change((d) => edit.updateLock(d, l.id, { onOpen })))}
      ${removeButton(t("roomEdRemoveLock"), () => confirmRemove(l.name, () => actions.change((d) => edit.removeLock(d, l.id))))}
    `)}
  `;
}

function viewsSection(model: RoomEditorModel, actions: RoomEditorActions) {
  const { data } = model.doc;
  const add = () => actions.change((d) => edit.addView(d, t("roomEdNewView", { n: d.views.length + 1 })).data);
  return html`
    <div class="room-ed-section-head">
      <p class="hint">${t("roomEdViewsHint")}</p>
      <button type="button" ?disabled=${data.views.length >= ROOM_LIMITS.views} @click=${add}>${icon("plus", 16)}${t("roomEdAddView")}</button>
    </div>
    ${itemList(data.views, "roomEdNoViews", (v) => html`
      ${textField(t("roomEdName"), v.name, ROOM_LIMITS.name, (name) => actions.change((d) => edit.updateView(d, v.id, { name })))}
      ${imagePicker(t("roomEdImage"), v.image, true, actions, (image) => actions.change((d) => edit.updateView(d, v.id, { image })))}
      ${v.image ? html`<div class="room-ed-view-picture">${picture(v.image, model.images)}</div>` : nothing}
      ${v.image && "compose" in v.image
        ? composer(`view:${v.id}`, v.image.compose, model, actions, (f) => actions.change((d) => composeView(d, v.id, f)))
        : nothing}
      ${textField(t("roomEdText"), v.text ?? "", ROOM_LIMITS.text, (text) => actions.change((d) => edit.updateView(d, v.id, { text: text || undefined })), { rows: 3 })}
      ${removeButton(t("roomEdRemoveView"), () => confirmRemove(v.name, () => actions.change((d) => edit.removeView(d, v.id))))}
    `)}
  `;
}

function flagsSection(model: RoomEditorModel, actions: RoomEditorActions) {
  const { data } = model.doc;
  const add = () => actions.change((d) => edit.addFlag(d, t("roomEdNewFlag", { n: d.flags.length + 1 })).data);
  return html`
    <div class="room-ed-section-head">
      <p class="hint">${t("roomEdFlagsHint")}</p>
      <button type="button" ?disabled=${data.flags.length >= ROOM_LIMITS.flags} @click=${add}>${icon("plus", 16)}${t("roomEdAddFlag")}</button>
    </div>
    ${data.flags.length === 0
      ? html`<p class="empty">${t("roomEdNoFlagsYet")}</p>`
      : html`<ul class="room-ed-items">
          ${data.flags.map(
            (f, i) => html`<li class="room-ed-row">
              <input type="text" class="room-ed-grow" maxlength=${ROOM_LIMITS.name} aria-label=${t("roomEdFlagN", { n: i + 1 })} .value=${f.name}
                @input=${(e: Event) => actions.change((d) => edit.renameFlag(d, f.id, (e.target as HTMLInputElement).value))} />
              ${iconButton({ label: t("roomEdRemoveFlag"), icon: "trash", onClick: () => confirmRemove(f.name, () => actions.change((d) => edit.removeFlag(d, f.id))) })}
            </li>`,
          )}
        </ul>`}
  `;
}

function storySection(model: RoomEditorModel, actions: RoomEditorActions) {
  const { doc } = model;
  const { data } = doc;
  return html`<section class="box room-ed-panel">
    ${textField(t("editorDescription"), doc.meta.description ?? "", ROOM_LIMITS.description, (description) => actions.setMeta({ description: description || undefined }), { rows: 2 })}
    <label class="field">
      <span>${t("editorLanguage")}</span>
      <select @change=${(e: Event) => actions.setMeta({ lang: (e.target as HTMLSelectElement).value as PuzzleLang })}>
        ${PUZZLE_LANGS.map((lang) => html`<option value=${lang} lang=${lang} ?selected=${lang === doc.meta.lang}>${LANG_NAMES[lang]}</option>`)}
      </select>
    </label>
    <label class="field">
      <span>${t("roomEdStart")}</span>
      <select @change=${(e: Event) => actions.change((d) => ({ ...d, start: (e.target as HTMLSelectElement).value }))}>
        ${data.scenes.map((s) => html`<option value=${s.id} ?selected=${s.id === data.start}>${s.name || t("untitled")}</option>`)}
      </select>
    </label>
    ${textField(t("roomEdIntro"), data.intro ?? "", ROOM_LIMITS.story, (intro) => actions.change((d) => withText(d, "intro", intro)), { rows: 3, hint: t("roomEdIntroHint") })}
    ${textField(t("roomEdVictory"), data.victory ?? "", ROOM_LIMITS.story, (victory) => actions.change((d) => withText(d, "victory", victory)), { rows: 3 })}
  </section>`;
}

function withText(data: EscapeRoomData, key: "intro" | "victory", value: string): EscapeRoomData {
  const next = { ...data };
  if (value === "") delete next[key];
  else next[key] = value;
  return next;
}

// --- Check panel and puzzle picker ---

function nameOf(data: EscapeRoomData, kind: "scene" | "spot" | "flag" | "lock" | "view" | "puzzle", id: string): string {
  if (kind === "spot") {
    const [sceneId, spotId] = id.split("/");
    const scene = data.scenes.find((s) => s.id === sceneId);
    const spot = scene?.spots.find((s) => s.id === spotId);
    return `${scene?.name || t("untitled")} › ${spot?.label || t("untitled")}`;
  }
  const list = { scene: data.scenes, flag: data.flags, lock: data.locks, view: data.views, puzzle: data.puzzles }[kind];
  return (list as readonly { id: string; name: string }[]).find((x) => x.id === id)?.name || t("untitled");
}

const DRAFT_TEXT: Record<DraftProblem["code"], [MessageKey, "scene" | "spot" | "flag" | "lock" | "view" | "puzzle"]> = {
  "scene-name": ["roomProbSceneName", "scene"],
  "spot-label": ["roomProbSpotLabel", "spot"],
  "spot-action": ["roomProbSpotAction", "spot"],
  "hint-empty": ["roomProbHintEmpty", "scene"],
  "flag-name": ["roomProbFlagName", "flag"],
  "lock-name": ["roomProbLockName", "lock"],
  "lock-code": ["roomProbLockCode", "lock"],
  "view-name": ["roomProbViewName", "view"],
  "view-empty": ["roomProbViewEmpty", "view"],
  "puzzle-name": ["roomProbPuzzleName", "puzzle"],
  "puzzle-invalid": ["roomProbPuzzleInvalid", "puzzle"],
};

const CHECK_TEXT: Record<RoomProblem["code"], [MessageKey, "scene" | "spot" | "flag" | "lock" | "view" | "puzzle" | null]> = {
  "no-win": ["roomCheckNoWin", null],
  unwinnable: ["roomCheckUnwinnable", null],
  aborted: ["roomCheckAborted", null],
  "dead-end": ["roomCheckDeadEnd", null],
  "scene-unreachable": ["roomCheckSceneUnreachable", "scene"],
  "spot-unreachable": ["roomCheckSpotUnreachable", "spot"],
  "puzzle-unreachable": ["roomCheckPuzzleUnreachable", "puzzle"],
  "lock-unreachable": ["roomCheckLockUnreachable", "lock"],
  "view-unreachable": ["roomCheckViewUnreachable", "view"],
  "flag-unused": ["roomCheckFlagUnused", "flag"],
  "puzzle-not-verified": ["roomCheckPuzzleNotVerified", "puzzle"],
  "lock-code-hidden": ["roomCheckLockCodeHidden", "lock"],
};

function checkPanel(model: RoomEditorModel, actions: RoomEditorActions) {
  const { data } = model.doc;
  const { check } = model;
  const status = model.problems.length > 0 ? "draft" : check?.status ?? "draft";
  return html`
    <h2 id="room-check-title">${t("editorCheck")}</h2>
    <p class="room-check-status ${status === "winnable" ? "ok" : status === "draft" ? "" : "problem"}" role="status">
      ${status === "winnable"
        ? html`${icon("check", 18)}${check?.steps !== null && check?.steps !== undefined ? tn("roomCheckWinnableSteps", check.steps) : t("roomCheckWinnable")}`
        : status === "draft"
          ? t("roomCheckDraft")
          : status === "aborted"
            ? t("roomCheckAborted")
            : t("roomCheckUnwinnable")}
    </p>
    <ul class="room-check-list">
      ${model.problems.map((p) => {
        const [key, kind] = DRAFT_TEXT[p.code];
        return html`<li>${t(key, { name: nameOf(data, kind, p.id) })}</li>`;
      })}
      ${(check?.problems ?? [])
        .filter((p) => p.code !== "unwinnable" && p.code !== "aborted")
        .map((p) => {
          const [key, kind] = CHECK_TEXT[p.code];
          return html`<li>${t(key, { name: kind && p.id ? nameOf(data, kind, p.id) : "" })}</li>`;
        })}
    </ul>
    ${model.problems.length === 0 && !model.verified ? html`<p class="editor-hint">${t("roomEdVerifyHint")}</p>` : nothing}
    <button type="button" class="block" ?disabled=${model.problems.length > 0} @click=${() => actions.testPlay(null)}>${icon("play", 18)}${t("testPlay")}</button>
    <button type="button" class="secondary block" ?disabled=${!model.verified} @click=${actions.openShare}>${icon("share", 18)}${t("roomEdShare")}</button>
  `;
}

function pickerSheet(items: readonly PickablePuzzle[], actions: RoomEditorActions) {
  return sheet(
    "room-picker-title",
    actions.closePicker,
    html`<h2 id="room-picker-title" class="sheet-title">${t("roomEdPickTitle")}</h2>
      <p class="hint">${t("roomEdPickHint")}</p>
      ${items.length === 0
        ? html`<p class="empty">${t("roomEdPickEmpty")}</p>`
        : html`<ul class="room-picker">
            ${items.map(
              (item) => html`<li>
                <button type="button" class="secondary block" @click=${() => actions.pickPuzzle(item.id)}>
                  <span>${item.title || t("untitled")}</span><span class="hint">${t(item.typeName)}</span>
                </button>
              </li>`,
            )}
          </ul>`}
      <div class="dialog-actions"><button type="button" class="secondary" @click=${actions.closePicker}>${t("close")}</button></div>`,
  );
}
