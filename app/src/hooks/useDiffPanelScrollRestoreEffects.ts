import { useEffect, useLayoutEffect, type MutableRefObject } from "react";

import type { DiffFilterMode } from "@/lib/diffFilterModel";
import {
  getDiffScrollTop,
  setDiffScrollTop,
} from "@/lib/diffPanelScrollPositionStore";

export function useDiffPanelScrollRestoreEffects(input: {
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  restoredKeyRef: MutableRefObject<string>;
  previousChunkCountRef: MutableRefObject<number>;
  scrollKey: string;
  shownChunkCount: number;
  filterMode: DiffFilterMode;
}) {
  useLayoutEffect(() => {
    const node = input.scrollRef.current;
    if (!node || !input.shownChunkCount) {
      return;
    }
    if (input.restoredKeyRef.current !== input.scrollKey) {
      node.scrollTop = getDiffScrollTop(input.scrollKey);
      input.restoredKeyRef.current = input.scrollKey;
      input.previousChunkCountRef.current = input.shownChunkCount;
    }
  }, [input.shownChunkCount, input.scrollKey, input.scrollRef, input.restoredKeyRef, input.previousChunkCountRef]);

  useEffect(() => {
    const node = input.scrollRef.current;
    const previousCount = input.previousChunkCountRef.current;
    if (!node || input.restoredKeyRef.current !== input.scrollKey || input.shownChunkCount <= previousCount) {
      input.previousChunkCountRef.current = input.shownChunkCount;
      return;
    }
    if (input.filterMode === "all") {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      setDiffScrollTop(input.scrollKey, node.scrollHeight);
    }
    input.previousChunkCountRef.current = input.shownChunkCount;
  }, [
    input.shownChunkCount,
    input.filterMode,
    input.scrollKey,
    input.scrollRef,
    input.restoredKeyRef,
    input.previousChunkCountRef,
  ]);

  useEffect(() => {
    return () => {
      const node = input.scrollRef.current;
      if (node) {
        setDiffScrollTop(input.scrollKey, node.scrollTop);
      }
    };
  }, [input.scrollKey, input.scrollRef]);
}
