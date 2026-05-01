"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserReview, UserBook, UserAlbum } from "app/types";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TMDBDetail {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  genres: { id: number; name: string }[];
  credits: {
    cast: { id: number; name: string; order: number }[];
    crew: { id: number; name: string; job: string }[];
  };
}

interface FilmProfile {
  watchedCount: number;
  topGenres: { name: string; count: number }[];
  topDirectors: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  topDecades: { decade: string; count: number }[];
  avgRating: number;
  ratedCount: number;
  lovedFilms: { title: string; year: string; rating: number }[];
}

interface ForyouFilm {
  title: string;
  year: number;
  reason: string;
  tmdb_id: number;
  poster_path?: string | null;
  vote_average?: number;
  genres?: string[];
}

interface ForyouBook {
  title: string;
  author: string;
  year: number;
  reason: string;
  ol_key: string;
  cover_url?: string;
}

interface ForyouAlbum {
  title: string;
  artist: string;
  year: number;
  reason: string;
  mbid: string;
  cover_url?: string;
  cover_failed?: boolean;
}

interface ForyouResult {
  films: ForyouFilm[];
  books: ForyouBook[];
  albums: ForyouAlbum[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TMDB_POSTER = "https://image.tmdb.org/t/p/w500";
const OL_COVER = (olid: string) =>
  `https://covers.openlibrary.org/b/olid/${olid}-M.jpg`;
const CAA_COVER = (mbid: string) =>
  `https://coverartarchive.org/release-group/${mbid}/front-250`;

const MOVIES_CACHE_KEY = (uid: string) => `recs_movies_v2_${uid}`;
const FORYOU_CACHE_KEY = (uid: string) => `foryou_v1_${uid}`;
const BATCH_SIZE = 20;

const LOADING_MESSAGES = [
  "Analyzing your taste across all media…",
  "Finding cross-media connections…",
  "Matching your film mood to albums…",
  "Discovering books for your palette…",
  "Curating your unified picks…",
  "Almost ready…",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function countBy(names: string[]): { name: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const n of names) {
    if (n) map[n] = (map[n] || 0) + 1;
  }
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function getDecade(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function computeFilmProfile(
  movies: TMDBDetail[],
  reviews: UserReview[],
  watchedIds: string[]
): FilmProfile {
  const movieMap = Object.fromEntries(movies.map((m) => [m.id.toString(), m]));
  const ratedReviews = reviews.filter((r) => r.rating !== undefined && r.rating > 0);

  const genreNames = movies.flatMap((m) => m.genres.map((g) => g.name));
  const dirNames = movies.flatMap((m) =>
    m.credits.crew.filter((c) => c.job === "Director").map((c) => c.name)
  );

  const actorMap: Record<string, number> = {};
  movies.forEach((m) => {
    m.credits.cast.slice(0, 5).forEach((a) => {
      actorMap[a.name] = (actorMap[a.name] || 0) + 1;
    });
  });
  const topActors = Object.entries(actorMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const decadeNames = movies
    .filter((m) => m.release_date)
    .map((m) => getDecade(parseInt(m.release_date.slice(0, 4))));

  const avgRating =
    ratedReviews.length > 0
      ? ratedReviews.reduce((acc, r) => acc + (r.rating ?? 0), 0) / ratedReviews.length
      : 0;

  const lovedFilms = [...ratedReviews]
    .filter((r) => (r.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 12)
    .map((r) => {
      const m = movieMap[r.movieID];
      return {
        title: m?.title ?? `Film #${r.movieID}`,
        year: m?.release_date?.slice(0, 4) ?? "",
        rating: r.rating ?? 0,
      };
    });

  return {
    watchedCount: watchedIds.length,
    topGenres: countBy(genreNames).slice(0, 6),
    topDirectors: countBy(dirNames).slice(0, 5),
    topActors,
    topDecades: countBy(decadeNames)
      .slice(0, 5)
      .map(({ name, count }) => ({ decade: name, count })),
    avgRating,
    ratedCount: ratedReviews.length,
    lovedFilms,
  };
}

function buildForyouPrompt(
  filmProfile: FilmProfile,
  books: UserBook[],
  albums: UserAlbum[]
): string {
  const seed = Math.floor(Math.random() * 99999);
  const parts: string[] = [`Seed: ${seed}`];

  parts.push(
    `FILMS WATCHED (${filmProfile.watchedCount}): top genres: ${filmProfile.topGenres
      .slice(0, 5)
      .map((g) => g.name)
      .join(", ")}, top directors: ${filmProfile.topDirectors
      .slice(0, 3)
      .map((d) => d.name)
      .join(", ")}, avg rating: ${filmProfile.avgRating.toFixed(1)}/5`
  );

  if (filmProfile.lovedFilms.length > 0) {
    parts.push(
      `Loved films: ${filmProfile.lovedFilms
        .slice(0, 8)
        .map((f) => `${f.title} (${f.year}, ${f.rating}★)`)
        .join(", ")}`
    );
  }

  if (books.length > 0) {
    parts.push(
      `BOOKS READ (${books.length}): ${books
        .slice(0, 10)
        .map((b) => `${b.title} by ${b.author}${b.rating ? ` (${b.rating}★)` : ""}`)
        .join(", ")}`
    );
  } else {
    parts.push(`BOOKS READ (0): No books logged yet`);
  }

  if (albums.length > 0) {
    parts.push(
      `MUSIC LISTENED (${albums.length}): ${albums
        .slice(0, 10)
        .map((a) => `${a.title} by ${a.artist}${a.rating ? ` (${a.rating}★)` : ""}`)
        .join(", ")}`
    );
  } else {
    parts.push(`MUSIC LISTENED (0): No albums logged yet`);
  }

  return parts.join("\n");
}

// ─── INLINE COMPONENTS ────────────────────────────────────────────────────────

const AIBadge = () => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
    style={{
      background: "rgba(168,85,247,0.15)",
      border: "1px solid rgba(168,85,247,0.4)",
      color: "#c084fc",
    }}
  >
    ✦ AI
  </span>
);

const LoadingDots = () => (
  <span className="inline-flex items-center gap-1.5">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="bg-p-green inline-block h-2 w-2 rounded-full"
        style={{ animation: `dotPulse 1.4s ease-in-out ${i * 0.22}s infinite` }}
      />
    ))}
  </span>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sh-grey mb-3 text-xs font-bold tracking-widest">
    {children}
  </p>
);

// Film card (same as recommendations page)
const FilmCard = ({ rec, index }: { rec: ForyouFilm; index: number }) => (
  <div
    className="group cursor-default"
    style={{ animation: "recsCardIn 0.45s ease both", animationDelay: `${index * 35}ms` }}
  >
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-c-grey">
      {rec.poster_path ? (
        <Image
          src={TMDB_POSTER + rec.poster_path}
          alt={rec.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
          <span className="text-sh-grey text-2xl">🎬</span>
          <p className="text-sh-grey text-xs leading-tight">{rec.title}</p>
        </div>
      )}
      <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="text-sh-grey mb-1.5 text-[10px] font-bold tracking-widest">
          WHY YOU'LL LOVE IT
        </p>
        <p className="text-p-white text-xs leading-relaxed">{rec.reason}</p>
      </div>
      {rec.vote_average && rec.vote_average > 0 && (
        <div className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-sm">
          ★ {rec.vote_average.toFixed(1)}
        </div>
      )}
    </div>
    <div className="mt-2 px-0.5">
      <p className="text-p-white truncate text-xs font-bold leading-tight">{rec.title}</p>
      <p className="text-sh-grey text-xs">{rec.year}</p>
    </div>
  </div>
);

// Book card
const BookCard = ({ rec, index }: { rec: ForyouBook; index: number }) => (
  <div
    className="group cursor-default"
    style={{ animation: "recsCardIn 0.45s ease both", animationDelay: `${index * 35}ms` }}
  >
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-c-grey">
      {rec.cover_url ? (
        <Image
          src={rec.cover_url}
          alt={rec.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, 20vw"
          unoptimized
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
          <span className="text-sh-grey text-2xl">📖</span>
          <p className="text-sh-grey text-xs leading-tight">{rec.title}</p>
        </div>
      )}
      <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="text-sh-grey mb-1.5 text-[10px] font-bold tracking-widest">
          WHY YOU'LL LOVE IT
        </p>
        <p className="text-p-white text-xs leading-relaxed">{rec.reason}</p>
        <p className="text-sh-grey mt-1.5 text-[10px]">{rec.author}</p>
      </div>
    </div>
    <div className="mt-2 px-0.5">
      <p className="text-p-white truncate text-xs font-bold leading-tight">{rec.title}</p>
      <p className="text-sh-grey truncate text-xs">{rec.author}</p>
    </div>
  </div>
);

// Album card with graceful cover 404 handling
function AlbumCard({ rec, index }: { rec: ForyouAlbum; index: number }) {
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <div
      className="group cursor-default"
      style={{ animation: "recsCardIn 0.45s ease both", animationDelay: `${index * 35}ms` }}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-c-grey">
        {rec.cover_url && !coverFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rec.cover_url}
            alt={rec.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
            <span className="text-sh-grey text-2xl">🎵</span>
            <p className="text-sh-grey text-xs leading-tight">{rec.title}</p>
          </div>
        )}
        <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="text-sh-grey mb-1.5 text-[10px] font-bold tracking-widest">
            WHY YOU'LL LOVE IT
          </p>
          <p className="text-p-white text-xs leading-relaxed">{rec.reason}</p>
          <p className="text-sh-grey mt-1.5 text-[10px]">{rec.artist}</p>
        </div>
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-p-white truncate text-xs font-bold leading-tight">{rec.title}</p>
        <p className="text-sh-grey truncate text-xs">{rec.artist}</p>
      </div>
    </div>
  );
}

// Unified taste profile card
const ProfileCard = ({
  filmProfile,
  books,
  albums,
}: {
  filmProfile: FilmProfile;
  books: UserBook[];
  albums: UserAlbum[];
}) => {
  const topAuthors = countBy(books.map((b) => b.author)).slice(0, 3);
  const topArtists = countBy(albums.map((a) => a.artist)).slice(0, 3);

  return (
    <div className="border-b-grey bg-drop-black rounded-xl border p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sh-grey text-xs font-bold tracking-widest">
          YOUR TASTE PROFILE
        </h2>
        <div className="flex items-center gap-3">
          {filmProfile.ratedCount > 0 && (
            <span className="text-yellow-400 text-xs">
              ★ {filmProfile.avgRating.toFixed(1)} avg
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Films */}
        <div>
          <p className="text-sh-grey mb-2 text-[10px] font-bold tracking-wider opacity-60">
            🎬 FILMS
          </p>
          <p className="text-p-green mb-1.5 text-sm font-bold">
            {filmProfile.watchedCount} watched
          </p>
          <div className="flex flex-wrap gap-1.5">
            {filmProfile.topGenres.slice(0, 4).map((g, i) => (
              <span
                key={i}
                className="rounded-full border px-2.5 py-0.5 text-xs"
                style={{
                  borderColor: i === 0 ? "#00e054" : "#456",
                  color: i === 0 ? "#00e054" : "#9ab",
                  background: i === 0 ? "rgba(0,224,84,0.08)" : "transparent",
                }}
              >
                {g.name}
              </span>
            ))}
          </div>
          {filmProfile.topDirectors.length > 0 && (
            <p className="text-sh-grey mt-2 text-xs">
              {filmProfile.topDirectors
                .slice(0, 2)
                .map((d) => d.name)
                .join(" · ")}
            </p>
          )}
        </div>

        {/* Books */}
        <div>
          <p className="text-sh-grey mb-2 text-[10px] font-bold tracking-wider opacity-60">
            📖 BOOKS
          </p>
          <p
            className="mb-1.5 text-sm font-bold"
            style={{ color: "#40bcf4" }}
          >
            {books.length} read
          </p>
          {topAuthors.length > 0 ? (
            <p className="text-sh-grey text-xs">
              {topAuthors.map((a) => a.name).join(" · ")}
            </p>
          ) : (
            <p className="text-sh-grey text-xs opacity-50">No books logged yet</p>
          )}
        </div>

        {/* Music */}
        <div>
          <p className="text-sh-grey mb-2 text-[10px] font-bold tracking-wider opacity-60">
            🎵 MUSIC
          </p>
          <p
            className="mb-1.5 text-sm font-bold"
            style={{ color: "#c084fc" }}
          >
            {albums.length} albums
          </p>
          {topArtists.length > 0 ? (
            <p className="text-sh-grey text-xs">
              {topArtists.map((a) => a.name).join(" · ")}
            </p>
          ) : (
            <p className="text-sh-grey text-xs opacity-50">No albums logged yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ForyouPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [filmProfile, setFilmProfile] = useState<FilmProfile | null>(null);
  const [books, setBooks] = useState<UserBook[]>([]);
  const [albums, setAlbums] = useState<UserAlbum[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataProgress, setDataProgress] = useState({ fetched: 0, total: 0 });

  const [generating, setGenerating] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  const [result, setResult] = useState<ForyouResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cycle loading messages while generating
  useEffect(() => {
    if (!generating) return;
    const iv = setInterval(
      () => setLoadingMsgIdx((p) => (p + 1) % LOADING_MESSAGES.length),
      1800
    );
    return () => clearInterval(iv);
  }, [generating]);

  // Auth guard + data load
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setReady(true);
      setUid(user.uid);
      loadUserData(user.uid);
    });
    return () => unsub();
  }, []);

  const loadUserData = async (userId: string) => {
    // Try reusing the recommendations page movie cache
    const movieCacheKey = MOVIES_CACHE_KEY(userId);
    try {
      const cached = sessionStorage.getItem(movieCacheKey);
      if (cached) {
        const { movies, reviews, ids } = JSON.parse(cached);
        setFilmProfile(computeFilmProfile(movies, reviews, ids));
      }
    } catch {}

    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (!snap.exists()) {
        setLoadingData(false);
        return;
      }

      const data = snap.data();
      const userReviews: UserReview[] = data.reviews ?? [];
      const userBooks: UserBook[] = data.books ?? [];
      const userAlbums: UserAlbum[] = data.albums ?? [];
      const ids: string[] = (data.watched ?? []).map((w: { movieID: string }) => w.movieID);
      const reviewIds = userReviews.map((r) => r.movieID);
      const allIds = [...new Set([...ids, ...reviewIds])];

      setBooks(userBooks);
      setAlbums(userAlbums);

      // If we already had cached movies, don't re-fetch
      const existingCache = sessionStorage.getItem(movieCacheKey);
      if (existingCache) {
        setLoadingData(false);
        return;
      }

      setDataProgress({ fetched: 0, total: allIds.length });

      const fetched: TMDBDetail[] = [];
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((id) =>
            fetch(
              `https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=credits`
            )
              .then((r) => r.json())
              .catch(() => null)
          )
        );
        results.forEach((m) => {
          if (m && m.id && !m.status_code) fetched.push(m as TMDBDetail);
        });
        setDataProgress((p) => ({
          fetched: Math.min(i + BATCH_SIZE, allIds.length),
          total: p.total,
        }));
      }

      const profile = computeFilmProfile(fetched, userReviews, ids);
      setFilmProfile(profile);

      try {
        sessionStorage.setItem(
          movieCacheKey,
          JSON.stringify({ movies: fetched, reviews: userReviews, ids })
        );
      } catch {}
    } catch (err) {
      console.error("loadUserData error:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const generate = async (forceFresh = false) => {
    if (!filmProfile || !uid) return;

    const cacheKey = FORYOU_CACHE_KEY(uid);

    if (!forceFresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setResult(JSON.parse(cached));
          return;
        }
      } catch {}
    } else {
      try { sessionStorage.removeItem(cacheKey); } catch {}
    }

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const prompt = buildForyouPrompt(filmProfile, books, albums);

