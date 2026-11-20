import { html, nothing } from "lit-html";
import type { SVGTemplateResult } from "lit-html";
import { t } from "../../i18n/t.ts";
import { icon } from "../icons.ts";

/**
 * A card for an escape room (M44 on the home page, M46 in the gallery): its first picture in 16:9, the title, a line
 * below and how far this device got. `picture`: a built-in drawing, the address of an own picture, or nothing yet.
 */
export type RoomCardModel = {
  href: string;
  title: string;
  picture: SVGTemplateResult | { url: string } | null;
  sub?: string;
  status: "new" | "started" | "won";
};

export function roomCard(room: RoomCardModel) {
  const { picture } = room;
  return html`<a class="room-card" href=${room.href}>
    ${picture === null
      ? html`<span class="room-card-picture"></span>`
      : "url" in picture
        ? html`<img class="room-card-picture" src=${picture.url} alt="" loading="lazy" />`
        : html`<svg class="room-card-picture" viewBox="0 0 1600 900" aria-hidden="true">${picture}</svg>`}
    <span class="room-card-body">
      <span class="room-card-text">
        <span class="room-card-title">${room.title}</span>
        ${room.sub ? html`<span class="room-card-sub">${room.sub}</span>` : nothing}
      </span>
      ${room.status === "new"
        ? nothing
        : room.status === "won"
          ? html`<span class="badge badge-solved">${icon("check", 14)}${t("homeRoomWon")}</span>`
          : html`<span class="badge badge-draft">${t("homeRoomStarted")}</span>`}
    </span>
  </a>`;
}
