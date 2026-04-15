"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserReview } from "app/types";

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

interface Recommendation {
  title: string;
  year: number;
  reason: string;
  tmdb_id: number;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
  genres?: string[];
}

interface TasteProfile {
  watchedCount: number;
  topGenres: { name: string; count: number }[];
  topDirectors: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  topDecades: { decade: string; count: number }[];
  avgRating: number;
  ratedCount: number;
  lovedFilms: {
    title: string;
    year: string;
    genres: string[];
    director: string;
    rating: number;
  }[];
  dislikedFilms: { title: string; year: string; genres: string[] }[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TMDB_POSTER = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_SM = "https://image.tmdb.org/t/p/w185";
const MOVIES_CACHE_KEY = (uid: string) => `recs_movies_v2_${uid}`;
const RECS_CACHE_KEY = (uid: string) => `recs_results_v1_${uid}`;
const BATCH_SIZE = 20;

const LOADING_MESSAGES = [
  "Analyzing your taste...",
  "Scanning thousands of films...",
  "Finding your hidden gems...",
  "Matching your preferences...",
  "Consulting the critics...",
  "Curating your personal list...",
  "Almost ready...",
];

const CHART_COLORS = [
  "#00e054",
  "#40bcf4",
  "#f59e0b",
  "#c084fc",
  "#f87171",
  "#34d399",
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

function computeProfile(
  movies: TMDBDetail[],
  reviews: UserReview[],
  watchedIds: string[]
): TasteProfile {
  const movieMap = Object.fromEntries(movies.map((m) => [m.id.toString(), m]));
  const ratedReviews = reviews.filter((r) => r.rating !== undefined && r.rating > 0);

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
      ? ratedReviews.reduce((acc, r) => acc + (r.rating ?? 0), 0) / ratedReviews.length
      : 0;

  const lovedFilms = [...ratedReviews]
    .filter((r) => (r.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 15)
    .map((r) => {
      const m = movieMap[r.movieID];
      const director =
        m?.credits.crew.find((c) => c.job === "Director")?.name ?? "Unknown";
      return {
        title: m?.title ?? `Film #${r.movieID}`,
        year: m?.release_date?.slice(0, 4) ?? "",
        genres: m?.genres.map((g) => g.name) ?? [],
        director,
        rating: r.rating ?? 0,
      };
    });

  const dislikedFilms = [...ratedReviews]
    .filter((r) => (r.rating ?? 0) <= 2)
    .sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0))
    .slice(0, 8)
    .map((r) => {
      const m = movieMap[r.movieID];
      return {
        title: m?.title ?? `Film #${r.movieID}`,
        year: m?.release_date?.slice(0, 4) ?? "",
        genres: m?.genres.map((g) => g.name) ?? [],
      };
    });

  const decadeData = countBy(decadeNames).map(({ name, count }) => ({
    decade: name,
    count,
  }));

  return {
    watchedCount: watchedIds.length,
    topGenres: countBy(genreNames).slice(0, 6),
    topDirectors: countBy(dirNames).slice(0, 5),
    topActors,
    topDecades: decadeData.slice(0, 5),
    avgRating,
    ratedCount: ratedReviews.length,
    lovedFilms,
    dislikedFilms,
  };
}

function buildPrompt(
  profile: TasteProfile,
  watchedIds: string[],
  seed: number
): string {
  const loved = profile.lovedFilms
    .map(
      (f) =>
        `- ${f.title} (${f.year}) [${f.genres.join(", ")}] dir. ${f.director} ★${f.rating}`
    )
    .join("\n");

  const disliked = profile.dislikedFilms
    .map((f) => `- ${f.title} (${f.year}) [${f.genres.join(", ")}]`)
    .join("\n");

  return `I've watched ${profile.watchedCount} films. Recommend 20 films I would love but haven't seen.

MY TASTE PROFILE:
Top Genres: ${profile.topGenres.map((g) => `${g.name} (${g.count} films)`).join(", ")}
Top Directors: ${profile.topDirectors.map((d) => `${d.name} (${d.count} films)`).join(", ")}
Top Actors: ${profile.topActors.map((a) => `${a.name} (${a.count} films)`).join(", ")}
Favorite Decades: ${profile.topDecades.map((d) => `${d.decade}: ${d.count} films`).join(", ")}
${profile.ratedCount > 0 ? `Average Rating: ${profile.avgRating.toFixed(1)}/5 across ${profile.ratedCount} rated films` : "No ratings yet"}

${loved ? `FILMS I LOVED (≥4★ — find similar gems):\n${loved}` : ""}

${disliked ? `FILMS I DISLIKED (≤2★ — avoid similar):\n${disliked}` : ""}

TMDB IDs I've already watched (exclude ALL of these): ${watchedIds.slice(0, 100).join(", ")}

Variety seed (for fresh results): ${seed}

Return ONLY a JSON array of exactly 20 recommendations:
[{"title":"...","year":2020,"reason":"...","tmdb_id":12345}]`;
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
    ✦ Claude AI
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

const MovieCard = ({
  rec,
  index,
}: {
  rec: Recommendation;
  index: number;
}) => (
  <div
    className="group cursor-default"
    style={{
      animation: "recsCardIn 0.45s ease both",
      animationDelay: `${index * 35}ms`,
    }}
  >
    {/* Poster */}
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

      {/* Hover overlay — shows Claude's reason */}
      <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p
          className="text-sh-grey mb-1.5 text-[10px] font-bold tracking-widest"
        >
          WHY YOU'LL LOVE IT
        </p>
        <p className="text-p-white text-xs leading-relaxed">{rec.reason}</p>
        {rec.genres && rec.genres.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {rec.genres.slice(0, 3).map((g, i) => (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 text-[10px] text-sh-grey"
                style={{ background: "rgba(40,48,56,0.9)" }}
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* TMDB score badge */}
      {rec.vote_average && rec.vote_average > 0 && (
        <div className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-sm">
          ★ {rec.vote_average.toFixed(1)}
        </div>
      )}
    </div>

    {/* Title + year */}
    <div className="mt-2 px-0.5">
      <p className="text-p-white truncate text-sm font-bold leading-tight">
        {rec.title}
      </p>
      <p className="text-sh-grey text-xs">{rec.year}</p>
    </div>
  </div>
);

const ProfileCard = ({ profile }: { profile: TasteProfile }) => (
  <div className="border-b-grey bg-drop-black rounded-xl border p-5 md:p-6">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sh-grey text-xs font-bold tracking-widest">
        YOUR TASTE PROFILE
      </h2>
      <div className="flex items-center gap-3">
        {profile.ratedCount > 0 && (
          <span className="text-yellow-400 text-xs">
            ★ {profile.avgRating.toFixed(1)} avg
          </span>
        )}
        <span className="text-p-green text-xs font-bold">
          {profile.watchedCount} films
        </span>
      </div>
    </div>

    {/* Genre pills */}
    <div className="mb-4 flex flex-wrap gap-2">
      {profile.topGenres.map((g, i) => (
        <span
          key={i}
          className="rounded-full border px-3 py-1 text-xs font-bold transition-colors"
          style={{
            borderColor: i === 0 ? "#00e054" : "#456",
            color: i === 0 ? "#00e054" : "#9ab",
            background: i === 0 ? "rgba(0,224,84,0.08)" : "transparent",
          }}
        >
          {g.name}
          <span className="ml-1 opacity-50">{g.count}</span>
        </span>
      ))}
    </div>

    {/* Director + decade row */}
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 md:grid-cols-3">
      <div>
        <p className="text-sh-grey mb-0.5 text-[10px] font-bold tracking-wider opacity-60">
          TOP DIRECTORS
        </p>
        <p className="text-p-white truncate">
          {profile.topDirectors
            .slice(0, 3)
            .map((d) => d.name)
            .join(" · ")}
        </p>
      </div>
      <div>
        <p className="text-sh-grey mb-0.5 text-[10px] font-bold tracking-wider opacity-60">
          TOP ACTORS
        </p>
        <p className="text-p-white truncate">
          {profile.topActors
            .slice(0, 3)
            .map((a) => a.name)
            .join(" · ")}
        </p>
      </div>
      <div>
        <p className="text-sh-grey mb-0.5 text-[10px] font-bold tracking-wider opacity-60">
          FAVORITE DECADES
        </p>
        <p className="text-p-white">
          {profile.topDecades
            .slice(0, 3)
            .map((d) => d.decade)
            .join(" · ")}
        </p>
      </div>
    </div>
  </div>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataProgress, setDataProgress] = useState({ fetched: 0, total: 0 });

  const [generating, setGenerating] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
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

  // Auth guard + initial data load
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
    const cacheKey = MOVIES_CACHE_KEY(userId);
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { movies, reviews, ids } = JSON.parse(cached);
        setProfile(computeProfile(movies, reviews, ids));
        setWatchedIds(ids);
        setLoadingData(false);
        return;
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
      const ids: string[] = (data.watched ?? []).map((w: any) => w.movieID);
      const reviewIds = userReviews.map((r) => r.movieID);
      const allIds = [...new Set([...ids, ...reviewIds])];

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

      const p = computeProfile(fetched, userReviews, ids);
      setProfile(p);
      setWatchedIds(ids);

      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ movies: fetched, reviews: userReviews, ids })
        );
      } catch {}
    } catch (err) {
      console.error("loadUserData error:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const generateRecommendations = async (forceFresh = false) => {
    if (!profile || !uid) return;

    const cacheKey = RECS_CACHE_KEY(uid);

    if (!forceFresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setRecommendations(JSON.parse(cached));
          return;
        }
      } catch {}
    } else {
      try { sessionStorage.removeItem(cacheKey); } catch {}
    }

