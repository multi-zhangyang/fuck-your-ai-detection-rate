/**
 * Coordinates asynchronous prompt-route changes. The ref lives for the
 * lifetime of the App, while handlers themselves are recreated on renders.
 */
export type PromptRouteRequestRef = { current: number };

export type PromptRouteRequestCoordinator = {
  begin: () => number;
  isCurrent: (generation: number) => boolean;
  guard: (generation: number) => () => boolean;
};

export function createPromptRouteRequestCoordinator(
  ref: PromptRouteRequestRef = { current: 0 },
): PromptRouteRequestCoordinator {
  return {
    begin: () => {
      ref.current += 1;
      return ref.current;
    },
    isCurrent: (generation) => generation === ref.current,
    guard: (generation) => () => generation === ref.current,
  };
}
