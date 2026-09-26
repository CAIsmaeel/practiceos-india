import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Sidebar } from "../components/Sidebar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error as Error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try refreshing or go home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Try again
          </button>
          <a href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Firmora — Practice Management for CA Firms" },
      { name: "description", content: "Manage clients, engagements, deadlines and tasks — built for Indian CA firms." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppLayout() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const pathname = router.state.location.pathname;
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setChecking(false);
      if (!session) router.navigate({ to: "/login" });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session && router.state.location.pathname !== "/login") router.navigate({ to: "/login" });
    });
    return () => subscription.unsubscribe();
  }, [isLoginPage]);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("firm_name, logo_url").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 30_000,
    enabled: !!session,
  });

  const firmName = settings?.firm_name || "CA Practice Manager";
  const logoUrl = (settings as any)?.logo_url ?? null;

  // ✅ Dynamic favicon — logo set hone par browser tab mein dikhega
    // Favicon — session aur logo ke hisaab se set/reset
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (session && logoUrl) {
      link.href = logoUrl;
      link.type = "image/png";
    } else {
      link.href = "/favicon.ico";
      link.type = "image/x-icon";
    }
  }, [logoUrl, session]);

  if (isLoginPage) return <Outlet />;

  if (checking) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sidebar-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background md:pl-64">
      <Sidebar
        firmName={firmName}
        onLogout={async () => {
        await supabase.auth.signOut();
        // Favicon reset on logout
        const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (link) link.href = "/favicon.ico";
        router.navigate({ to: "/login" });
        }}
      />
      <main className="p-4 md:p-8">
        <Outlet />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout />
    </QueryClientProvider>
  );
}
