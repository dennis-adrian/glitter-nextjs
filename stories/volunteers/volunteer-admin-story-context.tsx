import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { ReactNode } from "react";
import { fn } from "storybook/test";

import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import {
  ScreenBarProvider,
  ScreenTitle,
  usePublishScreenContext,
} from "@/app/components/navbar/screen-bar";
import type { RawSearchParams } from "@/app/lib/credits/admin-definitions";

// Storybook's app-router mock lacks the layout context Next 16.4's
// `useRouter` reads (see stories/home/home-history-card.stories.tsx).
const storyRouter = {
  back: fn(),
  forward: fn(),
  refresh: fn(),
  push: fn(),
  replace: fn(),
  prefetch: fn(),
} as unknown as React.ContextType<typeof AppRouterContext>;

const viewer = { role: "admin", status: "verified" } as const;

/** What the navbar publishes in the app, so PageBreadcrumbs has a trail. */
function Navbar() {
  usePublishScreenContext({
    viewer,
    tabs: buildAppNavigation({ viewer }).tabs,
    activeFestival: null,
  });
  return null;
}

/**
 * The volunteer admin pages' app context in a story: the router, the URL
 * (path and query, which the server table reads) and the navbar's screen
 * context with an optional title.
 */
export function VolunteerAdminStoryContext({
  path,
  searchParams = {},
  title,
  children,
}: {
  path: string;
  searchParams?: RawSearchParams;
  title?: string;
  children: ReactNode;
}) {
  const query = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : value ? [value] : []).map(
        (item): [string, string] => [key, item],
      ),
    ),
  );
  return (
    <AppRouterContext.Provider value={storyRouter}>
      <PathnameContext.Provider value={path}>
        <SearchParamsContext.Provider value={query}>
          <ScreenBarProvider>
            <Navbar />
            {title && <ScreenTitle title={title} />}
            {children}
          </ScreenBarProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
