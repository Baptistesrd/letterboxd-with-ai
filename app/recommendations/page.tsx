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
  director_name?: string;
  director_id?: number;
}

interface TasteProfile {
  watchedCount: number;
  topGenres: { name: string; count: number }[];
  topDirectors: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  topDecades: { decade: string; count: number }[];
  avgRating: number;
  ratedCount: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TMDB_POSTER = "https://image.tmdb.org/t/p/w500";
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

  return {
    watchedCount: watchedIds.length,
    topGenres: countBy(genreNames).slice(0, 6),
    topDirectors: countBy(dirNames).slice(0, 5),
    topActors,
    topDecades: countBy(decadeNames).slice(0, 5).map(d => ({ decade: d.name, count: d.count })),
    avgRating,
    ratedCount: ratedReviews.length,
  };
}

function buildPrompt(profile: TasteProfile, seed: number): string {
  return `Based on my taste:
- Favorite Genres: ${profile.topGenres.map(g => g.name).join(", ")}
- Top Directors: ${profile.topDirectors.map(d => d.name).join(", ")}
- Preferred Eras: ${profile.topDecades.map(d => d.decade).join(", ")}
- Average rating I give: ${profile.avgRating.toFixed(1)}/5
- Randomness seed: ${seed}

Recommend 15 movies I haven't seen. 
CRITICAL: Return ONLY a JSON object with a "recommendations" key.`;
}

// ─── INLINE COMPONENTS ────────────────────────────────────────────────────────

const AIBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(0,224,84,0.15)", border: "1px solid rgba(0,224,84,0.4)", color: "#00e054" }}>
    ✦ Groq AI
  </span>
);

const MovieCard = ({ rec, index }: { rec: Recommendation; index: number }) => (
  <div className="group cursor-default" style={{ animation: "recsCardIn 0.45s ease both", animationDelay: `${index * 35}ms` }}>
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#1a1d23]">
      {rec.poster_path ? (
        <Image
          src={TMDB_POSTER + rec.poster_path}
          alt={rec.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, 20vw"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center p-3 text-center text-gray-500">🎬</div>
      )}
      <div className="absolute inset-0 flex flex-col justify-end bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="mb-1 text-[10px] font-bold tracking-widest text-gray-400">WHY YOU'LL LOVE IT</p>
        <p className="text-xs leading-relaxed text-white">{rec.reason}</p>
        {rec.director_name && rec.director_id && (
          <Link
            href={`/director/${rec.director_id}`}
            className="mt-1.5 text-[10px] text-gray-400 hover:text-[#00e054] transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {rec.director_name}
          </Link>
        )}
      </div>
    </div>
    <div className="mt-2 px-0.5">
      <p className="truncate text-sm font-bold text-white">{rec.title}</p>
      <p className="text-xs text-gray-400">{rec.year}</p>
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
  const [generating, setGenerating] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push("/"); return; }
      setUid(user.uid);
      setReady(true);
      loadUserData(user.uid);
    });
    return () => unsub();
  }, [router]);

  const loadUserData = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (!snap.exists()) { setLoadingData(false); return; }

      const data = snap.data();
      const userReviews: UserReview[] = data.reviews ?? [];
      const ids: string[] = (data.watched ?? []).map((w: any) => w.movieID);
      const allIds = [...new Set([...ids, ...userReviews.map(r => r.movieID)])];

      const fetched: TMDBDetail[] = [];
      const batch = allIds.slice(0, 40); // Analyse des 40 derniers films pour le profil

      const results = await Promise.all(
        batch.map(id => fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=credits`).then(r => r.json()))
      );

      results.forEach(m => { if (m && m.id) fetched.push(m); });
      setProfile(computeProfile(fetched, userReviews, ids));
      setWatchedIds(ids);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const generateRecommendations = async () => {
    if (!profile || !uid) return;
    setGenerating(true);
    setError(null);

    try {
      const seed = Math.floor(Math.random() * 9999);
      const prompt = buildPrompt(profile, seed);

      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");

      const rawRecs: Recommendation[] = json.recommendations || [];

      const enriched = await Promise.all(
        rawRecs.map(async (rec) => {
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/movie/${rec.tmdb_id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=credits`
            );
            const d = await r.json();
            const director = (d.credits?.crew ?? []).find(
              (c: { job: string; id: number; name: string }) => c.job === "Director"
            );
            return {
              ...rec,
              poster_path: d.poster_path,
              year: d.release_date?.slice(0, 4) || rec.year,
              director_name: director?.name,
              director_id: director?.id,
            };
          } catch { return rec; }
        })
      );

      setRecommendations(enriched);
    } catch (err: any) {
      setError("AI is resting. Please try again in a moment.");
    } finally {
      setGenerating(false);
    }
  };

  if (!ready || loadingData) return <div className="flex h-screen items-center justify-center bg-[#050a0f] text-[#00e054]">Analyzing Diary...</div>;

  return (
    <>
      <style>{`
        @keyframes recsCardIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <LayoutNavbar />
      <main className="min-h-screen bg-[#050a0f] px-4 pb-20 pt-10 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <div className="mb-3 flex items-center justify-center gap-4">
              <h1 className="text-5xl font-black tracking-tighter text-[#00e054] md:text-6xl">AI PICKS</h1>
              <AIBadge />
            </div>
            <p className="text-gray-400">Discover your next favorite film based on your history.</p>
          </div>

          {!generating && recommendations.length === 0 && (
            <div className="flex flex-col items-center gap-6">
              <button
                onClick={generateRecommendations}
                className="rounded-xl bg-[#00e054] px-10 py-4 text-sm font-bold tracking-widest text-black transition-transform hover:scale-105 active:scale-95"
              >
                GENERATE RECOMMENDATIONS
              </button>
              {profile && <p className="text-xs text-gray-500">Analyzed {profile.watchedCount} films from your library.</p>}
            </div>
          )}

          {generating && (
            <div className="py-20 text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#00e054] border-t-transparent"></div>
              <p className="animate-pulse text-gray-400">Claude is thinking...</p>
            </div>
          )}

          {error && <div className="text-center text-red-400 mb-8">{error}</div>}

          {recommendations.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {recommendations.map((rec, i) => (
                <MovieCard key={i} rec={rec} index={i} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
