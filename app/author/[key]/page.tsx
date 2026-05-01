"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface OLAuthor {
  name: string;
  bio?: string | { value: string };
  birth_date?: string;
  death_date?: string;
  photos?: number[];
}

interface OLWork {
  key: string;
  title: string;
  covers?: number[];
  first_publish_date?: string;
}

interface OLWorksResponse {
  entries: OLWork[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const OL_COVER_ID = (id: number, size: "S" | "M" | "L" = "M") =>
  `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;

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

export default function AuthorPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const router = useRouter();

  const [author, setAuthor] = useState<OLAuthor | null>(null);
  const [works, setWorks] = useState<OLWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loggedKeys, setLoggedKeys] = useState<Set<string>>(new Set());

  // Optional: load user's logged books for badge
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const books: { bookKey: string }[] = snap.data().books ?? [];
          setLoggedKeys(new Set(books.map((b) => b.bookKey)));
        }
      } catch {}
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [authorRes, worksRes] = await Promise.all([
          fetch(`https://openlibrary.org/authors/${key}.json`),
          fetch(
            `https://openlibrary.org/authors/${key}/works.json?limit=50`
          ),
        ]);
        if (!authorRes.ok) throw new Error();
        const authorData: OLAuthor = await authorRes.json();
        setAuthor(authorData);

        if (worksRes.ok) {
          const worksData: OLWorksResponse = await worksRes.json();
          setWorks(worksData.entries ?? []);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [key]);

  const bio =
    author?.bio == null
      ? null
      : typeof author.bio === "string"
      ? author.bio
      : author.bio.value;

  const photoUrl =
    author?.photos && author.photos.length > 0
      ? OL_COVER_ID(author.photos[0], "L")
      : `https://covers.openlibrary.org/a/olid/${key}-L.jpg`;

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
          ) : loading || !author ? (
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
                <AuthorPhoto url={photoUrl} name={author.name} />

                <div className="min-w-0 flex-1">
                  <p className="text-sh-grey mb-1 text-xs font-bold tracking-widest">
                    AUTHOR
                  </p>
                  <h1 className="text-p-white mb-1 text-3xl font-bold">
                    {author.name}
                  </h1>
                  {(author.birth_date || author.death_date) && (
                    <p className="text-sh-grey mb-3 text-sm">
                      {author.birth_date ?? "?"}
                      {author.death_date ? ` — ${author.death_date}` : ""}
                    </p>
                  )}
                  {bio && (
                    <p className="text-sh-grey line-clamp-5 text-sm leading-relaxed">
                      {bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Bibliography */}
              <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>
                <p className="text-sh-grey mb-4 text-xs font-bold tracking-widest">
                  BIBLIOGRAPHY
                  <span className="text-p-green ml-2">{works.length}</span>
                </p>

                {works.length === 0 ? (
                  <p className="text-sh-grey text-sm">No works found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {works.map((work, i) => {
                      const isLogged = loggedKeys.has(work.key);
                      const coverId = work.covers?.[0];
                      return (
                        <div
                          key={work.key}
                          className="group cursor-default"
                          style={{
                            animation: "recsCardIn 0.45s ease both",
                            animationDelay: `${i * 30}ms`,
                          }}
                        >
                          <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-c-grey">
                            {coverId ? (
                              <Image
                                src={OL_COVER_ID(coverId)}
                                alt={work.title}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                sizes="(max-width: 640px) 50vw, 20vw"
                                unoptimized
                              />
                            ) : (
                              <div className="text-sh-grey flex h-full items-center justify-center text-2xl">
                                📖
                              </div>
                            )}

                            {/* Hover overlay */}
                            <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <p className="text-p-white text-xs font-bold leading-tight">
                                {work.title}
                              </p>
                              {work.first_publish_date && (
                                <p className="text-sh-grey mt-0.5 text-[10px]">
                                  {work.first_publish_date}
                                </p>
                              )}
                            </div>

                            {/* Logged badge */}
                            {isLogged && (
                              <div className="absolute left-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                ✓ Read
                              </div>
                            )}
                          </div>

                          <div className="mt-2 px-0.5">
                            <p className="text-p-white truncate text-xs font-bold leading-tight">
                              {work.title}
                            </p>
                            {work.first_publish_date && (
                              <p className="text-sh-grey text-xs">
                                {work.first_publish_date}
                              </p>
                            )}
                          </div>
                        </div>
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

// Photo with graceful 404 fallback
function AuthorPhoto({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="bg-c-grey flex h-48 w-32 flex-shrink-0 items-center justify-center rounded-xl text-4xl">
        ✍️
      </div>
    );
  }
  return (
    <div className="relative h-48 w-32 flex-shrink-0 overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
