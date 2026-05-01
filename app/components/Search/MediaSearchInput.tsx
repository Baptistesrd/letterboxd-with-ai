"use client";
import React, { useState, useEffect, useRef } from "react";

// ─── EXPORTED RAW TYPES (reused by page modals) ───────────────────────────────

export interface OLBook {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];   // e.g. ["/authors/OL23919A"]
  cover_i?: number;
  first_publish_year?: number;
  subject?: string[];
}

export interface MBReleaseGroup {
  id: string;
  title: string;
  "artist-credit": { artist: { id: string; name: string } }[];
  "first-release-date"?: string;
}

// ─── SEARCH RESULT TYPES ──────────────────────────────────────────────────────

export interface BookSearchResult {
  type: "book";
  id: string;        // = OLBook.key
  title: string;
  subtitle: string;  // author
  year?: string;
  cover?: string;    // OL cover S size
  raw: OLBook;
}

export interface AlbumSearchResult {
  type: "album";
  id: string;        // = MBReleaseGroup.id (mbid)
  title: string;
  subtitle: string;  // artist
  year?: string;
  cover?: string;    // CAA front-250
  raw: MBReleaseGroup;
}

export type SearchResult = BookSearchResult | AlbumSearchResult;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Wraps the matched substring in a bold green span. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: "#00e054", fontWeight: 700 }}>
        {text.slice(idx, idx + q.length)}
      </strong>
      {text.slice(idx + q.length)}
    </>
  );
}