      const res = await fetch("/api/foryou", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "API error");

      const raw: ForyouResult = json.result;

      // Enrich films with TMDB
      const enrichedFilms = await Promise.all(
        raw.films.map(async (rec) => {
          if (!rec.tmdb_id) return rec;
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/movie/${rec.tmdb_id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
            );
            const d = await r.json();
            if (d?.id && !d.status_code) {
              return {
                ...rec,
                title: d.title ?? rec.title,
                year: parseInt(d.release_date?.slice(0, 4) ?? String(rec.year)),
                poster_path: d.poster_path ?? null,
                vote_average: d.vote_average ?? 0,
                genres: (d.genres ?? []).map((g: { name: string }) => g.name),
              };
            }
          } catch {}
          return rec;
        })
      );

      // Enrich books with Open Library covers
      const enrichedBooks = raw.books.map((rec) => {
        const olid = rec.ol_key?.replace("/works/", "");
        return {
          ...rec,
          cover_url: olid ? OL_COVER(olid) : undefined,
        };
      });

      // Enrich albums with CoverArt Archive
      const enrichedAlbums = raw.albums.map((rec) => ({
        ...rec,
        cover_url: rec.mbid ? CAA_COVER(rec.mbid) : undefined,
      }));

      const enriched: ForyouResult = {
        films: enrichedFilms,
        books: enrichedBooks,
        albums: enrichedAlbums,
      };

      setResult(enriched);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(enriched)); } catch {}
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate recommendations.";
      console.error("generate error:", err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  // ── Loading data phase ─────────────────────────────────────────────────────

  if (!ready || loadingData) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-xs text-center">
            <p
              className="text-p-green mb-2 text-4xl font-bold tracking-widest"
              style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}
            >
              FOR YOU
            </p>
            <p className="text-sh-grey mb-6 text-sm">Loading your taste profile…</p>
            <div className="bg-c-grey h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-p-green h-full rounded-full transition-all duration-300"
                style={{
                  width:
                    dataProgress.total > 0
                      ? `${Math.round((dataProgress.fetched / dataProgress.total) * 100)}%`
                      : "25%",
                  animation:
                    dataProgress.total === 0 ? "shimmerBar 1.5s ease-in-out infinite" : "none",
                }}
              />
            </div>
            {dataProgress.total > 0 && (
              <p className="text-sh-grey mt-2 text-xs">
                {dataProgress.fetched} / {dataProgress.total} films
              </p>
            )}
          </div>
        </main>
      </>
    );
  }

  if (!filmProfile || filmProfile.watchedCount === 0) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p
            className="text-p-green mb-3 text-4xl font-bold tracking-widest"
            style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}
          >
            FOR YOU
          </p>
          <p className="text-sh-grey max-w-sm text-sm">
            Add films to your watched list to unlock personalized cross-media
            recommendations.
          </p>
        </main>
        <Footer />
      </>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.75); }
          50%       { opacity: 1;    transform: scale(1.1);  }
        }
        @keyframes shimmerBar {
          0%   { width: 15%; }
          50%  { width: 60%; }
          100% { width: 15%; }
        }
        @keyframes fadeMsg {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <LayoutNavbar />

      <main className="bg-h-blue min-h-screen px-4 pb-20 pt-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-3">
              <h1
                className="text-p-green text-5xl font-bold tracking-widest md:text-6xl"
                style={{ textShadow: "0 0 50px rgba(0,224,84,0.25)" }}
              >
                FOR YOU
              </h1>
              <AIBadge />
            </div>
            <p className="text-sh-grey text-sm">
              Cross-media recommendations based on your films, books & music
            </p>
          </div>

          {/* Taste profile */}
          <div className="mb-6" style={{ animation: "recsCardIn 0.4s ease both" }}>
            <ProfileCard
              filmProfile={filmProfile}
              books={books}
              albums={albums}
            />
          </div>

          {/* Generate button (before first generation) */}
          {!generating && !result && !error && (
            <div
              className="mb-10 text-center"
              style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}
            >
              <button
                onClick={() => generate(false)}
                className="bg-p-green hover:bg-b-green text-h-blue rounded-xl px-10 py-3.5 text-sm font-bold tracking-widest shadow-lg transition-colors"
                style={{ boxShadow: "0 0 30px rgba(0,224,84,0.2)" }}
              >
                GENERATE FOR YOU
              </button>
              <p className="text-sh-grey mt-3 text-xs">
                AI will analyze your{" "}
                <span className="text-p-white">{filmProfile.watchedCount} films</span>
                {books.length > 0 && (
                  <>
                    {", "}
                    <span className="text-p-white">{books.length} books</span>
                  </>
                )}
                {albums.length > 0 && (
                  <>
                    {" & "}
                    <span className="text-p-white">{albums.length} albums</span>
                  </>
                )}{" "}
                to find cross-media connections.
              </p>
            </div>
          )}

          {/* Generating state */}
          {generating && (
            <div className="mb-12 flex flex-col items-center gap-5">
              <LoadingDots />
              <p
                key={loadingMsgIdx}
                className="text-sh-grey text-sm"
                style={{ animation: "fadeMsg 0.35s ease both" }}
              >
                {LOADING_MESSAGES[loadingMsgIdx]}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="mb-8 flex flex-col items-center gap-3"
              style={{ animation: "recsCardIn 0.3s ease both" }}
            >
              <div className="border-b-grey bg-drop-black rounded-xl border px-6 py-4 text-center">
                <p className="text-red-400 mb-3 text-sm">{error}</p>
                <button
                  onClick={() => generate(true)}
                  className="border-b-grey text-sh-grey hover:text-p-white rounded-lg border px-6 py-2 text-xs transition-colors"
                >
                  ↺ Try Again
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              <div
                className="mb-5 flex items-center justify-between"
                style={{ animation: "recsCardIn 0.35s ease both" }}
              >
                <p className="text-sh-grey text-xs font-bold tracking-widest">
                  YOUR CROSS-MEDIA PICKS
                </p>
                <button
                  onClick={() => generate(true)}
                  disabled={generating}
                  className="border-b-grey text-sh-grey hover:text-p-white flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40"
                >
                  ↺ <span>Regenerate</span>
                </button>
              </div>

              {/* Three sections */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">

                {/* Films section */}
                <div>
                  <SectionLabel>🎬 FILMS — {result.films.length} PICKS</SectionLabel>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2">
                    {result.films.map((rec, i) => (
                      <FilmCard key={`film-${rec.tmdb_id}-${i}`} rec={rec} index={i} />
                    ))}
                  </div>
                </div>

                {/* Books section */}
                <div>
                  <SectionLabel>📖 BOOKS — {result.books.length} PICKS</SectionLabel>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2">
                    {result.books.map((rec, i) => (
                      <BookCard key={`book-${rec.ol_key}-${i}`} rec={rec} index={i} />
                    ))}
                  </div>
                </div>

                {/* Albums section */}
                <div>
                  <SectionLabel>🎵 MUSIC — {result.albums.length} PICKS</SectionLabel>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2">
                    {result.albums.map((rec, i) => (
                      <AlbumCard key={`album-${rec.mbid}-${i}`} rec={rec} index={i} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom CTA */}
              <div className="mt-10 text-center">
                <button
                  onClick={() => generate(true)}
                  disabled={generating}
                  className="border-b-grey text-sh-grey hover:text-p-white rounded-xl border px-8 py-3 text-sm transition-colors disabled:opacity-40"
                >
                  ↺ Get Fresh Picks
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
