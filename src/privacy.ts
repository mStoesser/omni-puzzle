// Operator settings for the privacy policy (shown at #/datenschutz, texts in src/i18n/de.ts under privacy*).
// The deploy workflow (scripts/check-legal.ts) refuses to publish until the text has been reviewed, and with a
// production backend also until the mail provider is filled in.
export const privacy = {
  // Name and seat of the SMTP provider that sends account mails (M9), e.g. "Beispiel GmbH, Berlin".
  mailProvider: "Brevo (Sendinblue SAS, Paris, Frankreich)",
  updated: "2026-11-01", // date shown as "Stand"; update with every change of the text
  // Set to true after checking the text and the facts in it yourself. This is a draft, not legal advice.
  reviewed: true,
};

export function privacyComplete(withBackend: boolean): boolean {
  return privacy.reviewed && (!withBackend || privacy.mailProvider.trim() !== "");
}
