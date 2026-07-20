import type { HistoryArtifactGovernanceMode } from "@/types/app";

type RequestChannel = "list" | "orphan" | "artifact" | "maintenance" | "backups" | "check";

type ActiveRequest = {
  generation: number;
  settled: Promise<void>;
  resolveSettled: () => void;
};

type RequestState = {
  list: number;
  orphan: number;
  artifact: number;
  maintenance: number;
  backups: number;
  check: number;
  active: Partial<Record<RequestChannel, ActiveRequest>>;
  artifactMode?: HistoryArtifactGovernanceMode;
};

// React state setters are stable for the lifetime of an App instance. Using a
// setter as the key keeps request generations across handler re-creation on
// every render, while isolating tests and multiple mounted app instances.
const stateByKey = new WeakMap<object, RequestState>();

function getState(key: object): RequestState {
  const existing = stateByKey.get(key);
  if (existing) return existing;
  const created: RequestState = {
    list: 0,
    orphan: 0,
    artifact: 0,
    maintenance: 0,
    backups: 0,
    check: 0,
    active: {},
  };
  stateByKey.set(key, created);
  return created;
}

export function beginHistoryRequest(key: object, channel: RequestChannel): number {
  const state = getState(key);
  // Wake waiters for the superseded request so they can follow the new owner.
  state.active[channel]?.resolveSettled();
  state[channel] += 1;
  let resolveSettled: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  state.active[channel] = {
    generation: state[channel],
    settled,
    resolveSettled,
  };
  return state[channel];
}

export function finishHistoryRequest(
  key: object,
  channel: RequestChannel,
  generation: number,
): void {
  const state = getState(key);
  const active = state.active[channel];
  if (!active || active.generation !== generation) return;
  delete state.active[channel];
  active.resolveSettled();
}

/**
 * Invalidate an in-flight channel when a state-changing operation makes its
 * result obsolete, without starting a replacement network request.
 */
export function invalidateHistoryRequest(key: object, channel: RequestChannel): void {
  const generation = beginHistoryRequest(key, channel);
  finishHistoryRequest(key, channel, generation);
}

export async function waitForLatestHistoryRequest(
  key: object,
  channel: RequestChannel,
): Promise<number> {
  while (true) {
    const state = getState(key);
    const generation = state[channel];
    const active = state.active[channel];
    if (!active || active.generation !== generation) return generation;
    await active.settled;
    const latest = getState(key);
    if (latest[channel] === generation && !latest.active[channel]) return generation;
  }
}

export function isCurrentHistoryRequest(
  key: object,
  channel: RequestChannel,
  generation: number,
): boolean {
  return getState(key)[channel] === generation;
}

export function setCurrentHistoryArtifactMode(
  key: object,
  mode: HistoryArtifactGovernanceMode,
): void {
  getState(key).artifactMode = mode;
}

export function getCurrentHistoryArtifactMode(
  key: object,
  fallback: HistoryArtifactGovernanceMode,
): HistoryArtifactGovernanceMode {
  return getState(key).artifactMode ?? fallback;
}
