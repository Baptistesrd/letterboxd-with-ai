"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TMDBFilmCredit {
  id: number;
  title: string;
  release_date?: string;
  poster_path: string | null;
  vote_average: number;
  popularity: number;
  character?: string;
}

interface TMDBPerson {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  movie_credits: {
    crew: TMDBFilmCredit[];
    cast: TMDBFilmCredit[];
  };
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_PROFILE = "https://image.tmdb.org/t/p/w300";

// ─── SKELETON ─────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="aspect-[2/3] rounded-xl bg-c-grey" />
        <div className="mt-2 h-3 w-3/4 rounded bg-c-grey" />
        <div className="mt-1 h-2.5 w-1/2 rounded bg-c-grey" />
      </div>
    ))}
  </div>
);

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function ActorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [person, setPerson] = useState<TMDBPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [ratingMap, setRatingMap] = useState<Record<string, number>>({});

  // Optional: load user's watch history for badge overlay
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const ids = new Set<string>(
            (data.watched ?? []).map((w: { movieID: string }) => w.movieID)
          );
          setWatchedIds(ids);
          const ratings: Record<string, number> = {};
          (data.reviews ?? []).forEach(
            (r: { movieID: string; rating?: number }) => {
              if (r.rating) ratings[r.movieID] = r.rating;
            }
          );
          setRatingMap(ratings);
        }
      } catch {}
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    fetch(
      `https://api.themoviedb.org/3/person/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=movie_credits`
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setPerson)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const films = person
    ? (person.movie_credits.cast ?? [])
        .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
        .sort((a, b) => b.popularity - a.popularity)
    : [];

  return (
    <>
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <LayoutNavbar />

      <main className="bg-h-blue min-h-screen px-4 pb-20 pt-8">
        <div className="mx-auto max-w-5xl">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="text-sh-grey hover:text-p-white mb-6 flex items-center gap-1.5 text-sm transition-colors"
          >
            ← Back
          </button>

          {error ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sh-grey">Could not load profile.</p>
            </div>
          ) : loading || !person ? (
            <>
              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <div className="bg-c-grey h-48 w-32 flex-shrink-0 animate-pulse rounded-xl" />
                <div className="flex-1 space-y-3">
                  <div className="bg-c-grey h-8 w-48 animate-pulse rounded" />
                  <div className="bg-c-grey h-4 w-full animate-pulse rounded" />
                  <div className="bg-c-grey h-4 w-5/6 animate-pulse rounded" />
                </div>
              </div>
              <Skeleton />
            </>
          ) : (
            <>
              {/* Header */}
              <div
                className="mb-8 flex flex-col gap-6 sm:flex-row"
                style={{ animation: "recsCardIn 0.4s ease both" }}
              >
                {person.profile_path ? (
                  <div className="relative h-48 w-32 flex-shrink-0 overflow-hidden rounded-xl">
                    <Image
                      src={`${TMDB_PROFILE}${person.profile_path}`}
                      alt={person.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="bg-c-grey flex h-48 w-32 flex-shrink-0 items-center justify-center rounded-xl text-4xl">
                    🎭
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sh-grey mb-1 text-xs font-bold tracking-widest">
                    ACTOR
                  </p>
                  <h1 className="text-p-white mb-1 text-3xl font-bold">
                    {person.name}
                  </h1>
                  {person.birthday && (
                    <p className="text-sh-grey mb-3 text-sm">
                      Born {person.birthday}
                      {person.place_of_birth
                        ? ` · ${person.place_of_birth}`
                        : ""}
                    </p>
                  )}
                  {person.biography ? (
                    <p className="text-sh-grey line-clamp-5 text-sm leading-relaxed">
                      {person.biography}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Filmography */}
              <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>
                <p className="text-sh-grey mb-4 text-xs font-bold tracking-widest">
                  APPEARED IN
                  <span className="text-p-green ml-2">{films.length}</span>
                </p>

                {films.length === 0 ? (
                  <p className="text-sh-grey text-sm">No films found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {films.map((film, i) => {
                      const mid = film.id.toString();
                      const watched = watchedIds.has(mid);
                      const rating = ratingMap[mid];
                      return (
                        <Link
                          key={film.id}
                          href={`/movie/${film.id}`}
                          className="group block"
                          style={{
                            animation: "recsCardIn 0.45s ease both",
                            animationDelay: `${i * 30}ms`,
                          }}
                        >
                          <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-c-grey">
                            {film.poster_path ? (
                              <Image
                                src={`${TMDB_IMG}${film.poster_path}`}
                                alt={film.title}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                sizes="(max-width: 640px) 50vw, 20vw"
                              />
                            ) : (
                              <div className="text-sh-grey flex h-full items-center justify-center text-2xl">
                                🎬
                              </div>
                            )}

                            {/* Hover overlay */}
                            <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <p className="text-p-white text-xs font-bold leading-tight">
                                {film.title}
                              </p>
                              {film.character && (
                                <p className="text-sh-grey mt-0.5 text-[10px] italic">
                                  as {film.character}
                                </p>
                              )}
                              {film.release_date && (
                                <p className="text-sh-grey mt-0.5 text-[10px]">
                                  {film.release_date.slice(0, 4)}
                                </p>
                              )}
                              {film.vote_average > 0 && (
                                <p className="mt-1 text-[10px] text-yellow-400">
                                  ★ {film.vote_average.toFixed(1)}
                                </p>
                              )}
                            </div>

                            {/* Watched / rated badge */}
                            {watched && (
                              <div className="absolute left-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                {rating ? `★ ${rating}` : "✓ Watched"}
                              </div>
                            )}

                            {/* TMDB rating (only when not watched) */}
                            {!watched && film.vote_average > 0 && (
                              <div className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-yellow-400 backdrop-blur-sm">
                                ★ {film.vote_average.toFixed(1)}
                              </div>
                            )}
                          </div>

                          <div className="mt-2 px-0.5">
                            <p className="text-p-white truncate text-xs font-bold leading-tight">
                              {film.title}
                            </p>
                            {film.release_date && (
                              <p className="text-sh-grey text-xs">
                                {film.release_date.slice(0, 4)}
                              </p>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
