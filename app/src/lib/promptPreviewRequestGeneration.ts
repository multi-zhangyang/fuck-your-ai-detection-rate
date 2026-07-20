/**
 * Owns prompt-library reads and writes across App renders.
 *
 * A read may be superseded by another read or by a mutation.  A mutation is
 * exclusive: while it is in flight no second mutation or read is admitted.
 * This prevents a refresh started before a save/delete from putting an older
 * registry back into the UI after the write has completed.
 */
export type PromptPreviewRequestKind = "read" | "mutation";

export type PromptPreviewRequestRegistry = {
  nextGeneration: number;
  latestGeneration: number;
  activeGeneration: number | null;
  activeKind: PromptPreviewRequestKind | null;
};

export function createPromptPreviewRequestRegistry(): PromptPreviewRequestRegistry {
  return {
    nextGeneration: 0,
    latestGeneration: 0,
    activeGeneration: null,
    activeKind: null,
  };
}

function begin(
  registry: PromptPreviewRequestRegistry,
  kind: PromptPreviewRequestKind,
): number | null {
  if (registry.activeKind === "mutation") return null;
  const generation = ++registry.nextGeneration;
  registry.latestGeneration = generation;
  registry.activeGeneration = generation;
  registry.activeKind = kind;
  return generation;
}

export function beginPromptPreviewRead(registry: PromptPreviewRequestRegistry): number | null {
  return begin(registry, "read");
}

export function beginPromptPreviewMutation(registry: PromptPreviewRequestRegistry): number | null {
  return begin(registry, "mutation");
}

export function isCurrentPromptPreviewRequest(
  registry: PromptPreviewRequestRegistry,
  generation: number,
): boolean {
  return registry.latestGeneration === generation
    && registry.activeGeneration === generation;
}

export function finishPromptPreviewRequest(
  registry: PromptPreviewRequestRegistry,
  generation: number,
): void {
  if (registry.activeGeneration !== generation) return;
  registry.activeGeneration = null;
  registry.activeKind = null;
}

export function isPromptPreviewRequestBusy(registry: PromptPreviewRequestRegistry): boolean {
  return registry.activeGeneration !== null;
}
