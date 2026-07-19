import { buildModelConfigFromProvider } from "@/lib/modelRoute";
import {
  buildProviderModelsAbortedError,
  buildProviderModelsBatchAbortFeedback,
  buildProviderModelsBatchFailureRuntimeStep,
  getProviderConnectionIssue,
} from "@/lib/providerModelCatalogHelpers";
import {
  buildProviderModelsSingleAbortFeedback,
  buildProviderModelsSingleFailureRuntimeStep,
  recordProviderModelsConnectionFailure,
  recordProviderModelsRefreshError,
  recordProviderModelsRefreshSuccess,
} from "@/lib/providerModelRefreshStateHelpers";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export async function refreshOneProviderModelPatch(input: {
  provider: ModelProviderConfig;
  abortController: AbortController;
  providerPatches: Map<string, Partial<ModelProviderConfig>>;
  failures: string[];
  baseConfig: ModelConfig;
  listModels: (config: ModelConfig, signal?: AbortSignal) => Promise<{ models: Array<{ id: string }> }>;
  stringifyError: (error: unknown) => string;
}) {
  if (input.abortController.signal.aborted) {
    throw buildProviderModelsAbortedError();
  }
  const connectionIssue = getProviderConnectionIssue(input.provider);
  if (connectionIssue) {
    return {
      providerPatches: input.providerPatches,
      failures: recordProviderModelsConnectionFailure(input.failures, connectionIssue),
    };
  }
  try {
    const catalog = await input.listModels(
      buildModelConfigFromProvider(input.provider, input.baseConfig),
      input.abortController.signal,
    );
    return {
      providerPatches: recordProviderModelsRefreshSuccess(
        input.providerPatches,
        input.provider,
        catalog.models.map((item) => item.id),
      ),
      failures: input.failures,
    };
  } catch (appError) {
    // An abort must stop the enclosing batch before it persists any snapshot.
    // Treating it as an ordinary provider failure would allow a canceled
    // one-provider batch to continue and save stale state.
    if (input.abortController.signal.aborted) throw appError;
    return {
      providerPatches: input.providerPatches,
      failures: recordProviderModelsRefreshError(
        input.failures,
        input.provider,
        input.stringifyError(appError),
      ),
    };
  }
}

export type ProviderModelsRequestFailurePlan =
  | { kind: "abort"; feedback: { notice: string; runtimeStep: string } }
  | { kind: "error"; error: string; runtimeStep: string };

export function planProviderModelsRequestFailureFeedback(input: {
  aborted: boolean;
  mode: "batch" | "single";
  message: string;
}): ProviderModelsRequestFailurePlan {
  if (input.aborted) {
    return {
      kind: "abort",
      feedback:
        input.mode === "batch"
          ? buildProviderModelsBatchAbortFeedback()
          : buildProviderModelsSingleAbortFeedback(),
    };
  }
  return {
    kind: "error",
    error: input.message,
    runtimeStep:
      input.mode === "batch"
        ? buildProviderModelsBatchFailureRuntimeStep()
        : buildProviderModelsSingleFailureRuntimeStep(),
  };
}

export function materializeProviderModelsRequestFailureFeedback(
  plan: ProviderModelsRequestFailurePlan,
): { notice?: string; setError?: string; runtimeStep?: string } {
  if (plan.kind === "abort") {
    return plan.feedback;
  }
  return {
    setError: plan.error,
    runtimeStep: plan.runtimeStep,
  };
}
