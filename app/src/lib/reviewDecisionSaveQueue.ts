export type ReviewDecisionSaveQueueOptions<T> = {
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
  save: (outputPath: string, value: T) => Promise<unknown>;
  onError?: (error: unknown, outputPath: string) => void;
  isTerminalError?: (error: unknown, outputPath: string) => boolean;
  setTimer?: (callback: () => void, delayMs: number) => number;
  clearTimer?: (timerId: number) => void;
};

type PendingValue<T> = {
  sequence: number;
  generation: number;
  value: T;
};

type SaveEntry<T> = {
  latestSequence: number;
  pending: PendingValue<T> | null;
  retryIndex: number;
  tail: Promise<void>;
  timerId: number | null;
  generation: number;
};

export type ReviewDecisionSaveQueue<T> = {
  schedule: (outputPath: string, value: T) => void;
  flush: (outputPath: string) => Promise<void>;
  flushAll: () => Promise<void>;
  pendingCount: (outputPath?: string) => number;
};

/**
 * Debounces review-decision writes independently for every output document and
 * serializes writes for the same document. Sequence numbers prevent an older,
 * failed request from being retried after a newer snapshot has already queued.
 */
export function createReviewDecisionSaveQueue<T>(
  options: ReviewDecisionSaveQueueOptions<T>,
): ReviewDecisionSaveQueue<T> {
  const debounceMs = Math.max(0, options.debounceMs ?? 500);
  const retryDelaysMs = options.retryDelaysMs ?? [750, 2_000];
  const setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((timerId) => globalThis.clearTimeout(timerId));
  const entries = new Map<string, SaveEntry<T>>();

  function getEntry(outputPath: string): SaveEntry<T> {
    const current = entries.get(outputPath);
    if (current) return current;
    const created: SaveEntry<T> = {
      latestSequence: 0,
      pending: null,
      retryIndex: 0,
      tail: Promise.resolve(),
      timerId: null,
      generation: 0,
    };
    entries.set(outputPath, created);
    return created;
  }

  function arm(outputPath: string, entry: SaveEntry<T>, delayMs: number) {
    if (entry.timerId !== null) clearTimer(entry.timerId);
    entry.timerId = setTimer(() => {
      entry.timerId = null;
      void flush(outputPath);
    }, Math.max(0, delayMs));
  }

  function schedule(outputPath: string, value: T) {
    if (!outputPath) return;
    const entry = getEntry(outputPath);
    entry.latestSequence += 1;
    entry.pending = { sequence: entry.latestSequence, generation: entry.generation, value };
    entry.retryIndex = 0;
    arm(outputPath, entry, debounceMs);
  }

  async function flush(outputPath: string): Promise<void> {
    const entry = entries.get(outputPath);
    if (!entry) return;
    if (entry.timerId !== null) {
      clearTimer(entry.timerId);
      entry.timerId = null;
    }
    const snapshot = entry.pending;
    if (!snapshot) {
      await entry.tail;
      return;
    }
    entry.pending = null;

    entry.tail = entry.tail.then(async () => {
      if (snapshot.generation !== entry.generation) return;
      try {
        await options.save(outputPath, snapshot.value);
        if (snapshot.sequence === entry.latestSequence) entry.retryIndex = 0;
      } catch (error) {
        options.onError?.(error, outputPath);
        if (options.isTerminalError?.(error, outputPath)) {
          // A CAS conflict invalidates the entire queued generation. Snapshots
          // already chained behind this one were prepared against the same old
          // candidate and must never be replayed after a refresh.
          entry.generation += 1;
          entry.pending = null;
          entry.retryIndex = 0;
          if (entry.timerId !== null) {
            clearTimer(entry.timerId);
            entry.timerId = null;
          }
          return;
        }
        // A complete decision snapshot supersedes all older snapshots. Never
        // retry an old failure after a newer write has been scheduled.
        if (snapshot.sequence !== entry.latestSequence) return;
        if (!entry.pending || entry.pending.sequence <= snapshot.sequence) {
          entry.pending = snapshot;
        }
        const retryDelay = retryDelaysMs[entry.retryIndex];
        if (retryDelay !== undefined) {
          entry.retryIndex += 1;
          arm(outputPath, entry, retryDelay);
        }
      }
    });
    await entry.tail;
  }

  async function flushAll(): Promise<void> {
    await Promise.all([...entries.keys()].map((outputPath) => flush(outputPath)));
  }

  function pendingCount(outputPath?: string): number {
    if (outputPath) {
      const entry = entries.get(outputPath);
      return entry && (entry.pending || entry.timerId !== null) ? 1 : 0;
    }
    let count = 0;
    for (const entry of entries.values()) {
      if (entry.pending || entry.timerId !== null) count += 1;
    }
    return count;
  }

  return { schedule, flush, flushAll, pendingCount };
}