/** Thumbnail shown inside each dropdown row. Handles 404 gracefully. */
function Thumb({ item }: { item: SearchResult }) {
  const [failed, setFailed] = useState(false);
  const isBook = item.type === "book";

  return (
    <div
      className={`bg-c-grey flex-shrink-0 overflow-hidden rounded ${
        isBook ? "h-12 w-8" : "h-10 w-10"
      }`}
    >
      {item.cover && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="text-sh-grey flex h-full items-center justify-center text-sm">
          {isBook ? "📖" : "🎵"}
        </div>
      )}
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

interface MediaSearchInputProps {
  placeholder: string;
  onSelect: (item: SearchResult) => void;
  alreadyLoggedIds: string[];
  type: "book" | "album";
}

export function MediaSearchInput({
  placeholder,
  onSelect,
  alreadyLoggedIds,
  type,
}: MediaSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Click outside → close ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Scroll active item into view ─────────────────────────────────────────
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const child = listRef.current.children[activeIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // ── Debounced search (350ms, min 2 chars) ────────────────────────────────
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      setError(null);
      abortRef.current?.abort();
      return;
    }
    const timer = setTimeout(() => performSearch(query), 350);
    return () => clearTimeout(timer);
    // `type` is stable per page but included to satisfy exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type]);

  const performSearch = async (q: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError(null);

    try {
      let mapped: SearchResult[] = [];

      if (type === "book") {
        const res = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,author_key,cover_i,first_publish_year,subject`,
          { signal }
        );
        const data: { docs: OLBook[] } = await res.json();
        const docs = data.docs ?? [];

        // Sort: titles that start with the query float to the top
        const ql = q.toLowerCase();
        docs.sort((a, b) => {
          const aStart = a.title.toLowerCase().startsWith(ql) ? 0 : 1;
          const bStart = b.title.toLowerCase().startsWith(ql) ? 0 : 1;
          return aStart - bStart;
        });

        mapped = docs.map((d): BookSearchResult => ({
          type: "book",
          id: d.key,
          title: d.title,
          subtitle: d.author_name?.[0] ?? "Unknown",
          year: d.first_publish_year?.toString(),
          cover: d.cover_i
            ? `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg`
            : undefined,
          raw: d,
        }));
      } else {
        // MusicBrainz rate limit: 1 req/sec.
        // The 350ms debounce reduces load significantly, but rapid short queries
        // may still occasionally hit the limit — in which case the API returns
        // a 503 and we show a friendly error message.
        const res = await fetch(
          `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(q)}&fmt=json&limit=15&type=album`,
          { signal }
        );
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data: { "release-groups": MBReleaseGroup[] } = await res.json();
        const groups = data["release-groups"] ?? [];

        mapped = groups.map((g): AlbumSearchResult => ({
          type: "album",
          id: g.id,
          title: g.title,
          subtitle: g["artist-credit"]?.[0]?.artist?.name ?? "Unknown",
          year: g["first-release-date"]?.slice(0, 4),
          // CoverArt Archive: front-250 — handled gracefully in <Thumb>
          cover: `https://coverartarchive.org/release-group/${g.id}/front-250`,
          raw: g,
        }));
      }

      if (!signal.aborted) {
        setResults(mapped);
        setOpen(true);
        setActiveIndex(-1);
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error("MediaSearchInput error:", err);
      setError("Search failed — please try again.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        if (!open) return;
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        if (!open) return;
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (!open) return;
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        setResults([]);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelect = (item: SearchResult) => {
    if (alreadyLoggedIds.includes(item.id)) return; // already logged — no-op
    onSelect(item);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  // Show the dropdown when open and there are results, or when we have a
  // completed (non-loading, non-error) search with no results (for empty state).
  const showDropdown =
    open &&
    query.length >= 2 &&
    (results.length > 0 || (!loading && !error));

  return (
    <>
      <style>{`
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div ref={containerRef} className="relative z-[100]">
        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="bg-c-grey border-b-grey text-p-white placeholder:text-sh-grey w-full rounded-xl border px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
          />

          {/* Spinner — visible while fetching */}
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <div
                className="h-4 w-4 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: "#00e054" }}
              />
            </div>
          )}

          {/* Clear × button */}
          {!loading && query.length > 0 && (
            <button
              tabIndex={-1}
              onClick={() => {
                setQuery("");
                setResults([]);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="text-sh-grey hover:text-p-white absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* ── Dropdown ──────────────────────────────────────────────────── */}
        {showDropdown && (
          <ul
            ref={listRef}
            className="border-b-grey bg-drop-black absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border shadow-2xl"
            style={{ animation: "dropIn 0.15s ease both" }}
          >
            {results.length === 0 ? (
              <li className="px-4 py-6 text-center">
                <p className="text-sh-grey text-sm">No results for &ldquo;{query}&rdquo;</p>
                <p className="text-sh-grey mt-1 text-xs opacity-50">
                  Try different keywords
                </p>
              </li>
            ) : (
              results.map((item, i) => {
                const isLogged = alreadyLoggedIds.includes(item.id);
                const isActive = i === activeIndex;

                return (
                  <li
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={[
                      "flex items-center gap-3 px-3 py-2.5 transition-colors",
                      isLogged ? "cursor-default opacity-60" : "cursor-pointer",
                      isActive
                        ? "bg-c-grey"
                        : !isLogged
                        ? "hover:bg-white/5"
                        : "",
                    ].join(" ")}
                  >
                    <Thumb item={item} />

                    <div className="min-w-0 flex-1">
                      <p className="text-p-white truncate text-sm font-semibold leading-tight">
                        <HighlightMatch text={item.title} query={query} />
                      </p>
                      <p className="text-sh-grey mt-0.5 truncate text-xs">
                        {item.subtitle}
                        {item.year && (
                          <span className="ml-1.5 opacity-50">{item.year}</span>
                        )}
                      </p>
                    </div>

                    {isLogged && (
                      <span
                        className="flex-shrink-0 text-xs font-bold"
                        style={{ color: "#00e054" }}
                        title="Already logged"
                      >
                        ✓
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}

        {/* Inline error (shown below input, not inside dropdown) */}
        {error && (
          <p className="text-red-400 mt-2 text-xs">{error}</p>
        )}
      </div>
    </>
  );
}
