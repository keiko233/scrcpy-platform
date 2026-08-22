import { createFileRoute } from "@tanstack/react-router";

import { PairDeviceRoute } from "./_modules/pair-device-route";

export const Route = createFileRoute("/(device)/pair/")({
  component: PairDeviceRoute,
});
