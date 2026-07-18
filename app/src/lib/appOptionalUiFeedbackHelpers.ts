export type OptionalUiFeedbackInput = {
  notice?: string;
  setError?: string;
  runtimeStep?: string;
  clearMessages?: boolean;
};

export function planOptionalUiFeedbackApply(input: OptionalUiFeedbackInput): {
  clearMessages: boolean;
  notice?: string;
  setError?: string;
  runtimeStep?: string;
} {
  return {
    clearMessages: Boolean(input.clearMessages),
    notice: input.notice,
    setError: input.setError,
    runtimeStep: input.runtimeStep,
  };
}
