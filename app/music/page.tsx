"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, arrayUnion, arrayRemove, updateDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserAlbum } from "app/types";
import {
  MediaSearchInput,
  SearchResult,
  MBReleaseGroup,
} from "app/components/Search/MediaSearchInput";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const CAA_COVER = (mbid: string) =>
  `https://coverartarchive.org/release-group/${mbid}/front-250`;

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
        className={`text-2xl transition-transform hover:scale-110 ${n <= value ? "text-yellow-400" : "text-sh-grey"
          }`}
      >
        ★
      </button>
    ))}
  </div>
);

const StarDisplay = ({ rating }: { rating: number }) => (
  <span className="text-yellow-400 text-[10px]">
    {"★".repeat(rating)}
    <span className="opacity-30">{"★".repeat(5 - rating)}</span>
  </span>
);

const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-b-grey bg-drop-black rounded border px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-p-white mb-0.5 font-bold">{label}</p>}
      <p style={{ color: "#40bcf4" }} className="font-bold">{payload[0].value}</p>
    </div>
  );
};

function AlbumCover({ mbid, title, className = "" }: { mbid: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center"
        style={{ background: "linear-gradient(135deg, #1a2030, #0f1520)" }}>
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

const getArtistName = (album: MBReleaseGroup) =>
  album["artist-credit"]?.[0]?.artist?.name ?? "Unknown";

const getReleaseYear = (album: MBReleaseGroup) =>
  album["first-release-date"]?.slice(0, 4) ?? "";

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
  const [activeFilter, setActiveFilter] = useState<"all" | "loved" | "recent">("all");
  const [sortBy, setSortBy] = useState<"recent" | "rating" | "az">("recent");
  const [editingItem, setEditingItem] = useState<UserAlbum | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editReview, setEditReview] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push("/"); return; }
      setReady(true);
      setUid(user.uid);
      loadLoggedAlbums(user.uid);
    });
    return () => unsub();
  }, []);

  const loadLoggedAlbums = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) setLoggedAlbums(snap.data().albums ?? []);
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
      const artistMbid = selectedAlbum["artist-credit"]?.[0]?.artist?.id || undefined;

      const entry: UserAlbum = {
        mbid: selectedAlbum.id,
        title: selectedAlbum.title,
        artist: getArtistName(selectedAlbum),
        rating: modalRating,
        timestamp: new Date().toISOString(),
        ...(CAA_COVER(selectedAlbum.id) && { cover_url: CAA_COVER(selectedAlbum.id) }),
        ...(modalReview.trim() && { review: modalReview.trim() }),
        ...(artistMbid && { artistMbid }),
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

  const deleteAlbum = async (album: UserAlbum) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "users", uid), {
        albums: arrayRemove(album)
      });
      setLoggedAlbums((prev) => prev.filter((a) => a.mbid !== album.mbid));
    } catch (err) {
      console.error("deleteAlbum error:", err);
    }
  };

  const updateAlbum = async () => {
    if (!editingItem || !uid || editRating === 0) return;
    setEditSaving(true);
    try {
      const oldEntry = editingItem;
      const newEntry: UserAlbum = {
        ...oldEntry,
        rating: editRating,
        ...(editReview.trim() ? { review: editReview.trim() } : {}),
      };
      // Remove old, add new (Firestore has no arrayUpdate)
      await updateDoc(doc(db, "users", uid), {
        albums: arrayRemove(oldEntry)
      });
      await updateDoc(doc(db, "users", uid), {
        albums: arrayUnion(newEntry)
      });
      setLoggedAlbums((prev) =>
        prev.map((a) => a.mbid === oldEntry.mbid ? newEntry : a)
      );
      setEditingItem(null);
    } catch (err) {
      console.error("updateAlbum error:", err);
    } finally {
      setEditSaving(false);
    }
  };

  const filteredAlbums = loggedAlbums.filter((a) => {
    if (activeFilter === "loved") return (a.rating ?? 0) >= 4;
    if (activeFilter === "recent") {
      const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      return Date.now() - ts < 1000 * 60 * 60 * 24 * 30;
    }
    return true;
  });

  const sortedAlbums = [...filteredAlbums].sort((a, b) => {
    if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
    if (sortBy === "az") return a.title.localeCompare(b.title);
    // recent: by timestamp desc
    return new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime();
  });

  const avgRating =
    loggedAlbums.filter((a) => a.rating).length > 0
      ? (loggedAlbums.reduce((acc, a) => acc + (a.rating ?? 0), 0) /
        loggedAlbums.filter((a) => a.rating).length).toFixed(1)
      : null;

  const topArtists = Object.entries(
    loggedAlbums.reduce((acc: Record<string, number>, a) => {
      acc[a.artist] = (acc[a.artist] || 0) + 1;
      return acc;
    }, {})
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  // Rating distribution chart data
  const ratingData = [1, 2, 3, 4, 5].map((n) => ({
    rating: "★".repeat(n),
    count: loggedAlbums.filter((a) => a.rating === n).length,
  }));

  if (!ready || loadingAlbums) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-xs text-center">
            <p className="text-p-green mb-2 text-4xl font-bold tracking-widest"
              style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}>
              MUSIC
            </p>
            <p className="text-sh-grey text-sm">Loading your collection…</p>
          </div>
        </main>
      </>
    );
  }

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
        @keyframes heroGradient {
          0%, 100% { opacity: 0.06; }
          50%       { opacity: 0.14; }
        }
        @keyframes vinylSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .album-card:hover .vinyl-icon { animation: vinylSpin 3s linear infinite; }
      `}</style>

      <LayoutNavbar />

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ height: "220px", background: "#0a0e14" }}>
        {/* Blurred album art backdrop */}
        {loggedAlbums.slice(0, 5).map((a, i) => (
          <div
            key={a.mbid}
            className="absolute"
            style={{
              width: "200px", height: "200px",
              left: `${8 + i * 18}%`,
              top: "-20px",
              transform: `rotate(${(i - 2) * 6}deg) scale(1.4)`,
              filter: "blur(55px)",
              opacity: 0.25,
              background: `hsl(${i * 60}, 50%, 30%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CAA_COVER(a.mbid)} alt="" className="w-full h-full object-cover" onError={() => { }} />
          </div>
        ))}

        {loggedAlbums.length === 0 && (
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, rgba(64,188,244,0.08) 0%, rgba(0,224,84,0.06) 50%, rgba(168,85,247,0.06) 100%)",
              animation: "heroGradient 4s ease-in-out infinite",
            }}
          />
        )}

        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,14,20,0.3) 0%, rgba(10,14,20,0.85) 100%)" }} />

        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl vinyl-icon inline-block">🎵</span>
            <h1
              className="text-p-green text-5xl font-bold tracking-widest md:text-6xl"
              style={{ textShadow: "0 0 60px rgba(0,224,84,0.4)" }}
            >
              MUSIC
            </h1>
          </div>

          {loggedAlbums.length > 0 && (
            <div className="flex items-center gap-6 mt-2">
              <div className="text-center">
                <p className="text-p-green text-xl font-bold">{loggedAlbums.length}</p>
                <p className="text-sh-grey text-[10px] tracking-widest">ALBUMS</p>
              </div>
              {avgRating && (
                <div className="text-center">
                  <p className="text-yellow-400 text-xl font-bold">★ {avgRating}</p>
                  <p className="text-sh-grey text-[10px] tracking-widest">AVG RATING</p>
                </div>
              )}
              {topArtists[0] && (
                <div className="text-center">
                  <p className="text-p-white text-sm font-bold truncate max-w-[100px]">{topArtists[0][0]}</p>
                  <p className="text-sh-grey text-[10px] tracking-widest">TOP ARTIST</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <main className="bg-h-blue min-h-screen px-4 pb-20 pt-8">
        <div className="mx-auto max-w-5xl">

          {/* ── TOP ARTISTS STRIP (only if 3+ albums) ──────────────────── */}
          {topArtists.length >= 2 && (
            <div
              className="mb-8 flex gap-3 overflow-x-auto pb-1"
              style={{ animation: "recsCardIn 0.4s ease both" }}
            >
              {topArtists.map(([artist, count], i) => (
                <div
                  key={artist}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{
                    background: i === 0 ? "rgba(0,224,84,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${i === 0 ? "rgba(0,224,84,0.25)" : "rgba(255,255,255,0.07)"}`,
                  }}
                >
                  <span className="text-sm">🎤</span>
                  <span className={`text-xs font-bold ${i === 0 ? "text-p-green" : "text-sh-grey"}`}>
                    {artist}
                  </span>
                  <span className="text-[10px] text-sh-grey opacity-60">{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── SEARCH ─────────────────────────────────────────────────── */}
          <div
            className="mb-8"
            style={{ animation: "recsCardIn 0.4s ease 0.05s both" }}
          >
            <div
              className="rounded-2xl p-[1px]"
              style={{ background: "linear-gradient(135deg, rgba(64,188,244,0.3), rgba(0,224,84,0.15), rgba(168,85,247,0.1))" }}
            >
              <div className="bg-drop-black rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sh-grey text-xs font-bold tracking-widest">
                    + LOG AN ALBUM
                  </p>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "rgba(64,188,244,0.1)", color: "#40bcf4", border: "1px solid rgba(64,188,244,0.2)" }}
                  >
                    MusicBrainz
                  </span>
                </div>
                <MediaSearchInput
                  type="album"
                  placeholder="Search by album or artist…"
                  onSelect={handleSearchSelect}
                  alreadyLoggedIds={loggedAlbums.map((a) => a.mbid)}
                />
              </div>
            </div>
          </div>

          {/* ── RATING DISTRIBUTION ────────────────────────────────────── */}
          {loggedAlbums.length >= 3 && (
            <div
              className="border-b-grey bg-drop-black mb-8 rounded-xl border p-5"
              style={{ animation: "recsCardIn 0.4s ease 0.08s both" }}
            >
              <p className="text-sh-grey mb-4 text-xs font-bold tracking-widest">
                RATING DISTRIBUTION
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={ratingData}
                  margin={{ top: 0, right: 0, left: -36, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#283038" vertical={false} />
                  <XAxis
                    dataKey="rating"
                    tick={{ fill: "#9ab", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    hide={true}
                    allowDecimals={false}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" fill="#40bcf4" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── COLLECTION ─────────────────────────────────────────────── */}
          <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sh-grey text-xs font-bold tracking-widest mr-2">YOUR COLLECTION</p>
                {(["all", "loved", "recent"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all"
                    style={{
                      background: activeFilter === f ? "rgba(64,188,244,0.12)" : "transparent",
                      color: activeFilter === f ? "#40bcf4" : "#6b7a8d",
                      border: `1px solid ${activeFilter === f ? "rgba(64,188,244,0.3)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    {f === "all" ? `ALL ${loggedAlbums.length}` : f === "loved" ? "★ LOVED" : "RECENT"}
                  </button>
                ))}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "recent" | "rating" | "az")}
                  className="rounded-lg px-3 py-1 text-[10px] font-bold tracking-wider appearance-none cursor-pointer"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "#6b7a8d",
                  }}
                >
                  <option value="recent">RECENT</option>
                  <option value="rating">TOP RATED</option>
                  <option value="az">A → Z</option>
                </select>
              </div>
            </div>

            {sortedAlbums.length === 0 ? (
              <div className="border-b-grey bg-drop-black rounded-2xl border p-16 text-center">
                <p className="text-4xl mb-3">🎵</p>
                <p className="text-sh-grey text-sm">
                  {activeFilter === "all"
                    ? "No albums logged yet. Search above to start your collection."
                    : `No ${activeFilter} albums yet.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {sortedAlbums.map((album, i) => (
                  <div
                    key={`${album.mbid}-${i}`}
                    className="group album-card cursor-default relative"
                    style={{ animation: "recsCardIn 0.45s ease both", animationDelay: `${i * 30}ms` }}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-c-grey">
                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAlbum(album); }}
                        className="absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold opacity-0 transition-all group-hover:opacity-100"
                        style={{ background: "rgba(220,38,38,0.85)", color: "white" }}
                      >
                        ✕
                      </button>

                      <AlbumCover mbid={album.mbid} title={album.title} />

                      {/* Hover overlay */}
                      <div
                        className="absolute inset-0 flex flex-col justify-end rounded-xl p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)" }}
                      >
                        {album.rating && (
                          <div className="mb-1.5">
                            <StarDisplay rating={album.rating} />
                          </div>
                        )}
                        <p className="text-sh-grey mb-1 text-[9px] font-bold tracking-widest uppercase">
                          Your review
                        </p>
                        <p className="text-p-white text-[11px] leading-relaxed line-clamp-3">
                          {album.review ?? "No review written."}
                        </p>
                      </div>

                      {/* Rating badge — click to edit */}
                      {album.rating && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(album);
                            setEditRating(album.rating ?? 0);
                            setEditReview(album.review ?? "");
                          }}
                          className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-sm transition-transform hover:scale-110"
                          style={{ background: "rgba(0,0,0,0.75)" }}
                        >
                          ★ {album.rating}
                        </button>
                      )}
                    </div>

                    <div className="mt-2 px-0.5">
                      <p className="text-p-white truncate text-xs font-bold leading-tight">{album.title}</p>
                      {album.artistMbid ? (
                        <Link
                          href={`/artist/${album.artistMbid}`}
                          className="text-sh-grey hover:text-p-green truncate text-xs transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {album.artist}
                        </Link>
                      ) : (
                        <p className="text-sh-grey truncate text-xs">{album.artist}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── LOG MODAL ──────────────────────────────────────────────────── */}
      {selectedAlbum && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.2s ease both" }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="w-full max-w-md rounded-2xl p-[1px]"
            style={{
              animation: "recsCardIn 0.25s ease both",
              background: "linear-gradient(135deg, rgba(64,188,244,0.2), rgba(255,255,255,0.05))",
            }}
          >
            <div className="bg-drop-black rounded-2xl p-6">
              {/* Album info */}
              <div className="mb-6 flex gap-4">
                <div className="bg-c-grey relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow-2xl">
                  <AlbumCover mbid={selectedAlbum.id} title={selectedAlbum.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-p-white font-bold leading-tight text-base">{selectedAlbum.title}</p>
                  <p className="text-sh-grey mt-1 text-sm">{getArtistName(selectedAlbum)}</p>
                  {getReleaseYear(selectedAlbum) && (
                    <span
                      className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#6b7a8d" }}
                    >
                      {getReleaseYear(selectedAlbum)}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sh-grey mb-2 text-xs font-bold tracking-widest">
                YOUR RATING <span className="text-red-400">*</span>
              </p>
              <StarRating value={modalRating} onChange={setModalRating} />

              <p className="text-sh-grey mb-2 mt-5 text-xs font-bold tracking-widest">
                REVIEW <span className="opacity-40">(OPTIONAL)</span>
              </p>
              <textarea
                value={modalReview}
                onChange={(e) => setModalReview(e.target.value)}
                placeholder="What did you think?"
                rows={3}
                className="bg-c-grey border-b-grey text-p-white placeholder:text-sh-grey w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />

              <div className="mt-5 flex gap-3">
                <button
                  onClick={closeModal}
                  className="border-b-grey text-sh-grey hover:text-p-white flex-1 rounded-xl border py-3 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAlbum}
                  disabled={saving || modalRating === 0}
                  className="flex-1 rounded-xl py-3 text-sm font-bold tracking-widest transition-all disabled:opacity-40"
                  style={{
                    background: modalRating > 0 ? "linear-gradient(135deg, #40bcf4, #00e054)" : "#1a2030",
                    color: modalRating > 0 ? "#0a0e14" : "#6b7a8d",
                    boxShadow: modalRating > 0 ? "0 0 20px rgba(64,188,244,0.25)" : "none",
                  }}
                >
                  {saving ? "Saving…" : "LOG ALBUM"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ─────────────────────────────────────────────────── */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.2s ease both" }}
          onClick={(e) => e.target === e.currentTarget && setEditingItem(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-[1px]"
            style={{
              animation: "recsCardIn 0.25s ease both",
              background: "linear-gradient(135deg, rgba(64,188,244,0.2), rgba(255,255,255,0.05))",
            }}
          >
            <div className="bg-drop-black rounded-2xl p-6">
              {/* Album info */}
              <div className="mb-6 flex gap-4">
                <div className="bg-c-grey relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow-2xl">
                  <AlbumCover mbid={editingItem.mbid} title={editingItem.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sh-grey mb-1 text-[10px] font-bold tracking-widest">EDIT RATING</p>
                  <p className="text-p-white font-bold leading-tight text-base">{editingItem.title}</p>
                  <p className="text-sh-grey mt-1 text-sm">{editingItem.artist}</p>
                </div>
              </div>

              <p className="text-sh-grey mb-2 text-xs font-bold tracking-widest">
                YOUR RATING <span className="text-red-400">*</span>
              </p>
              <StarRating value={editRating} onChange={setEditRating} />

              <p className="text-sh-grey mb-2 mt-5 text-xs font-bold tracking-widest">
                REVIEW <span className="opacity-40">(OPTIONAL)</span>
              </p>
              <textarea
                value={editReview}
                onChange={(e) => setEditReview(e.target.value)}
                placeholder="What did you think?"
                rows={3}
                className="bg-c-grey border-b-grey text-p-white placeholder:text-sh-grey w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setEditingItem(null)}
                  className="border-b-grey text-sh-grey hover:text-p-white flex-1 rounded-xl border py-3 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={updateAlbum}
                  disabled={editSaving || editRating === 0}
                  className="flex-1 rounded-xl py-3 text-sm font-bold tracking-widest transition-all disabled:opacity-40"
                  style={{
                    background: editRating > 0 ? "linear-gradient(135deg, #40bcf4, #00e054)" : "#1a2030",
                    color: editRating > 0 ? "#0a0e14" : "#6b7a8d",
                    boxShadow: editRating > 0 ? "0 0 20px rgba(64,188,244,0.25)" : "none",
                  }}
                >
                  {editSaving ? "Saving…" : "SAVE CHANGES"}
                </button>
              </div>

              <div className="mt-3 text-center">
                <button
                  onClick={() => { deleteAlbum(editingItem); setEditingItem(null); }}
                  className="text-red-400 text-xs underline opacity-70 hover:opacity-100 transition-opacity"
                >
                  Remove entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
