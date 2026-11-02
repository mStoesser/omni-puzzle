import type { AnyPuzzleRules, AnyPuzzleType } from "./types.ts";

/** Full puzzle types in the app; only their rules on the server. */
export type Registry<T extends AnyPuzzleRules = AnyPuzzleType> = {
  get(id: string): T | undefined;
  all(): readonly T[];
};

const TYPE_ID = /^[a-z0-9-]{1,32}$/;

export function createRegistry<T extends AnyPuzzleRules>(types: readonly T[]): Registry<T> {
  const byId = new Map<string, T>();
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
