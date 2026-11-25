"use client";

import { useParams, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

import VolunteerReviewList from "@/app/components/volunteers/admin/tasks/review-list";
import {
  VolunteerReviewDetailSkeleton,
  VolunteerTaskSkeleton,
} from "@/app/components/volunteers/admin/tasks/task-skeletons";
import { cn } from "@/app/lib/utils";
import type { VolunteerReviewItem } from "@/app/lib/volunteers/admin-task-queries";
import {
  parseVolunteerReviewSort,
  type VolunteerReviewSort,
} from "@/app/lib/volunteers/admin-tasks";
import { pageFrame } from "@/app/components/volunteers/admin/tasks/task-frame";

type SoloMemory = { set: (solo: boolean) => void; get: () => boolean };

function createSoloMemory(): SoloMemory {
  let solo = false;
  return {
    set: (value) => {
      solo = value;
    },
    get: () => solo,
  };
}

/** Whether the screen on show takes the whole page, for the next loading. */
const SoloMemory = createContext<SoloMemory | null>(null);

/**
 * Marks a screen under Revisar's layout that takes the whole page (an
 * accepted person, "Turnos que puede"): the header and the list step aside
 * and the frame around it lays nothing out.
 */
export function VolunteerSoloScreen({ children }: { children: ReactNode }) {
  const memory = useContext(SoloMemory);
  useLayoutEffect(() => {
    memory?.set(true);
    return () => memory?.set(false);
  }, [memory]);
  return (
    <div data-volunteer-solo="" className="contents">
      {children}
    </div>
  );
}

/** Links between accepted people carry where they came from. */
const PERSON_PARAMS = ["grupo", "desde", "asignar"];

/**
 * Loading under Revisar's layout keeps the shape of the screen it replaces:
 * the open application beside the list, or a whole-page screen (an accepted
 * person and the next one) without them.
 */
export function VolunteerReviewLoading() {
  const memory = useContext(SoloMemory);
  const searchParams = useSearchParams();
  const solo =
    memory?.get() || PERSON_PARAMS.some((param) => searchParams.has(param));
  return solo ? (
    <VolunteerSoloScreen>
      <VolunteerTaskSkeleton />
    </VolunteerSoloScreen>
  ) : (
    <VolunteerReviewDetailSkeleton />
  );
}

/** Whole-page screens step out of the frame: no box, no header, no list. */
const soloContents = "group-has-[[data-volunteer-solo]]/review:contents";
const soloHidden = "group-has-[[data-volunteer-solo]]/review:hidden";

/**
 * Revisar's frame, kept by its layout across the applications opened from
 * the list: only `children` (the open application) changes, so the list keeps
 * what it loaded and where it was scrolled. The sort and the open
 * application come from the URL. On phones the list is the index and an
 * application has the whole screen.
 */
export function ReviewFrame({
  festivalId,
  header,
  noCall,
  batches,
  total,
  shiftTotal,
  children,
}: {
  festivalId: number;
  header: ReactNode;
  /** In place of the list and the application, before the call exists. */
  noCall: ReactNode;
  /** The first batch of the list in every sort. */
  batches: Record<VolunteerReviewSort, VolunteerReviewItem[]> | null;
  total: number;
  shiftTotal: number;
  children: ReactNode;
}) {
  const applicationId = useParams<{ applicationId?: string }>()?.applicationId;
  const sort = parseVolunteerReviewSort(
    useSearchParams().get("orden") ?? undefined,
  );
  const openId =
    applicationId === undefined ? undefined : Number(applicationId);
  const listOnPhone = openId === undefined;
  const items = batches?.[sort] ?? [];
  const [memory] = useState(createSoloMemory);

  return (
    <SoloMemory.Provider value={memory}>
      <div
        className={cn(
          pageFrame,
          "group/review",
          !listOnPhone && "max-lg:p-0 max-lg:pb-0",
          "has-[[data-volunteer-solo]]:contents",
        )}
      >
        <div className={cn(!listOnPhone && "max-lg:hidden", soloHidden)}>
          {header}
        </div>
        {!batches ? (
          <>
            <div className={soloHidden}>{noCall}</div>
            <div className="hidden group-has-[[data-volunteer-solo]]/review:contents">
              {children}
            </div>
          </>
        ) : (
          <div
            className={cn(
              "flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start",
              soloContents,
            )}
          >
            <VolunteerReviewList
              festivalId={festivalId}
              sort={sort}
              items={items}
              total={total}
              shiftTotal={shiftTotal}
              // At the index, the first one is open beside the list.
              selectedId={openId ?? items[0]?.id}
              className={cn(
                "lg:w-90 lg:shrink-0",
                !listOnPhone && "max-lg:hidden",
                soloHidden,
              )}
            />
            <div
              className={cn(
                "min-w-0 flex-1",
                listOnPhone && "max-lg:hidden",
                soloContents,
              )}
            >
              {children}
            </div>
          </div>
        )}
      </div>
    </SoloMemory.Provider>
  );
}
