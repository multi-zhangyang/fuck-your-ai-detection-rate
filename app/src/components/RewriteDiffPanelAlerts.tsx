import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DIFF_STREAM_LABEL } from "@/lib/resultCardHelpers";
import {
  REWRITE_DIFF_PANEL_COPY as T,
  formatRewriteDiffStreamBanner,
} from "@/lib/rewriteDiffPanelViewModel";

export function RewriteDiffPanelStreamBanner({
  streamChunkId,
  streamChars,
}: {
  streamChunkId?: string | null;
  streamChars?: number | null;
}) {
  if (!streamChunkId) {
    return null;
  }
  const streamBanner = formatRewriteDiffStreamBanner({ streamChunkId, streamChars });
  return (
    <Alert className="mx-3 mt-3 shrink-0">
      <AlertTitle>{DIFF_STREAM_LABEL} {streamBanner.titleSuffix}</AlertTitle>
      <AlertDescription className="text-xs leading-5">
        {streamBanner.statusText}
      </AlertDescription>
    </Alert>
  );
}

export function RewriteDiffPanelFailedAlert({ failedCount }: { failedCount: number }) {
  if (!failedCount) {
    return null;
  }
  return (
    <Alert variant="destructive" className="mx-3 mt-3 shrink-0">
      <AlertTitle>{T.failedChunks} {failedCount}</AlertTitle>
    </Alert>
  );
}
