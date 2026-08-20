import { createFileRoute } from "@tanstack/react-router";

import { PairDeviceRoute } from "@/features/workbench/device/pair-device-route";

export const Route = createFileRoute("/(device)/pair/")({
  component: PairDeviceRoute,
});
