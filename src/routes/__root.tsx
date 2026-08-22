import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { ThemeProvider } from "tanstack-theme-kit";

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n/language";
import { m } from "@/paraglide/messages.js";

// import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <h1 className="text-3xl font-bold">{m.app_not_found_title()}</h1>
      </div>
    );
  },
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <LanguageProvider>
          <ToastProvider>
            <AnchoredToastProvider>
              <Outlet />
            </AnchoredToastProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
