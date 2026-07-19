import { createModelCatalogConfigHandlers } from "@/lib/modelCatalogConfigHandlers";
import type { ModelCatalogHandlersDeps } from "@/lib/modelCatalogHandlerTypes";
import { createModelCatalogListHandlers } from "@/lib/modelCatalogListHandlers";
import { createModelCatalogProviderHandlers } from "@/lib/modelCatalogProviderHandlers";

export type {
  CollectProviderModelPatchesInput,
  ModelCatalogConfigHandlers,
  ModelCatalogHandlersDeps,
  ModelCatalogListHandlers,
  ModelCatalogProviderHandlers,
  OptionalUiFeedback,
  ProviderModelPatchCollection,
  TaskTicket,
} from "@/lib/modelCatalogHandlerTypes";

export function createModelCatalogHandlers(deps: ModelCatalogHandlersDeps) {
  const catalog = createModelCatalogListHandlers(deps);
  const providers = createModelCatalogProviderHandlers(deps, catalog);
  const config = createModelCatalogConfigHandlers(deps, catalog);
  return {
    ...catalog,
    ...providers,
    ...config,
  };
}
