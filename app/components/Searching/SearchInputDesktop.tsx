"use client";
import React, { useState, useEffect, useRef } from "react";
import searchInputIcon from "@/assets/searchIcon.png";
import closeIcon from "@/assets/csb.png";
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

export const SearchInputDesktop = () => {
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

  // Compute fixed dropdown position from container rect
  const updateDropdownPos = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 340),
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

  const hideSearch = () => {
    // DOM manipulation kept to match existing Navbar toggle pattern
    const SBD = document.querySelector(".search-bar-desktop");
    SBD?.classList.add("md:hidden");
    const SID = document.querySelector(".search-icon-desktop");
    SID?.classList.remove("md:hidden");
    SID?.classList.add("md:block");
    setOpen(false);
    setQuery("");
    setResults({ films: [], books: [], albums: [] });
  };

  const navigateAndClose = (path: string) => {
    setOpen(false);
    hideSearch();
    router.push(path);
  };

  return (
    <div ref={containerRef} className="ml-2 flex items-center">
      <Image
        className="close-search-icon-desktop hover:cursor-pointer"
        src={closeIcon}
        width={25}
        height={25}
        alt="close search"
        onClick={hideSearch}
      />
      <label htmlFor="search-desktop" className="hidden">
        Search:
      </label>
      <input
        id="search-desktop"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query !== "") {
            navigateAndClose("/results?searchTerm=" + query);
          }
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        onFocus={() => {
          updateDropdownPos();
          if (hasResults) setOpen(true);
        }}
        autoComplete="off"
        spellCheck={false}
        className="bg-input-bg text-drop-grey h-8 rounded-2xl py-1.5 pl-2.5 pr-7 text-base focus:outline-none md:w-[150px]"
      />
      {loading ? (
        <div
          className="relative left-[-28px] h-4 w-4 animate-spin rounded-full border-2 border-transparent flex-shrink-0"
          style={{ borderTopColor: "#00e054" }}
        />
      ) : (
        <Image
          src={searchInputIcon}
          onClick={() => {
            if (query !== "") navigateAndClose("/results?searchTerm=" + query);
          }}
          width={20}
          height={20}
          alt="search"
          className="relative left-[-30px] hover:cursor-pointer"
        />
      )}

      {/* ── Fixed dropdown ─────────────────────────────────────────────── */}
      {open && query.length >= 2 && (
        <div
          style={dropdownStyle}
          className="border-b-grey bg-drop-black overflow-hidden rounded-xl border shadow-2xl"
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
                  className="text-p-white hover:bg-white/5 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
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
                  className="text-p-white hover:bg-white/5 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
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
                  className="text-p-white hover:bg-white/5 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
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
