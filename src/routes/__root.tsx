import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { PropsWithChildren } from "react";
import { ThemeProvider } from "tanstack-theme-kit";

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";

// import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

import appCss from "../index.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Android Platform",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <h1 className="text-3xl font-bold">404 - Not Found</h1>
      </div>
    );
  },
});

function RootDocument({ children }: PropsWithChildren) {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>
            <AnchoredToastProvider>{children}</AnchoredToastProvider>
          </ToastProvider>
        </ThemeProvider>

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

        <Scripts />
      </body>
    </html>
  );
}
