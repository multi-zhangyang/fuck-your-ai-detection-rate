import {
  buildRestoredDocumentDiscardNotice,
  buildRestoredDocumentFailureRuntimeStep,
  clearStoredActiveDocument,
} from "@/lib/documentRestoreHelpers";
import { isDiscardableRestoreError } from "@/lib/errorRecovery";
import { stringifyError } from "@/lib/errorText";

export function applyDocumentRestoreFailure(input: {
  appError: unknown;
  taskTicket: number;
  taskTicketRef: { current: number };
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setRuntimeStep: (step: string) => void;
}): void {
  const {
    appError,
    taskTicket,
    taskTicketRef,
    setError,
    setNotice,
    setRuntimeStep,
  } = input;
  if (taskTicket !== taskTicketRef.current) {
    return;
  }
  const message = stringifyError(appError);
  if (isDiscardableRestoreError(message)) {
    setNotice(buildRestoredDocumentDiscardNotice());
  } else {
    setError(message);
  }
  clearStoredActiveDocument();
  setRuntimeStep(buildRestoredDocumentFailureRuntimeStep());
}
