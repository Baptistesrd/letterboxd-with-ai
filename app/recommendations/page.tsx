"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserReview, UserBook, UserAlbum } from "app/types";

type Tab = "films" | "books" | "music";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TMDBDetail {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  genres: { id: number; name: string }[];
  credits: {
    cast: { id: number; name: string; order: number }[];
    crew: { id: number; name: string; job: string }[];
  };
}

interface TasteProfile {
  watchedCount: number;
  topGenres: { name: string; count: number }[];
  topDirectors: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  topDecades: { decade: string; count: number }[];
  avgRating: number;
  ratedCount: number;
  lovedFilms: { title: string; year: string; rating: number }[];
}

interface FilmRec {
  title: string;
  year: number;
  reason: string;
  tmdb_id: number;
  poster_path?: string | null;
  vote_average?: number;
  director_name?: string;
  director_id?: number;
}

interface BookRec {
  title: string;
  author: string;
  year: number;
  reason: string;
  ol_key: string;
  cover_url?: string;
  author_ol_key?: string;
}

interface MusicRec {
  title: string;
  artist: string;
  year: number;
  reason: string;
  mbid: string;
  cover_url?: string;
  artist_mbid?: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TMDB_POSTER = "https://image.tmdb.org/t/p/w500";
const OL_COVER_ID = (id: number) =>
  `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
const CAA_COVER = (mbid: string) =>
  `https://coverartarchive.org/release-group/${mbid}/front-250`;

const MOVIES_CACHE_KEY = (uid: string) => `recs_movies_v2_${uid}`;
const FILM_RECS_CACHE_KEY = (uid: string) => `recs_results_v1_${uid}`;
const BOOKS_RECS_CACHE_KEY = (uid: string) => `recs_books_v1_${uid}`;
const MUSIC_RECS_CACHE_KEY = (uid: string) => `recs_music_v1_${uid}`;
const BATCH_SIZE = 20;

const LOADING_MESSAGES: Record<Tab, string[]> = {
  films: [
    "Analyzing your taste...",
    "Scanning thousands of films...",
    "Finding your hidden gems...",
    "Matching your preferences...",
    "Consulting the critics...",
    "Curating your personal list...",
    "Almost ready...",
  ],
  books: [
    "Reading your shelves...",
    "Scanning literary worlds...",
    "Finding overlooked masterworks...",
    "Matching your reading voice...",
    "Curating your next chapter...",
    "Almost ready...",
  ],
  music: [
    "Tuning into your taste...",
    "Scanning record crates...",
    "Finding hidden albums...",
    "Matching your sonic palette...",
    "Curating your soundtrack...",
    "Almost ready...",
  ],
};

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

function computeProfile(
  movies: TMDBDetail[],
  reviews: UserReview[],
  watchedIds: string[]
): TasteProfile {
  const movieMap = Object.fromEntries(movies.map((m) => [m.id.toString(), m]));
  const ratedReviews = reviews.filter(
    (r) => r.rating !== undefined && r.rating > 0
  );

  const genreNames = movies.flatMap((m) => m.genres.map((g) => g.name));
  const dirNames = movies.flatMap((m) =>
    m.credits.crew.filter((c) => c.job === "Director").map((c) => c.name)
  );

  const actorMap: Record<string, number> = {};
  movies.forEach((m) => {
    const seen = new Set<string>();
    m.credits.cast.slice(0, 5).forEach((a) => {
      if (!seen.has(a.name)) {
        seen.add(a.name);
        actorMap[a.name] = (actorMap[a.name] || 0) + 1;
      }
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
      ? ratedReviews.reduce((acc, r) => acc + (r.rating ?? 0), 0) /
        ratedReviews.length
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

function buildFilmPrompt(profile: TasteProfile): string {
  const seed = Math.floor(Math.random() * 9999);
  return `My taste profile (seed: ${seed}):
- Favorite Genres: ${profile.topGenres.map((g) => g.name).join(", ")}
- Top Directors I love: ${profile.topDirectors.map((d) => d.name).join(", ")}
- Preferred Eras: ${profile.topDecades.map((d) => d.decade).join(", ")}
- Average rating I give: ${profile.avgRating.toFixed(1)}/5 (${profile.ratedCount} films rated)

Recommend 15 films I have NOT seen yet. Vary your picks across eras and countries — surprise me.
Return JSON object: {"recommendations": [...]}`;
}

function buildBookPrompt(books: UserBook[]): string {
  const seed = Math.floor(Math.random() * 9999);
  const topAuthors = countBy(books.map((b) => b.author)).slice(0, 5);
  const topRated = [...books]
    .filter((b) => (b.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6);
  const rated = books.filter((b) => b.rating);
  const avgRating =
    rated.length > 0
      ? (
          rated.reduce((acc, b) => acc + (b.rating ?? 0), 0) / rated.length
        ).toFixed(1)
      : null;

  return `My reading profile (seed: ${seed}):
- Books read: ${books.length}
- Top authors: ${topAuthors.map((a) => a.name).join(", ") || "none yet"}${avgRating ? `\n- Average rating I give: ${avgRating}/5` : ""}${topRated.length > 0 ? `\n- Books I loved: ${topRated.map((b) => `${b.title} by ${b.author}${b.rating ? ` (${b.rating}★)` : ""}`).join(", ")}` : ""}

Recommend 12 books I have NOT read yet. Vary genres and eras — surprise me.
For each book provide: title, author, year, a specific reason tied to my reading history, and the Open Library work key (format: /works/OL12345W).
Return JSON object: {"recommendations": [{"title":"...","author":"...","year":2020,"reason":"...","ol_key":"/works/OL12345W"}]}`;
}

function buildMusicPrompt(albums: UserAlbum[]): string {
  const seed = Math.floor(Math.random() * 9999);
  const topArtists = countBy(albums.map((a) => a.artist)).slice(0, 5);
  const topRated = [...albums]
    .filter((a) => (a.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6);
  const rated = albums.filter((a) => a.rating);
  const avgRating =
    rated.length > 0
      ? (
          rated.reduce((acc, a) => acc + (a.rating ?? 0), 0) / rated.length
        ).toFixed(1)
      : null;

  return `My music profile (seed: ${seed}):
- Albums listened: ${albums.length}
- Top artists: ${topArtists.map((a) => a.name).join(", ") || "none yet"}${avgRating ? `\n- Average rating I give: ${avgRating}/5` : ""}${topRated.length > 0 ? `\n- Albums I loved: ${topRated.map((a) => `${a.title} by ${a.artist}${a.rating ? ` (${a.rating}★)` : ""}`).join(", ")}` : ""}

Recommend 12 albums I have NOT listened to yet. Vary genres and eras — surprise me.
For each album provide: title, artist, year, a specific reason tied to my music history, and the MusicBrainz release-group MBID.
Return JSON object: {"recommendations": [{"title":"...","artist":"...","year":2020,"reason":"...","mbid":"..."}]}`;
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const AIBadge = () => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
    style={{
      background: "rgba(0,224,84,0.15)",
      border: "1px solid rgba(0,224,84,0.4)",
      color: "#00e054",
    }}
  >
    ✦ Groq AI
  </span>
);

const LoadingDots = () => (
  <span className="inline-flex items-center gap-1.5">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="bg-p-green inline-block h-2 w-2 rounded-full"
        style={{
          animation: `dotPulse 1.4s ease-in-out ${i * 0.22}s infinite`,
        }}
      />
    ))}
  </span>
);

const MovieCard = ({
  rec,
  index,
  watchedIds,
}: {
  rec: FilmRec;
  index: number;
  watchedIds: string[];
}) => (
  <div
    className="group cursor-default"
    style={{
      animation: "recsCardIn 0.45s ease both",
      animationDelay: `${index * 35}ms`,
    }}
  >
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#1a1d23]">
      {watchedIds.includes(String(rec.tmdb_id)) && (
        <div
          className="absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm"
          style={{
            background: "rgba(0,224,84,0.15)",
            color: "#00e054",
            border: "1px solid rgba(0,224,84,0.3)",
          }}
        >
          ✓ Watched
        </div>
      )}
      {rec.poster_path ? (
        <Image
          src={TMDB_POSTER + rec.poster_path}
          alt={rec.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, 20vw"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          🎬
        </div>
      )}
      <div className="absolute inset-0 flex flex-col justify-end bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="mb-1 text-[10px] font-bold tracking-widest text-gray-400">
          WHY YOU'LL LOVE IT
        </p>
        <p className="text-xs leading-relaxed text-white">{rec.reason}</p>
        {rec.director_name && rec.director_id && (
          <Link
            href={`/director/${rec.director_id}`}
            className="mt-1.5 text-[10px] text-gray-400 transition-colors hover:text-[#00e054]"
            onClick={(e) => e.stopPropagation()}
          >
            {rec.director_name}
          </Link>
        )}
      </div>
    </div>
    <div className="mt-2 px-0.5">
      <p className="truncate text-xs font-bold text-white">{rec.title}</p>
      <p className="text-xs text-gray-400">{rec.year}</p>
    </div>
  </div>
);

const BookCard = ({ rec, index }: { rec: BookRec; index: number }) => (
  <div
    className="group cursor-default"
    style={{
      animation: "recsCardIn 0.45s ease both",
      animationDelay: `${index * 35}ms`,
    }}
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
        <p className="text-sh-grey mb-1 text-[10px] font-bold tracking-widest">
          WHY YOU'LL LOVE IT
        </p>
        <p className="text-p-white text-xs leading-relaxed">{rec.reason}</p>
        {rec.author_ol_key ? (
          <Link
            href={`/author/${rec.author_ol_key}`}
            className="text-sh-grey hover:text-p-green mt-1.5 text-[10px] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {rec.author}
          </Link>
        ) : (
          <p className="text-sh-grey mt-1.5 text-[10px]">{rec.author}</p>
        )}
      </div>
    </div>
    <div className="mt-2 px-0.5">
      <p className="text-p-white truncate text-xs font-bold leading-tight">
        {rec.title}
      </p>
      <p className="text-sh-grey truncate text-xs">{rec.author}</p>
    </div>
  </div>
);

function AlbumCard({ rec, index }: { rec: MusicRec; index: number }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <div
      className="group cursor-default"
      style={{
        animation: "recsCardIn 0.45s ease both",
        animationDelay: `${index * 35}ms`,
      }}
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
          <p className="text-sh-grey mb-1 text-[10px] font-bold tracking-widest">
            WHY YOU'LL LOVE IT
          </p>
          <p className="text-p-white text-xs leading-relaxed">{rec.reason}</p>
          {rec.artist_mbid ? (
            <Link
              href={`/artist/${rec.artist_mbid}`}
              className="text-sh-grey hover:text-p-green mt-1.5 text-[10px] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {rec.artist}
            </Link>
          ) : (
            <p className="text-sh-grey mt-1.5 text-[10px]">{rec.artist}</p>
          )}
        </div>
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-p-white truncate text-xs font-bold leading-tight">
          {rec.title}
        </p>
        <p className="text-sh-grey truncate text-xs">{rec.artist}</p>
      </div>
    </div>
  );
}

// Tab-aware taste summary card
function TasteCard({
  tab,
  profile,
  books,
  albums,
}: {
  tab: Tab;
  profile: TasteProfile | null;
  books: UserBook[];
  albums: UserAlbum[];
}) {
  if (tab === "films") {
    if (!profile) return null;
    return (
      <div className="border-b-grey bg-drop-black rounded-xl border p-5">
        <p className="text-sh-grey mb-3 text-[10px] font-bold tracking-widest">
          YOUR FILM PROFILE
        </p>
        <div className="flex flex-wrap items-start gap-5">
          <div className="text-center">
            <p className="text-p-green text-xl font-bold">
              {profile.watchedCount}
            </p>
            <p className="text-sh-grey text-[10px]">WATCHED</p>
          </div>
          {profile.ratedCount > 0 && (
            <div className="text-center">
              <p className="text-xl font-bold text-yellow-400">
                ★ {profile.avgRating.toFixed(1)}
              </p>
              <p className="text-sh-grey text-[10px]">AVG RATING</p>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {profile.topGenres.slice(0, 4).map((g, i) => (
                <span
                  key={i}
                  className="rounded-full border px-2 py-0.5 text-xs"
                  style={{
                    borderColor: i === 0 ? "#00e054" : "#456",
                    color: i === 0 ? "#00e054" : "#9ab",
                    background:
                      i === 0 ? "rgba(0,224,84,0.08)" : "transparent",
                  }}
                >
                  {g.name}
                </span>
              ))}
            </div>
            {profile.topDirectors.length > 0 && (
              <p className="text-sh-grey text-xs">
                {profile.topDirectors
                  .slice(0, 3)
                  .map((d) => d.name)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tab === "books") {
    const topAuthors = countBy(books.map((b) => b.author)).slice(0, 3);
    const rated = books.filter((b) => b.rating);
    const avg =
      rated.length > 0
        ? (
            rated.reduce((acc, b) => acc + (b.rating ?? 0), 0) / rated.length
          ).toFixed(1)
        : null;
    return (
      <div className="border-b-grey bg-drop-black rounded-xl border p-5">
        <p className="text-sh-grey mb-3 text-[10px] font-bold tracking-widest">
          YOUR READING PROFILE
        </p>
        <div className="flex flex-wrap items-start gap-5">
          <div className="text-center">
            <p className="text-xl font-bold" style={{ color: "#40bcf4" }}>
              {books.length}
            </p>
            <p className="text-sh-grey text-[10px]">READ</p>
          </div>
          {avg && (
            <div className="text-center">
              <p className="text-xl font-bold text-yellow-400">★ {avg}</p>
              <p className="text-sh-grey text-[10px]">AVG RATING</p>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {topAuthors.length > 0 ? (
              <p className="text-sh-grey text-xs">
                {topAuthors.map((a) => a.name).join(" · ")}
              </p>
            ) : (
              <p className="text-sh-grey text-xs opacity-50">
                Log books to personalize recommendations
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // music
  const topArtists = countBy(albums.map((a) => a.artist)).slice(0, 3);
  const rated = albums.filter((a) => a.rating);
  const avg =
    rated.length > 0
      ? (
          rated.reduce((acc, a) => acc + (a.rating ?? 0), 0) / rated.length
        ).toFixed(1)
      : null;
  return (
    <div className="border-b-grey bg-drop-black rounded-xl border p-5">
      <p className="text-sh-grey mb-3 text-[10px] font-bold tracking-widest">
        YOUR MUSIC PROFILE
      </p>
      <div className="flex flex-wrap items-start gap-5">
        <div className="text-center">
          <p className="text-xl font-bold" style={{ color: "#c084fc" }}>
            {albums.length}
          </p>
          <p className="text-sh-grey text-[10px]">LISTENED</p>
        </div>
        {avg && (
          <div className="text-center">
            <p className="text-xl font-bold text-yellow-400">★ {avg}</p>
            <p className="text-sh-grey text-[10px]">AVG RATING</p>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {topArtists.length > 0 ? (
            <p className="text-sh-grey text-xs">
              {topArtists.map((a) => a.name).join(" · ")}
            </p>
          ) : (
            <p className="text-sh-grey text-xs opacity-50">
              Log albums to personalize recommendations
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ForYouPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("films");

  // Loaded data
  const [filmProfile, setFilmProfile] = useState<TasteProfile | null>(null);
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [loggedBooks, setLoggedBooks] = useState<UserBook[]>([]);
  const [loggedAlbums, setLoggedAlbums] = useState<UserAlbum[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataProgress, setDataProgress] = useState({ fetched: 0, total: 0 });

  // Per-tab results
  const [filmRecs, setFilmRecs] = useState<FilmRec[]>([]);
  const [bookRecs, setBookRecs] = useState<BookRec[]>([]);
  const [musicRecs, setMusicRecs] = useState<MusicRec[]>([]);

  // Per-tab state
  const [filmGenerating, setFilmGenerating] = useState(false);
  const [bookGenerating, setBookGenerating] = useState(false);
  const [musicGenerating, setMusicGenerating] = useState(false);
  const [filmError, setFilmError] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);

  // Loading message cycling
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const anyGenerating = filmGenerating || bookGenerating || musicGenerating;

  useEffect(() => {
    if (!anyGenerating) return;
    const msgs = LOADING_MESSAGES[activeTab];
    const iv = setInterval(
      () => setLoadingMsgIdx((p) => (p + 1) % msgs.length),
      1800
    );
    return () => clearInterval(iv);
  }, [anyGenerating, activeTab]);

  // Reset message index when switching tabs mid-generation
  useEffect(() => {
    setLoadingMsgIdx(0);
  }, [activeTab]);

  // Auth guard + data load
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setUid(user.uid);
      setReady(true);
      loadUserData(user.uid);
    });
    return () => unsub();
  }, [router]);

  const loadUserData = async (userId: string) => {
    const movieCacheKey = MOVIES_CACHE_KEY(userId);

    // Reuse cached film data if available
    try {
      const cached = sessionStorage.getItem(movieCacheKey);
      if (cached) {
        const { movies, reviews, ids } = JSON.parse(cached);
        setFilmProfile(computeProfile(movies, reviews, ids));
        setWatchedIds(ids);
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
      const ids: string[] = (data.watched ?? []).map(
        (w: { movieID: string }) => w.movieID
      );
      const allIds = [
        ...new Set([...ids, ...userReviews.map((r) => r.movieID)]),
      ];

      setLoggedBooks(userBooks);
      setLoggedAlbums(userAlbums);

      // Skip TMDB batch fetch if film data is already cached
      if (sessionStorage.getItem(movieCacheKey)) {
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

      const profile = computeProfile(fetched, userReviews, ids);
      setFilmProfile(profile);
      setWatchedIds(ids);

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

  // ── Film generation ──────────────────────────────────────────────────────────

  const generateFilms = async (forceFresh = false) => {
    if (!uid || !filmProfile) return;
    const cacheKey = FILM_RECS_CACHE_KEY(uid);

    if (!forceFresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setFilmRecs(JSON.parse(cached));
          return;
        }
      } catch {}
    } else {
      try { sessionStorage.removeItem(cacheKey); } catch {}
    }

    setFilmGenerating(true);
    setFilmError(null);
    setFilmRecs([]);
    setLoadingMsgIdx(0);

    try {
      const prompt = buildFilmPrompt(filmProfile);
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, watchedIds }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");

      const rawRecs: FilmRec[] = json.recommendations || [];

      const enriched = await Promise.all(
        rawRecs.map(async (rec) => {
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/movie/${rec.tmdb_id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=credits`
            );
            const d = await r.json();
            const director = (d.credits?.crew ?? []).find(
              (c: { job: string; id: number; name: string }) =>
                c.job === "Director"
            );
            return {
              ...rec,
              poster_path: d.poster_path,
              year: d.release_date?.slice(0, 4) || rec.year,
              director_name: director?.name,
              director_id: director?.id,
            };
          } catch {
            return rec;
          }
        })
      );

      const safe = enriched.filter(
        (rec) => !watchedIds.includes(String(rec.tmdb_id))
      );
      setFilmRecs(safe);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(safe)); } catch {}
    } catch {
      setFilmError("AI is resting. Please try again in a moment.");
    } finally {
      setFilmGenerating(false);
    }
  };

  // ── Book generation ──────────────────────────────────────────────────────────

  const generateBooks = async (forceFresh = false) => {
    if (!uid) return;
    const cacheKey = BOOKS_RECS_CACHE_KEY(uid);

    if (!forceFresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setBookRecs(JSON.parse(cached));
          return;
        }
      } catch {}
    } else {
      try { sessionStorage.removeItem(cacheKey); } catch {}
    }

    setBookGenerating(true);
    setBookError(null);
    setBookRecs([]);
    setLoadingMsgIdx(0);

    try {
      const prompt = buildBookPrompt(loggedBooks);
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");

      const rawRecs: BookRec[] = json.recommendations || [];
      const loggedKeys = new Set(loggedBooks.map((b) => b.bookKey));

      const enriched = await Promise.all(
        rawRecs.map(async (rec) => {
          const olid = rec.ol_key?.replace("/works/", "");
          let cover_url: string | undefined;
          let author_ol_key: string | undefined;
          if (olid) {
            try {
              const r = await fetch(
                `https://openlibrary.org/works/${olid}.json`
              );
              const d = await r.json();
              if (d.covers?.[0]) cover_url = OL_COVER_ID(d.covers[0]);
              const rawKey: string | undefined =
                d.authors?.[0]?.author?.key;
              if (rawKey) author_ol_key = rawKey.replace("/authors/", "");
            } catch {}
          }
          return { ...rec, cover_url, author_ol_key };
        })
      );

      const safe = enriched.filter((rec) => !loggedKeys.has(rec.ol_key));
      setBookRecs(safe);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(safe)); } catch {}
    } catch {
      setBookError("AI is resting. Please try again in a moment.");
    } finally {
      setBookGenerating(false);
    }
  };

  // ── Music generation ─────────────────────────────────────────────────────────

  const generateMusic = async (forceFresh = false) => {
    if (!uid) return;
    const cacheKey = MUSIC_RECS_CACHE_KEY(uid);

    if (!forceFresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setMusicRecs(JSON.parse(cached));
          return;
        }
      } catch {}
    } else {
      try { sessionStorage.removeItem(cacheKey); } catch {}
    }

    setMusicGenerating(true);
    setMusicError(null);
    setMusicRecs([]);
    setLoadingMsgIdx(0);

    try {
      const prompt = buildMusicPrompt(loggedAlbums);
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");

      const rawRecs: MusicRec[] = json.recommendations || [];
      const loggedMbids = new Set(loggedAlbums.map((a) => a.mbid));

      const enriched = await Promise.all(
        rawRecs.map(async (rec) => {
          let artist_mbid: string | undefined;
          if (rec.mbid) {
            try {
              const r = await fetch(
                `https://musicbrainz.org/ws/2/release-group/${rec.mbid}?inc=artists&fmt=json`,
                { headers: { "User-Agent": "letterboxd-clone/1.0" } }
              );
              const d = await r.json();
              artist_mbid = d["artist-credit"]?.[0]?.artist?.id;
            } catch {}
          }
          return {
            ...rec,
            cover_url: rec.mbid ? CAA_COVER(rec.mbid) : undefined,
            artist_mbid,
          };
        })
      );

      const safe = enriched.filter((rec) => !loggedMbids.has(rec.mbid));
      setMusicRecs(safe);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(safe)); } catch {}
    } catch {
      setMusicError("AI is resting. Please try again in a moment.");
    } finally {
      setMusicGenerating(false);
    }
  };

  // ── Derived per-tab values ────────────────────────────────────────────────────

  const generating =
    activeTab === "films"
      ? filmGenerating
      : activeTab === "books"
      ? bookGenerating
      : musicGenerating;

  const error =
    activeTab === "films"
      ? filmError
      : activeTab === "books"
      ? bookError
      : musicError;

  const hasResults =
    activeTab === "films"
      ? filmRecs.length > 0
      : activeTab === "books"
      ? bookRecs.length > 0
      : musicRecs.length > 0;

  const handleGenerate = (forceFresh = false) => {
    if (activeTab === "films") generateFilms(forceFresh);
    else if (activeTab === "books") generateBooks(forceFresh);
    else generateMusic(forceFresh);
  };

  const resultCount =
    activeTab === "films"
      ? filmRecs.length
      : activeTab === "books"
      ? bookRecs.length
      : musicRecs.length;

  const generateLabel =
    activeTab === "films"
      ? filmProfile
        ? `GENERATE FILMS — ${filmProfile.watchedCount} ANALYZED`
        : "GENERATE FILMS"
      : activeTab === "books"
      ? `GENERATE BOOKS${loggedBooks.length > 0 ? ` — ${loggedBooks.length} READ` : ""}`
      : `GENERATE MUSIC${loggedAlbums.length > 0 ? ` — ${loggedAlbums.length} LISTENED` : ""}`;

  const msgs = LOADING_MESSAGES[activeTab];

  // ── Loading phase ─────────────────────────────────────────────────────────────

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
            <p className="text-sh-grey mb-6 text-sm">
              Loading your taste profile…
            </p>
            <div className="bg-c-grey h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-p-green h-full rounded-full transition-all duration-300"
                style={{
                  width:
                    dataProgress.total > 0
                      ? `${Math.round(
                          (dataProgress.fetched / dataProgress.total) * 100
                        )}%`
                      : "25%",
                  animation:
                    dataProgress.total === 0
                      ? "shimmerBar 1.5s ease-in-out infinite"
                      : "none",
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

  // ── Main view ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(15px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.75); }
          50%       { opacity: 1;    transform: scale(1.1); }
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
              AI recommendations based on your films, books & music
            </p>
          </div>

          {/* Tab switcher */}
          <div className="mb-6 flex justify-center">
            <div className="border-b-grey bg-drop-black inline-flex gap-1 rounded-xl border p-1">
              {(["films", "books", "music"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "rounded-lg px-5 py-2 text-xs font-bold tracking-widest transition-all",
                    activeTab === tab
                      ? "text-p-green"
                      : "text-sh-grey hover:text-p-white",
                  ].join(" ")}
                  style={
                    activeTab === tab
                      ? {
                          background: "rgba(0,224,84,0.08)",
                          boxShadow: "inset 0 0 0 1px rgba(0,224,84,0.3)",
                        }
                      : {}
                  }
                >
                  {tab === "films" ? "🎬" : tab === "books" ? "📖" : "🎵"}{" "}
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Taste profile card */}
          <div
            className="mb-6"
            style={{ animation: "recsCardIn 0.4s ease both" }}
          >
            <TasteCard
              tab={activeTab}
              profile={filmProfile}
              books={loggedBooks}
              albums={loggedAlbums}
            />
          </div>

          {/* Generate button */}
          {!generating && !hasResults && !error && (
            <div
              className="mb-10 text-center"
              style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}
            >
              <button
                onClick={() => handleGenerate(false)}
                disabled={activeTab === "films" && !filmProfile}
                className="bg-p-green hover:bg-b-green text-h-blue rounded-xl px-10 py-3.5 text-sm font-bold tracking-widest shadow-lg transition-colors disabled:opacity-40"
                style={{ boxShadow: "0 0 30px rgba(0,224,84,0.2)" }}
              >
                {generateLabel}
              </button>
              {activeTab === "films" && !filmProfile && (
                <p className="text-sh-grey mt-3 text-xs">
                  Watch some films to unlock recommendations.
                </p>
              )}
            </div>
          )}

          {/* Generating spinner */}
          {generating && (
            <div className="mb-12 flex flex-col items-center gap-5">
              <LoadingDots />
              <p
                key={loadingMsgIdx}
                className="text-sh-grey text-sm"
                style={{ animation: "fadeMsg 0.35s ease both" }}
              >
                {msgs[loadingMsgIdx % msgs.length]}
              </p>
            </div>
          )}

          {/* Error */}
          {error && !generating && (
            <div
              className="mb-8 flex flex-col items-center gap-3"
              style={{ animation: "recsCardIn 0.3s ease both" }}
            >
              <div className="border-b-grey bg-drop-black rounded-xl border px-6 py-4 text-center">
                <p className="mb-3 text-sm text-red-400">{error}</p>
                <button
                  onClick={() => handleGenerate(true)}
                  className="border-b-grey text-sh-grey hover:text-p-white rounded-lg border px-6 py-2 text-xs transition-colors"
                >
                  ↺ Try Again
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {hasResults && !generating && (
            <>
              <div
                className="mb-5 flex items-center justify-between"
                style={{ animation: "recsCardIn 0.35s ease both" }}
              >
                <p className="text-sh-grey text-xs font-bold tracking-widest">
                  {resultCount}{" "}
                  {activeTab === "films"
                    ? "FILM"
                    : activeTab === "books"
                    ? "BOOK"
                    : "ALBUM"}{" "}
                  PICKS
                </p>
                <button
                  onClick={() => handleGenerate(true)}
                  className="border-b-grey text-sh-grey hover:text-p-white flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs transition-colors"
                >
                  ↺ Regenerate
                </button>
              </div>

              {activeTab === "films" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filmRecs.map((rec, i) => (
                    <MovieCard
                      key={`film-${rec.tmdb_id}-${i}`}
                      rec={rec}
                      index={i}
                      watchedIds={watchedIds}
                    />
                  ))}
                </div>
              )}

              {activeTab === "books" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {bookRecs.map((rec, i) => (
                    <BookCard
                      key={`book-${rec.ol_key}-${i}`}
                      rec={rec}
                      index={i}
                    />
                  ))}
                </div>
              )}

              {activeTab === "music" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {musicRecs.map((rec, i) => (
                    <AlbumCard
                      key={`music-${rec.mbid}-${i}`}
                      rec={rec}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
