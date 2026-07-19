export type ModelConfigOperationGeneration = {
  nextGeneration: number;
  latestGeneration: number;
};

export function createModelConfigOperationGeneration(): ModelConfigOperationGeneration {
  return { nextGeneration: 0, latestGeneration: 0 };
}

export function beginModelConfigOperation(registry: ModelConfigOperationGeneration): number {
  const generation = ++registry.nextGeneration;
  registry.latestGeneration = generation;
  return generation;
}

export function isCurrentModelConfigOperation(
  registry: ModelConfigOperationGeneration,
  generation: number,
): boolean {
  return registry.latestGeneration === generation;
}
