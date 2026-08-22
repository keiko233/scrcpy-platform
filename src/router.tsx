import {
  createHashHistory,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./route-tree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    history: createHashHistory(),
    context: {
      queryClient,
    },
    scrollRestoration: true,
    defaultPreload: "intent",
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
