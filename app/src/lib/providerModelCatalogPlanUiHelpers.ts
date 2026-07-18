import {
  buildModelCatalogMissingCredentialsFeedback,
  buildModelCatalogSuccessFeedback,
  buildModelCatalogAbortFeedback,
  buildModelCatalogFailureRuntimeStep,
  buildModelCatalogLoadingRuntimeStep,
} from "@/lib/providerModelCatalogPatchHelpers";

export function planModelCatalogMissingCredentialsUi(silent: boolean): {
  clearCatalog: true;
  errorMessage: string;
  setError?: string;
  runtimeStep?: string;
} {
  const feedback = buildModelCatalogMissingCredentialsFeedback();
  if (silent) {
    return {
      clearCatalog: true,
      errorMessage: feedback.message,
    };
  }
  return {
    clearCatalog: true,
    errorMessage: feedback.message,
    setError: feedback.message,
    runtimeStep: feedback.runtimeStep,
  };
}

export function planModelCatalogSuccessUi(silent: boolean, total: number): {
  notice?: string;
  runtimeStep?: string;
} {
  if (silent) {
    return {};
  }
  const success = buildModelCatalogSuccessFeedback(total);
  return {
    notice: success.notice,
    runtimeStep: success.runtimeStep,
  };
}

export function planModelCatalogFailureUi(input: {
  silent: boolean;
  aborted: boolean;
  message: string;
}): {
  errorMessage: string;
  notice?: string;
  setError?: string;
  runtimeStep?: string;
} {
  if (input.aborted) {
    const abort = buildModelCatalogAbortFeedback();
    return {
      errorMessage: "",
      notice: abort.notice,
      runtimeStep: abort.runtimeStep,
    };
  }
  if (input.silent) {
    return {
      errorMessage: input.message,
    };
  }
  return {
    errorMessage: input.message,
    setError: input.message,
    runtimeStep: buildModelCatalogFailureRuntimeStep(),
  };
}

export function planModelCatalogStartUi(silent: boolean): {
  clearMessages: boolean;
  runtimeStep?: string;
} {
  if (silent) {
    return { clearMessages: false };
  }
  return {
    clearMessages: true,
    runtimeStep: buildModelCatalogLoadingRuntimeStep(),
  };
}
