// Escape rooms (M44): everything the app needs only when a room is shown, loaded with `import()` so the main bundle
// stays small (the view, the built-in pictures, the room logic and the examples).

export { roomView } from "./views/room.ts";
export { builtinPicture, coverPicture, ROOM_VIEWBOX } from "./room-images.ts";
export { applyEvent, loadEscapeRoom } from "../rooms/logic.ts";
export { escapeRoomExample, escapeRoomExamples } from "../rooms/examples.ts";
export { newRoomSave, parseRoomSave, roomContentKey, roomSaveKey, roomStarted } from "../rooms/save.ts";
export { roomEditorView } from "./views/room-editor.ts";
export { addPuzzle, draftProblems, newEscapeRoom, roomImageKeys } from "../rooms/edit.ts";
export { checkEscapeRoom } from "../rooms/check.ts";
export { cropTo16x9 } from "./image-encode.ts";
export { prepareRoomPublication } from "../rooms/publish.ts";
