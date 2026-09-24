import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { eventsRepository } from "../repositories/eventsRepository";
import type { EventFilters, EventSummary, Paginated } from "../types/event";

const PAGE_SIZE = 6;

function filtersFromParams(params: URLSearchParams): EventFilters {
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  return {
    query: params.get("q") ?? undefined,
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

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      setStatus(targetPage === 1 ? "loading" : "loading-more");
      try {
        const data = await eventsRepository.listEvents({ ...filters, page: targetPage, pageSize: PAGE_SIZE });
        setResult(data);
        setAccumulated((prev) => (replace ? data.items : [...prev, ...data.items]));
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    },
    // filters is re-created each render from searchParams, so depend on its serialized form
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filters)]
  );

  useEffect(() => {
    setPage(1);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const loadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    load(next, false);
  }, [page, load]);

  const updateFilters = useCallback(
    (patch: Partial<EventFilters>) => {
      const next = new URLSearchParams(searchParams);
      const apply = (key: string, value: string | number | undefined) => {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      };
      if ("query" in patch) apply("q", patch.query);
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