    setGenerating(true);
    setError(null);
    setRecommendations([]);

    const seed = Math.floor(Math.random() * 99999);

    try {
      const prompt = buildPrompt(profile, watchedIds, seed);

      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error ?? "API error");
      }

      const rawRecs: Recommendation[] = json.recommendations ?? [];

      // Enrich each rec with TMDB details
      const enriched = await Promise.all(
        rawRecs.map(async (rec) => {
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
                overview: d.overview ?? "",
                vote_average: d.vote_average ?? 0,
                genres: (d.genres ?? []).map((g: any) => g.name),
              };
            }
          } catch {}
          return rec;
        })
      );

      setRecommendations(enriched);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(enriched));
      } catch {}
    } catch (err: any) {
      console.error("generateRecommendations error:", err);
      setError(err.message ?? "Failed to generate recommendations. Please try again.");
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
              AI PICKS
            </p>
            <p className="text-sh-grey mb-6 text-sm">
              Loading your film diary…
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

  if (!profile || profile.watchedCount === 0) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p
            className="text-p-green mb-3 text-4xl font-bold tracking-widest"
            style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}
          >
            AI PICKS
          </p>
          <p className="text-sh-grey max-w-sm text-sm">
            Add films to your watched list and rate them to get personalized AI
            recommendations.
          </p>
        </main>
        <Footer />
      </>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

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

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="mb-8 text-center">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-3">
              <h1
                className="text-p-green text-5xl font-bold tracking-widest md:text-6xl"
                style={{ textShadow: "0 0 50px rgba(0,224,84,0.25)" }}
              >
                AI PICKS
              </h1>
              <AIBadge />
            </div>
            <p className="text-sh-grey text-sm">
              Personalized recommendations powered by Claude
            </p>
          </div>

          {/* ── Taste profile ──────────────────────────────────────────── */}
          <div
            className="mb-6"
            style={{ animation: "recsCardIn 0.4s ease both" }}
          >
            <ProfileCard profile={profile} />
          </div>

          {/* ── Generate button (before first generation) ──────────────── */}
          {!generating && recommendations.length === 0 && !error && (
            <div
              className="mb-10 text-center"
              style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}
            >
              <button
                onClick={() => generateRecommendations(false)}
                className="bg-p-green hover:bg-b-green text-h-blue rounded-xl px-10 py-3.5 text-sm font-bold tracking-widest shadow-lg transition-colors"
                style={{ boxShadow: "0 0 30px rgba(0,224,84,0.2)" }}
              >
                GENERATE RECOMMENDATIONS
              </button>
              <p className="text-sh-grey mt-3 text-xs">
                Claude will analyze your{" "}
                <span className="text-p-white">{profile.watchedCount} films</span> and{" "}
                {profile.ratedCount > 0 ? (
                  <>
                    <span className="text-p-white">{profile.ratedCount} ratings</span>
                  </>
                ) : (
                  "viewing history"
                )}{" "}
                to find your perfect next watch.
              </p>
            </div>
          )}

          {/* ── Generating state ───────────────────────────────────────── */}
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

          {/* ── Error ─────────────────────────────────────────────────── */}
          {error && (
            <div
              className="mb-8 flex flex-col items-center gap-3"
              style={{ animation: "recsCardIn 0.3s ease both" }}
            >
              <div className="border-b-grey bg-drop-black rounded-xl border px-6 py-4 text-center">
                <p className="text-red-400 mb-3 text-sm">{error}</p>
                <button
                  onClick={() => generateRecommendations(true)}
                  className="border-b-grey text-sh-grey hover:text-p-white rounded-lg border px-6 py-2 text-xs transition-colors"
                >
                  ↺ Try Again
                </button>
              </div>
            </div>
          )}

          {/* ── Results grid ──────────────────────────────────────────── */}
          {recommendations.length > 0 && (
            <>
              {/* Toolbar */}
              <div
                className="mb-5 flex items-center justify-between"
                style={{ animation: "recsCardIn 0.35s ease both" }}
              >
                <p className="text-sh-grey text-xs font-bold tracking-widest">
                  {recommendations.length} PICKS FOR YOU
                </p>
                <button
                  onClick={() => generateRecommendations(true)}
                  disabled={generating}
                  className="border-b-grey text-sh-grey hover:text-p-white flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40"
                >
                  ↺ <span>Regenerate</span>
                </button>
              </div>

              {/* Movie grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {recommendations.map((rec, i) => (
                  <MovieCard key={`${rec.tmdb_id}-${i}`} rec={rec} index={i} />
                ))}
              </div>

              {/* Bottom CTA */}
              <div className="mt-10 text-center">
                <button
                  onClick={() => generateRecommendations(true)}
                  disabled={generating}
                  className="border-b-grey text-sh-grey hover:text-p-white rounded-xl border px-8 py-3 text-sm transition-colors disabled:opacity-40"
                >
                  ↺ Get Fresh Recommendations
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
