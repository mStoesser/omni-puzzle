/**
 * Ref callback that opens a <dialog> as modal: `<dialog ${ref(showModal)}>`.
 * lit-html calls refs before a new template is inserted into the document; showModal needs it connected.
 */
export function showModal(element?: Element) {
  if (!(element instanceof HTMLDialogElement)) return;
  queueMicrotask(() => {
    if (element.isConnected && !element.open) element.showModal();
  });
}
