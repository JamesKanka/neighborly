"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SortStatus = "newest" | "available_first" | "checked_out_first" | "inactive_first";

const SORT_OPTIONS: Array<{ value: SortStatus; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "available_first", label: "Available" },
  { value: "checked_out_first", label: "Checked Out" },
  { value: "inactive_first", label: "Inactive" }
];

export function BrowseControls({
  initialSearch,
  initialSort,
  showSearch = true
}: {
  initialSearch: string;
  initialSort: SortStatus;
  showSearch?: boolean;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<SortStatus>(initialSort);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setSort(initialSort);
  }, [initialSort]);

  const currentUrl = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  function buildUrl(nextSearch: string, nextSort: SortStatus) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    const normalized = nextSearch.trim();
    if (normalized) {
      params.set("search", normalized);
    } else {
      params.delete("search");
    }

    if (nextSort === "newest") {
      params.delete("sort_status");
    } else {
      params.set("sort_status", nextSort);
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      const targetUrl = buildUrl(search, sort);
      if (targetUrl !== currentUrl) {
        router.replace(targetUrl, { scroll: false });
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [search, sort, router, currentUrl]);

  function setSortNow(nextSort: SortStatus) {
    setSort(nextSort);
    const targetUrl = buildUrl(search, nextSort);
    if (targetUrl !== currentUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  }

  return (
    <div className="browse-controls">
      {showSearch ? (
        <div className="search-wrap">
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, description, category"
            aria-label="Search items"
          />
          {search ? (
            <button type="button" className="search-clear" onClick={() => setSearch("")}>
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="sort-scroll" role="tablist" aria-label="Sort by status">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={sort === option.value}
            className={sort === option.value ? "sort-chip sort-chip-active" : "sort-chip"}
            onClick={() => setSortNow(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
