// Escape rooms (M44): everything the app needs only when a room is shown, loaded with `import()` so the main bundle
// stays small (the view, the built-in pictures, the room logic and the examples).

export { roomView } from "./views/room.ts";
export { builtinPicture, ROOM_VIEWBOX } from "./room-images.ts";
export { applyEvent, loadEscapeRoom } from "../rooms/logic.ts";
export { escapeRoomExample, escapeRoomExamples } from "../rooms/examples.ts";
export { newRoomSave, parseRoomSave, roomSaveKey, roomStarted } from "../rooms/save.ts";
