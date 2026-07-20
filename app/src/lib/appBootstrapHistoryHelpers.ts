import type { AppService } from "@/lib/appService";
import { stringifyError } from "@/lib/errorText";
import {
  beginHistoryRequest,
  finishHistoryRequest,
  isCurrentHistoryRequest,
  waitForLatestHistoryRequest,
} from "@/lib/historyRequestGeneration";
import type {
  HistoryArtifactQueryResponse,
  HistoryDocumentSummary,
} from "@/types/app";

export async function bootstrapAppHistories(input: {
  service: AppService;
  cancelled: () => boolean;
  setError: (message: string) => void;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryArtifactQuery: (query: HistoryArtifactQueryResponse | null) => void;
  setHistoryListReady: (ready: boolean) => void;
}): Promise<void> {
  const listRequestKey = input.setHistoryItems as unknown as object;
  const artifactRequestKey = input.setHistoryArtifactQuery as unknown as object;
  const listGeneration = beginHistoryRequest(listRequestKey, "list");
  const artifactGeneration = beginHistoryRequest(artifactRequestKey, "artifact");
  try {
    try {
      const result = await input.service.listDocumentHistories();
      if (
        !input.cancelled()
        && isCurrentHistoryRequest(listRequestKey, "list", listGeneration)
      ) {
        input.setHistoryItems(result.items);
      }
    } finally {
      finishHistoryRequest(listRequestKey, "list", listGeneration);
    }
    try {
      const artifactResult = await input.service.queryHistoryArtifacts({ exists: "missing", limit: 8 });
      if (
        !input.cancelled()
        && isCurrentHistoryRequest(artifactRequestKey, "artifact", artifactGeneration)
      ) {
        input.setHistoryArtifactQuery(artifactResult);
      }
    } catch {
      if (
        !input.cancelled()
        && isCurrentHistoryRequest(artifactRequestKey, "artifact", artifactGeneration)
      ) {
        input.setHistoryArtifactQuery(null);
      }
    } finally {
      finishHistoryRequest(artifactRequestKey, "artifact", artifactGeneration);
    }
  } catch (appError) {
    finishHistoryRequest(artifactRequestKey, "artifact", artifactGeneration);
    if (
      !input.cancelled()
      && isCurrentHistoryRequest(listRequestKey, "list", listGeneration)
    ) {
      input.setError(stringifyError(appError));
    }
  } finally {
    if (!input.cancelled()) {
      await waitForLatestHistoryRequest(listRequestKey, "list");
      if (!input.cancelled()) {
        input.setHistoryListReady(true);
      }
    }
  }
}
