import { createBatchRerunMaterializeHandlers } from "@/lib/batchRerunMaterializeHandlers";
import { createBatchRerunWaitHandlers } from "@/lib/batchRerunWaitHandlers";
import type {
  BatchRerunCoreHandlers,
  BatchRerunHandlersDeps,
} from "@/lib/batchRerunHandlerTypes";

export function createBatchRerunCoreHandlers(deps: BatchRerunHandlersDeps): BatchRerunCoreHandlers {
  const materialize = createBatchRerunMaterializeHandlers(deps);
  const wait = createBatchRerunWaitHandlers(deps, materialize.applyBatchRerunResult);
  return {
    ...materialize,
    ...wait,
  };
}
