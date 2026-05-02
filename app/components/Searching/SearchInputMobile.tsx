"use client";
import React, { useState, useEffect, useRef } from "react";
import searchInputIcon from "@/assets/searchIcon.png";
import Image from "next/image";
import { useRouter } from "next/navigation";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface FilmResult {
  type: "film";
  id: number;
  title: string;
  year: string;
  poster: string | null;
}

interface BookResult {
  type: "book";
  id: string;
  title: string;
  author: string;
  year: string;
  cover: string | null;
}

interface AlbumResult {
  type: "album";
  id: string;
  title: string;
  artist: string;
  year: string;
}

interface GroupedResults {
  films: FilmResult[];
  books: BookResult[];
  albums: AlbumResult[];
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export const SearchInputMobile = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedResults>({
    films: [],
    books: [],
    albums: [],
  });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Compute fixed dropdown position below the search bar
  const updateDropdownPos = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom,
      left: 0,
      right: 0,
      zIndex: 9999,
    });
  };

  // Click outside → close
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

  // Debounced multi-source search
  useEffect(() => {
    if (query.length < 2) {
      setResults({ films: [], books: [], albums: [] });
      setOpen(false);
      abortRef.current?.abort();
      return;
    }
    const timer = setTimeout(() => {
      updateDropdownPos();
      performSearch(query);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const performSearch = async (q: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);

    const [filmsRes, booksRes, albumsRes] = await Promise.allSettled([
      fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=1`,
        { signal }
      ).then((r) => r.json()),
      fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=4&fields=key,title,author_name,cover_i,first_publish_year`,
        { signal }
      ).then((r) => r.json()),
      fetch(
        `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(q)}&fmt=json&limit=4&type=album`,
        { signal }
      ).then((r) => r.json()),
    ]);

    if (signal.aborted) return;

    const films: FilmResult[] =
      filmsRes.status === "fulfilled"
        ? ((filmsRes.value.results ?? []) as {
            id: number;
            title: string;
            release_date?: string;
            poster_path: string | null;
          }[])
            .slice(0, 4)
            .map((m) => ({
              type: "film" as const,
              id: m.id,
              title: m.title,
              year: m.release_date?.slice(0, 4) ?? "",
              poster: m.poster_path,
            }))
        : [];

    const books: BookResult[] =
      booksRes.status === "fulfilled"
        ? ((booksRes.value.docs ?? []) as {
            key: string;
            title: string;
            author_name?: string[];
            cover_i?: number;
            first_publish_year?: number;
          }[])
            .slice(0, 4)
            .map((b) => ({
              type: "book" as const,
              id: b.key,
              title: b.title,
              author: b.author_name?.[0] ?? "Unknown",
              year: b.first_publish_year?.toString() ?? "",
              cover: b.cover_i
                ? `https://covers.openlibrary.org/b/id/${b.cover_i}-S.jpg`
                : null,
            }))
        : [];

    const albums: AlbumResult[] =
      albumsRes.status === "fulfilled"
        ? ((albumsRes.value["release-groups"] ?? []) as {
            id: string;
            title: string;
            "artist-credit": { artist: { name: string } }[];
            "first-release-date"?: string;
          }[])
            .slice(0, 4)
            .map((g) => ({
              type: "album" as const,
              id: g.id,
              title: g.title,
              artist: g["artist-credit"]?.[0]?.artist?.name ?? "Unknown",
              year: g["first-release-date"]?.slice(0, 4) ?? "",
            }))
        : [];

    setResults({ films, books, albums });
    setOpen(true);
    setLoading(false);
  };

  const hasResults =
    results.films.length > 0 ||
    results.books.length > 0 ||
    results.albums.length > 0;

  const navigateAndClose = (path: string) => {
    setOpen(false);
    setQuery("");
    setResults({ films: [], books: [], albums: [] });
    router.push(path);
  };

  return (
    <div
      ref={containerRef}
      className="search-bar-mobile bg-h-blue active absolute left-0 top-[2.3rem] z-50 w-full p-4"
    >
      <div className="relative flex items-center">
        <label htmlFor="search-mobile" className="hidden">
          Search:
        </label>
        <input
          id="search-mobile"
          type="text"
          className="bg-input-bg text-drop-grey h-9 w-full rounded py-1.5 pl-2.5 pr-10 text-base focus:bg-white focus:outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query !== "") {
              navigateAndClose("/results?searchTerm=" + query);
            }
          }}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? (
          <div
            className="absolute right-3 h-4 w-4 animate-spin rounded-full border-2 border-transparent"
            style={{ borderTopColor: "#00e054" }}
          />
        ) : (
          <Image
            src={searchInputIcon}
            onClick={() => {
              if (query !== "") navigateAndClose("/results?searchTerm=" + query);
            }}
            width={32}
            height={32}
            className="absolute right-1 hover:cursor-pointer"
            alt="search"
          />
        )}
      </div>

      {/* ── Fixed dropdown ─────────────────────────────────────────────── */}
      {open && query.length >= 2 && (
        <div
          style={dropdownStyle}
          className="border-b-grey bg-drop-black max-h-[70vh] overflow-y-auto border-t shadow-2xl"
        >
          {!hasResults && !loading && (
            <div className="px-4 py-6 text-center">
              <p className="text-sh-grey text-sm">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}

          {/* FILMS */}
          {results.films.length > 0 && (
            <section>
              <p className="text-sh-grey border-b-grey border-b px-3 py-1.5 text-[10px] font-bold tracking-widest">
                🎬 FILMS
              </p>
              {results.films.map((film) => (
                <button
                  key={film.id}
                  onClick={() => navigateAndClose(`/movie/${film.id}`)}
                  className="text-p-white hover:bg-white/5 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                >
                  <div className="bg-c-grey h-[54px] w-9 flex-shrink-0 overflow-hidden rounded">
                    {film.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://image.tmdb.org/t/p/w92${film.poster}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs">
                        🎬
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {film.title}
                    </p>
                    {film.year && (
                      <p className="text-sh-grey text-xs opacity-60">
                        {film.year}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </section>
          )}

          {/* BOOKS */}
          {results.books.length > 0 && (
            <section>
              <p
                className={`text-sh-grey border-b-grey border-b px-3 py-1.5 text-[10px] font-bold tracking-widest${results.films.length > 0 ? " border-t" : ""}`}
              >
                📚 BOOKS
              </p>
              {results.books.map((book) => (
                <button
                  key={book.id}
                  onClick={() => navigateAndClose("/books")}
                  className="text-p-white hover:bg-white/5 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                >
                  <div className="bg-c-grey h-[54px] w-9 flex-shrink-0 overflow-hidden rounded">
                    {book.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={book.cover}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs">
                        📖
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {book.title}
                    </p>
                    <p className="text-sh-grey truncate text-xs">
                      {book.author}
                    </p>
                    {book.year && (
                      <p className="text-sh-grey text-xs opacity-60">
                        {book.year}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </section>
          )}

          {/* MUSIC */}
          {results.albums.length > 0 && (
            <section>
              <p
                className={`text-sh-grey border-b-grey border-b px-3 py-1.5 text-[10px] font-bold tracking-widest${results.films.length > 0 || results.books.length > 0 ? " border-t" : ""}`}
              >
                🎵 MUSIC
              </p>
              {results.albums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => navigateAndClose("/music")}
                  className="text-p-white hover:bg-white/5 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                >
                  <div className="bg-c-grey flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded text-xs">
                    🎵
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {album.title}
                    </p>
                    <p className="text-sh-grey truncate text-xs">
                      {album.artist}
                    </p>
                    {album.year && (
                      <p className="text-sh-grey text-xs opacity-60">
                        {album.year}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
