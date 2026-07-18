import type { DocumentLoadHandlersDeps } from "@/lib/documentLoadHandlerTypes";
import { createDocumentDiagnosticsHandlers } from "@/lib/documentDiagnosticsHandlers";
import { createDocumentPickHandlers } from "@/lib/documentPickHandlers";

export type {
  DocumentLoadHandlersDeps,
  OptionalUiFeedback,
  TaskPhase,
  TaskTicket,
} from "@/lib/documentLoadHandlerTypes";

export function createDocumentLoadHandlers(deps: DocumentLoadHandlersDeps) {
  return {
    ...createDocumentDiagnosticsHandlers(deps),
    ...createDocumentPickHandlers(deps),
  };
}
