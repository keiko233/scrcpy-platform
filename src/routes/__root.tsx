import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "tanstack-theme-kit";

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";

// import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <h1 className="text-3xl font-bold">404 - Not Found</h1>
      </div>
    );
  },
});

function RootComponent() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ToastProvider>
        <AnchoredToastProvider>
          <Outlet />
        </AnchoredToastProvider>
      </ToastProvider>

      <TanStackDevtools
        config={{
          position: "bottom-right",
        }}
        plugins={[
          {
            name: "Tanstack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
          // TanStackQueryDevtools,
        ]}
      />
    </ThemeProvider>
  );
}
