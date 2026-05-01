"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface MBReleaseGroup {
  id: string;
  title: string;
  "primary-type"?: string;
  "first-release-date"?: string;
}

interface MBArtist {
  id: string;
  name: string;
  country?: string;
  "life-span"?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  "release-groups": MBReleaseGroup[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CAA_COVER = (mbid: string) =>
  `https://coverartarchive.org/release-group/${mbid}/front-250`;

// ─── SKELETON ─────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="aspect-square rounded-xl bg-c-grey" />
        <div className="mt-2 h-3 w-3/4 rounded bg-c-grey" />
        <div className="mt-1 h-2.5 w-1/2 rounded bg-c-grey" />
      </div>
    ))}
  </div>
);

// ─── ALBUM COVER ──────────────────────────────────────────────────────────────

function AlbumCover({ mbid, title }: { mbid: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="text-sh-grey flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
        <span className="text-2xl">🎵</span>
        <p className="text-xs leading-tight">{title}</p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CAA_COVER(mbid)}
      alt={title}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      onError={() => setFailed(true)}
    />
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function ArtistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = use(params);
  const router = useRouter();

  const [artist, setArtist] = useState<MBArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loggedMbids, setLoggedMbids] = useState<Set<string>>(new Set());

  // Optional: load user's logged albums for badge
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const albums: { mbid: string }[] = snap.data().albums ?? [];
          setLoggedMbids(new Set(albums.map((a) => a.mbid)));
        }
      } catch {}
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    fetch(
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=release-groups&fmt=json`,
      { headers: { "User-Agent": "letterboxd-clone/1.0" } }
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setArtist)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mbid]);

  const albums = artist
    ? (artist["release-groups"] ?? [])
        .filter((rg) => rg["primary-type"] === "Album")
        .sort((a, b) =>
          (a["first-release-date"] ?? "").localeCompare(
            b["first-release-date"] ?? ""
          )
        )
    : [];

  const lifeSpan = artist?.["life-span"];
  const career =
    lifeSpan?.begin
      ? `${lifeSpan.begin}${lifeSpan.end ? ` — ${lifeSpan.end}` : lifeSpan.ended ? " — present" : ""}`
      : null;

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
          ) : loading || !artist ? (
            <>
              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <div className="bg-c-grey h-32 w-32 flex-shrink-0 animate-pulse rounded-xl" />
                <div className="flex-1 space-y-3">
                  <div className="bg-c-grey h-8 w-48 animate-pulse rounded" />
                  <div className="bg-c-grey h-4 w-full animate-pulse rounded" />
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
                <div className="bg-c-grey flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-xl text-5xl">
                  🎵
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sh-grey mb-1 text-xs font-bold tracking-widest">
                    ARTIST
                  </p>
                  <h1 className="text-p-white mb-1 text-3xl font-bold">
                    {artist.name}
                  </h1>
                  <div className="text-sh-grey flex flex-wrap gap-3 text-sm">
                    {artist.country && <span>{artist.country}</span>}
                    {career && <span>{career}</span>}
                  </div>
                </div>
              </div>

              {/* Discography */}
              <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>
                <p className="text-sh-grey mb-4 text-xs font-bold tracking-widest">
                  DISCOGRAPHY
                  <span className="text-p-green ml-2">{albums.length}</span>
                </p>

                {albums.length === 0 ? (
                  <p className="text-sh-grey text-sm">No albums found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {albums.map((album, i) => {
                      const isLogged = loggedMbids.has(album.id);
                      const year = album["first-release-date"]?.slice(0, 4);
                      return (
                        <div
                          key={album.id}
                          className="group cursor-default"
                          style={{
                            animation: "recsCardIn 0.45s ease both",
                            animationDelay: `${i * 30}ms`,
                          }}
                        >
                          <div className="relative aspect-square overflow-hidden rounded-xl bg-c-grey">
                            <AlbumCover mbid={album.id} title={album.title} />

                            {/* Hover overlay */}
                            <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <p className="text-p-white text-xs font-bold leading-tight">
                                {album.title}
                              </p>
                              {year && (
                                <p className="text-sh-grey mt-0.5 text-[10px]">
                                  {year}
                                </p>
                              )}
                            </div>

                            {/* Logged badge */}
                            {isLogged && (
                              <div className="absolute left-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                ✓ Listened
                              </div>
                            )}
                          </div>

                          <div className="mt-2 px-0.5">
                            <p className="text-p-white truncate text-xs font-bold leading-tight">
                              {album.title}
                            </p>
                            {year && (
                              <p className="text-sh-grey text-xs">{year}</p>
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
