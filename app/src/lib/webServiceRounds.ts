import { webServiceRoundIoApi } from "@/lib/webServiceRoundIoApi";
import { webServiceRunRoundApi } from "@/lib/webServiceRunRoundApi";

export const webServiceRoundsApi = {
  ...webServiceRunRoundApi,
  ...webServiceRoundIoApi,
};
