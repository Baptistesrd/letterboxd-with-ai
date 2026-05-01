"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserAlbum } from "app/types";
import {
  MediaSearchInput,
  SearchResult,
  MBReleaseGroup,
} from "app/components/Search/MediaSearchInput";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CAA_COVER = (mbid: string) =>
  `https://coverartarchive.org/release-group/${mbid}/front-250`;

// ─── INLINE COMPONENTS ────────────────────────────────────────────────────────

const StarRating = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        onClick={() => onChange(n)}
        className={`text-2xl transition-transform hover:scale-110 ${
          n <= value ? "text-yellow-400" : "text-sh-grey"
        }`}
      >
        ★
      </button>
    ))}
  </div>
);

/** Album cover that gracefully handles CoverArt Archive 404s. */
function AlbumCover({
  mbid,
  title,
  className = "",
}: {
  mbid: string;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
        <span className="text-sh-grey text-2xl">🎵</span>
        <p className="text-sh-grey text-xs leading-tight">{title}</p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CAA_COVER(mbid)}
      alt={title}
      className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const getArtistName = (album: MBReleaseGroup) =>
  album["artist-credit"]?.[0]?.artist?.name ?? "Unknown";

const getReleaseYear = (album: MBReleaseGroup) =>
  album["first-release-date"]?.slice(0, 4) ?? "";

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function MusicPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [selectedAlbum, setSelectedAlbum] = useState<MBReleaseGroup | null>(null);
  const [modalRating, setModalRating] = useState(0);
  const [modalReview, setModalReview] = useState("");
  const [saving, setSaving] = useState(false);

  const [loggedAlbums, setLoggedAlbums] = useState<UserAlbum[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(true);

  // Auth guard + load logged albums
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setReady(true);
      setUid(user.uid);
      loadLoggedAlbums(user.uid);
    });
    return () => unsub();
  }, []);

  const loadLoggedAlbums = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) {
        setLoggedAlbums(snap.data().albums ?? []);
      }
    } catch (err) {
      console.error("loadLoggedAlbums error:", err);
    } finally {
      setLoadingAlbums(false);
    }
  };

  const openModal = (album: MBReleaseGroup) => {
    setSelectedAlbum(album);
    setModalRating(0);
    setModalReview("");
  };

  const closeModal = () => setSelectedAlbum(null);

  const handleSearchSelect = (item: SearchResult) => {
    if (item.type === "album") openModal(item.raw);
  };

  const saveAlbum = async () => {
    if (!selectedAlbum || !uid || modalRating === 0) return;
    setSaving(true);
    try {
      const entry: UserAlbum = {
        mbid: selectedAlbum.id,
        title: selectedAlbum.title,
        artist: getArtistName(selectedAlbum),
        cover_url: CAA_COVER(selectedAlbum.id),
        rating: modalRating,
        review: modalReview.trim() || undefined,
        timestamp: new Date().toISOString(),
      };
      await setDoc(
        doc(db, "users", uid),
        { albums: arrayUnion(entry) },
        { merge: true }
      );
      setLoggedAlbums((prev) => [...prev, entry]);
      closeModal();
    } catch (err) {
      console.error("saveAlbum error:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading phase ──────────────────────────────────────────────────────────

  if (!ready || loadingAlbums) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-xs text-center">
            <p
              className="text-p-green mb-2 text-4xl font-bold tracking-widest"
              style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}
            >
              MUSIC
            </p>
            <p className="text-sh-grey text-sm">Loading your collection…</p>
          </div>
        </main>
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <LayoutNavbar />

      <main className="bg-h-blue min-h-screen px-4 pb-20 pt-10">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div
            className="mb-8 text-center"
            style={{ animation: "recsCardIn 0.4s ease both" }}
          >
            <h1
              className="text-p-green text-5xl font-bold tracking-widest md:text-6xl"
              style={{ textShadow: "0 0 50px rgba(0,224,84,0.25)" }}
            >
              MUSIC
            </h1>
            <p className="text-sh-grey mt-2 text-sm">
              Log albums you&apos;ve listened to and track your musical journey
            </p>
          </div>

          {/* Search panel */}
          <div
            className="border-b-grey bg-drop-black mb-8 rounded-xl border p-5"
            style={{ animation: "recsCardIn 0.4s ease 0.05s both" }}
          >
            <p className="text-sh-grey mb-3 text-xs font-bold tracking-widest">
              SEARCH ALBUMS
            </p>
            <MediaSearchInput
              type="album"
              placeholder="Search by album or artist…"
              onSelect={handleSearchSelect}
              alreadyLoggedIds={loggedAlbums.map((a) => a.mbid)}
            />
          </div>

          {/* Logged albums */}
          <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sh-grey text-xs font-bold tracking-widest">
                YOUR COLLECTION
                {loggedAlbums.length > 0 && (
                  <span className="text-p-green ml-2">{loggedAlbums.length}</span>
                )}
              </p>
            </div>

            {loggedAlbums.length === 0 ? (
              <div className="border-b-grey bg-drop-black rounded-xl border p-10 text-center">
                <p className="text-sh-grey text-sm">
                  No albums logged yet. Search above to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {loggedAlbums.map((album, i) => (
                  <div
                    key={`${album.mbid}-${i}`}
                    className="group cursor-default"
                    style={{
                      animation: "recsCardIn 0.45s ease both",
                      animationDelay: `${i * 35}ms`,
                    }}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-c-grey">
                      <AlbumCover mbid={album.mbid} title={album.title} />

                      {/* Hover overlay — review */}
                      <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <p className="text-sh-grey mb-1 text-[10px] font-bold tracking-widest">
                          YOUR REVIEW
                        </p>
                        <p className="text-p-white text-xs leading-relaxed">
                          {album.review ?? "No review written."}
                        </p>
                        {album.rating && (
                          <p className="mt-1.5 text-xs text-yellow-400">
                            {"★".repeat(album.rating)}
                            {"☆".repeat(5 - album.rating)}
                          </p>
                        )}
                      </div>

                      {/* Rating badge */}
                      {album.rating && (
                        <div className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-sm">
                          ★ {album.rating}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 px-0.5">
                      <p className="text-p-white truncate text-xs font-bold leading-tight">
                        {album.title}
                      </p>
                      <p className="text-sh-grey truncate text-xs">{album.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Log modal */}
      {selectedAlbum && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.2s ease both" }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="border-b-grey bg-drop-black w-full max-w-md rounded-2xl border p-6"
            style={{ animation: "recsCardIn 0.25s ease both" }}
          >
            {/* Album info */}
            <div className="mb-5 flex gap-4">
              <div className="bg-c-grey relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                <AlbumCover mbid={selectedAlbum.id} title={selectedAlbum.title} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-p-white font-bold leading-tight">
                  {selectedAlbum.title}
                </p>
                <p className="text-sh-grey mt-0.5 text-sm">
                  {getArtistName(selectedAlbum)}
                </p>
                {getReleaseYear(selectedAlbum) && (
                  <p className="text-sh-grey mt-0.5 text-xs">
                    {getReleaseYear(selectedAlbum)}
                  </p>
                )}
              </div>
            </div>

            <p className="text-sh-grey mb-2 text-xs font-bold tracking-widest">
              YOUR RATING <span className="text-red-400">*</span>
            </p>
            <StarRating value={modalRating} onChange={setModalRating} />

            <p className="text-sh-grey mb-2 mt-4 text-xs font-bold tracking-widest">
              REVIEW <span className="opacity-40">(OPTIONAL)</span>
            </p>
            <textarea
              value={modalReview}
              onChange={(e) => setModalReview(e.target.value)}
              placeholder="What did you think?"
              rows={3}
              className="bg-c-grey border-b-grey text-p-white placeholder:text-sh-grey w-full resize-none rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={closeModal}
                className="border-b-grey text-sh-grey hover:text-p-white flex-1 rounded-xl border py-2.5 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveAlbum}
                disabled={saving || modalRating === 0}
                className="bg-p-green hover:bg-b-green text-h-blue flex-1 rounded-xl py-2.5 text-sm font-bold tracking-widest transition-colors disabled:opacity-40"
              >
                {saving ? "Saving…" : "LOG ALBUM"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
