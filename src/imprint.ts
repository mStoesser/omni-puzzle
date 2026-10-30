// Imprint data (shown at #/impressum). Fill in before publishing; the deploy workflow refuses empty fields.
export const imprint = {
  name: "Michael Stößer",
  street: "Leienfelsstr. 21b",
  city: "81243 München", // postal code and city
  email: "michael@stits.dev",
} as const;

export function imprintComplete(): boolean {
  return Object.values(imprint).every((value) => value.trim() !== "");
}
