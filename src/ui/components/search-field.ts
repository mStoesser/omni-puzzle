import { html, nothing } from "lit-html";
import { SEARCH } from "../../core/gallery.ts";
import { icon } from "../icons.ts";

export type SearchFieldOptions = {
  id: string;
  label: string; // accessible name; the placeholder is only a hint
  placeholder: string;
  value: string;
  /** While typing (the caller debounces if it asks the server). */
  onInput?(value: string): void;
  /** Enter or the search key on the phone keyboard. */
  onSubmit?(value: string): void;
  extraClass?: string;
};

/**
 * Search box (M37): a form with role="search" and a native search input. The value is set as an attribute, not as a
 * property, so a render while typing never overwrites what the user is entering.
 */
export function searchField(o: SearchFieldOptions) {
  return html`<form
    class="search-field ${o.extraClass ?? ""}"
    role="search"
    @submit=${(e: SubmitEvent) => {
      e.preventDefault();
      const input = (e.currentTarget as HTMLFormElement).elements.namedItem("q") as HTMLInputElement;
      o.onSubmit?.(input.value);
      input.blur(); // closes the phone keyboard
    }}
  >
    <label class="visually-hidden" for=${o.id}>${o.label}</label>
    ${icon("search", 18)}
    <input
      id=${o.id}
      name="q"
      type="search"
      value=${o.value}
      maxlength=${SEARCH.maxLength}
      placeholder=${o.placeholder}
      autocomplete="off"
      enterkeyhint="search"
      @input=${o.onInput ? (e: Event) => o.onInput!((e.target as HTMLInputElement).value) : nothing}
    />
  </form>`;
}
