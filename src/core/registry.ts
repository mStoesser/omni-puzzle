import type { AnyPuzzleType } from "./types.ts";

export type Registry = {
  get(id: string): AnyPuzzleType | undefined;
  all(): readonly AnyPuzzleType[];
};

const TYPE_ID = /^[a-z0-9-]{1,32}$/;

export function createRegistry(types: readonly AnyPuzzleType[]): Registry {
  const byId = new Map<string, AnyPuzzleType>();
  for (const type of types) {
    if (!TYPE_ID.test(type.id)) throw new Error(`Invalid puzzle type id: ${type.id}`);
    if (byId.has(type.id)) throw new Error(`Duplicate puzzle type id: ${type.id}`);
    if (!Number.isInteger(type.version) || type.version < 1) {
      throw new Error(`Invalid version for puzzle type ${type.id}`);
    }
    byId.set(type.id, type);
  }
  const all = [...byId.values()];
  return {
    get: (id) => byId.get(id),
    all: () => all,
  };
}
