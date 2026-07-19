import type { HistoryArtifactGovernanceMode } from "@/types/app";

type RequestChannel = "artifact" | "maintenance" | "backups";

type RequestState = {
  artifact: number;
  maintenance: number;
  backups: number;
  artifactMode?: HistoryArtifactGovernanceMode;
};

// React state setters are stable for the lifetime of an App instance. Using a
// setter as the key keeps request generations across handler re-creation on
// every render, while isolating tests and multiple mounted app instances.
const stateByKey = new WeakMap<object, RequestState>();

function getState(key: object): RequestState {
  const existing = stateByKey.get(key);
  if (existing) return existing;
  const created: RequestState = { artifact: 0, maintenance: 0, backups: 0 };
  stateByKey.set(key, created);
  return created;
}

export function beginHistoryRequest(key: object, channel: RequestChannel): number {
  const state = getState(key);
  state[channel] += 1;
  return state[channel];
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
