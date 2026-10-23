import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { eventsRepository } from "../repositories/eventsRepository";
import type { EventFilters, EventSummary, Paginated } from "../types/event";

const PAGE_SIZE = 6;

function filtersFromParams(params: URLSearchParams): EventFilters {
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  return {
    query: params.get("q") ?? undefined,
    programmeSlug: params.get("programme") ?? undefined,
    categorySlug: params.get("category") ?? undefined,
    town: params.get("town") ?? undefined,
    month: params.get("month") ?? undefined,
    minPriceMinor: minPrice ? Number(minPrice) * 100 : undefined,
    maxPriceMinor: maxPrice ? Number(maxPrice) * 100 : undefined,
    sort: (params.get("sort") as EventFilters["sort"]) ?? "date_asc",
  };
}

export function useEventDiscovery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<EventSummary> | null>(null);
  const [accumulated, setAccumulated] = useState<EventSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "loading-more" | "error" | "ready">("idle");
  const requestSequence = useRef(0);
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async (targetPage: number, replace: boolean) => {
    const requestId = ++requestSequence.current;
    setStatus(targetPage === 1 ? "loading" : "loading-more");
    try {
      const data = await eventsRepository.listEvents({ ...filters, page: targetPage, pageSize: PAGE_SIZE });
      if (requestId !== requestSequence.current) return;
      setResult(data);
      setAccumulated((previous) => (replace ? data.items : [...previous, ...data.items]));
      if (!replace) setPage(targetPage);
      setStatus("ready");
    } catch {
      if (requestId !== requestSequence.current) return;
      setStatus("error");
    }
  // `filterKey` intentionally serializes the URL-derived filter values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    setPage(1);
    void load(1, true);
    return () => {
      // Invalidate in-flight requests on filter changes and unmount.
      requestSequence.current += 1;
    };
  }, [load]);

  const loadMore = useCallback(() => {
    if (status === "loading" || status === "loading-more" || !result || page >= result.totalPages) return;
    const next = page + 1;
    void load(next, false);
  }, [page, load, result, status]);

  const updateFilters = useCallback(
    (patch: Partial<EventFilters>) => {
      const next = new URLSearchParams(searchParams);
      const apply = (key: string, value: string | number | undefined) => {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      };
      if ("query" in patch) apply("q", patch.query);
      if ("programmeSlug" in patch) apply("programme", patch.programmeSlug);
      if ("categorySlug" in patch) apply("category", patch.categorySlug);
      if ("town" in patch) apply("town", patch.town);
      if ("month" in patch) apply("month", patch.month);
      if ("minPriceMinor" in patch) apply("minPrice", patch.minPriceMinor !== undefined ? patch.minPriceMinor / 100 : undefined);
      if ("maxPriceMinor" in patch) apply("maxPrice", patch.maxPriceMinor !== undefined ? patch.maxPriceMinor / 100 : undefined);
      if ("sort" in patch) apply("sort", patch.sort);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => setSearchParams(new URLSearchParams(), { replace: true }), [setSearchParams]);

  const hasMore = result ? page < result.totalPages : false;

  return { filters, updateFilters, clearFilters, events: accumulated, status, hasMore, loadMore, totalItems: result?.totalItems ?? 0 };
}
