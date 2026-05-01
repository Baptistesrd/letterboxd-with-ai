"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserBook } from "app/types";
import {
  MediaSearchInput,
  SearchResult,
  OLBook,
} from "app/components/Search/MediaSearchInput";

const OL_COVER = (cover_id: number, size: "S" | "M" | "L" = "M") =>
  `https://covers.openlibrary.org/b/id/${cover_id}-${size}.jpg`;

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

export default function BooksPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<OLBook | null>(null);
  const [modalRating, setModalRating] = useState(0);
  const [modalReview, setModalReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggedBooks, setLoggedBooks] = useState<UserBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | "loved" | "recent">("all");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push("/"); return; }
      setReady(true);
      setUid(user.uid);
      loadLoggedBooks(user.uid);
    });
    return () => unsub();
  }, []);

  const loadLoggedBooks = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) setLoggedBooks(snap.data().books ?? []);
    } catch (err) {
      console.error("loadLoggedBooks error:", err);
    } finally {
      setLoadingBooks(false);
    }
  };

  const openModal = (book: OLBook) => {
    setSelectedBook(book);
    setModalRating(0);
    setModalReview("");
  };

  const closeModal = () => setSelectedBook(null);

  const handleSearchSelect = (item: SearchResult) => {
    if (item.type === "book") openModal(item.raw);
  };

  const saveBook = async () => {
    if (!selectedBook || !uid || modalRating === 0) return;
    setSaving(true);
    try {
      const rawAuthorKey = selectedBook.author_key?.[0];
      const authorKey = rawAuthorKey?.replace("/authors/", "") || undefined;
      const entry: UserBook = {
        bookKey: selectedBook.key,
        title: selectedBook.title,
        author: selectedBook.author_name?.[0] ?? "Unknown",
        cover_id: selectedBook.cover_i,
        rating: modalRating,
        review: modalReview.trim() || undefined,
        timestamp: new Date().toISOString(),
        authorKey,
      };
      await setDoc(doc(db, "users", uid), { books: arrayUnion(entry) }, { merge: true });
      setLoggedBooks((prev) => [...prev, entry]);
      closeModal();
    } catch (err) {
      console.error("saveBook error:", err);
    } finally {
      setSaving(false);
    }
  };

  const filteredBooks = loggedBooks.filter((b) => {
    if (activeFilter === "loved") return (b.rating ?? 0) >= 4;
    if (activeFilter === "recent") {
      const ts = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return Date.now() - ts < 1000 * 60 * 60 * 24 * 30;
    }
    return true;
  });

  const avgRating =
    loggedBooks.filter((b) => b.rating).length > 0
      ? (loggedBooks.reduce((acc, b) => acc + (b.rating ?? 0), 0) /
        loggedBooks.filter((b) => b.rating).length).toFixed(1)
      : null;

  const heroCovers = loggedBooks.filter((b) => b.cover_id).slice(0, 5);

  if (!ready || loadingBooks) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-xs text-center">
            <p className="text-p-green mb-2 text-4xl font-bold tracking-widest"
              style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}>
              BOOKS
            </p>
            <p className="text-sh-grey text-sm">Loading your library…</p>
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
          50%       { opacity: 0.12; }
        }
        .book-card:hover .book-spine { opacity: 1; transform: translateX(0); }
        .book-spine { opacity: 0; transform: translateX(-4px); transition: all 0.3s ease; }
      `}</style>

      <LayoutNavbar />

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ height: "220px", background: "#0a0e14" }}>
        {/* Blurred cover backdrop */}
        {heroCovers.length > 0 ? (
          heroCovers.map((b, i) => (
            <div
              key={b.bookKey}
              className="absolute"
              style={{
                width: "200px", height: "300px",
                left: `${10 + i * 18}%`,
                top: "-30px",
                transform: `rotate(${(i - 2) * 5}deg) scale(1.3)`,
                filter: "blur(55px)",
                opacity: 0.22,
              }}
            >
              <Image src={OL_COVER(b.cover_id!, "L")} alt="" fill className="object-cover" unoptimized />
            </div>
          ))
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,224,84,0.08) 0%, rgba(64,188,244,0.06) 50%, rgba(0,224,84,0.04) 100%)",
              animation: "heroGradient 4s ease-in-out infinite",
            }}
          />
        )}

        {/* Dark gradient overlay */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,14,20,0.3) 0%, rgba(10,14,20,0.85) 100%)" }} />

        {/* Hero content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sh-grey text-2xl">📚</span>
            <h1
              className="text-p-green text-5xl font-bold tracking-widest md:text-6xl"
              style={{ textShadow: "0 0 60px rgba(0,224,84,0.4)" }}
            >
              BOOKS
            </h1>
          </div>

          {/* Stats row */}
          {loggedBooks.length > 0 && (
            <div className="flex items-center gap-6 mt-2">
              <div className="text-center">
                <p className="text-p-green text-xl font-bold">{loggedBooks.length}</p>
                <p className="text-sh-grey text-[10px] tracking-widest">READ</p>
              </div>
              {avgRating && (
                <div className="text-center">
                  <p className="text-yellow-400 text-xl font-bold">★ {avgRating}</p>
                  <p className="text-sh-grey text-[10px] tracking-widest">AVG RATING</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-p-green text-xl font-bold">
                  {loggedBooks.filter((b) => (b.rating ?? 0) >= 4).length}
                </p>
                <p className="text-sh-grey text-[10px] tracking-widest">LOVED</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="bg-h-blue min-h-screen px-4 pb-20 pt-8">
        <div className="mx-auto max-w-5xl">

          {/* ── SEARCH ─────────────────────────────────────────────────── */}
          <div
            className="mb-8"
            style={{ animation: "recsCardIn 0.4s ease both" }}
          >
            <div
              className="rounded-2xl p-[1px]"
              style={{ background: "linear-gradient(135deg, rgba(0,224,84,0.3), rgba(64,188,244,0.15), rgba(0,224,84,0.05))" }}
            >
              <div className="bg-drop-black rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sh-grey text-xs font-bold tracking-widest">
                    + LOG A BOOK
                  </p>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "rgba(0,224,84,0.1)", color: "#00e054", border: "1px solid rgba(0,224,84,0.2)" }}
                  >
                    Open Library
                  </span>
                </div>
                <MediaSearchInput
                  type="book"
                  placeholder="Search by title, author, or ISBN…"
                  onSelect={handleSearchSelect}
                  alreadyLoggedIds={loggedBooks.map((b) => b.bookKey)}
                />
              </div>
            </div>
          </div>

          {/* ── LIBRARY ────────────────────────────────────────────────── */}
          <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <p className="text-sh-grey text-xs font-bold tracking-widest mr-2">YOUR LIBRARY</p>
                {(["all", "loved", "recent"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all"
                    style={{
                      background: activeFilter === f ? "rgba(0,224,84,0.12)" : "transparent",
                      color: activeFilter === f ? "#00e054" : "#6b7a8d",
                      border: `1px solid ${activeFilter === f ? "rgba(0,224,84,0.3)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    {f === "all" ? `ALL ${loggedBooks.length}` : f === "loved" ? "★ LOVED" : "RECENT"}
                  </button>
                ))}
              </div>
            </div>

            {filteredBooks.length === 0 ? (
              <div className="border-b-grey bg-drop-black rounded-2xl border p-16 text-center">
                <p className="text-4xl mb-3">📖</p>
                <p className="text-sh-grey text-sm">
                  {activeFilter === "all"
                    ? "No books logged yet. Search above to start your library."
                    : `No ${activeFilter} books yet.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {filteredBooks.map((book, i) => (
                  <div
                    key={`${book.bookKey}-${i}`}
                    className="group book-card cursor-default"
                    style={{ animation: "recsCardIn 0.45s ease both", animationDelay: `${i * 30}ms` }}
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-c-grey">
                      {book.cover_id ? (
                        <Image
                          src={OL_COVER(book.cover_id)}
                          alt={book.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, 20vw"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center"
                          style={{ background: "linear-gradient(135deg, #1a2030, #0f1520)" }}
                        >
                          <span className="text-sh-grey text-2xl">📖</span>
                          <p className="text-sh-grey text-xs leading-tight">{book.title}</p>
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex flex-col justify-end rounded-xl p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.7) 60%, transparent 100%)" }}
                      >
                        {book.rating && (
                          <div className="mb-1.5">
                            <StarDisplay rating={book.rating} />
                          </div>
                        )}
                        <p className="text-sh-grey mb-1 text-[9px] font-bold tracking-widest uppercase">
                          Your review
                        </p>
                        <p className="text-p-white text-[11px] leading-relaxed line-clamp-3">
                          {book.review ?? "No review written."}
                        </p>
                      </div>

                      {/* Rating badge */}
                      {book.rating && (
                        <div className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-sm"
                          style={{ background: "rgba(0,0,0,0.75)" }}>
                          ★ {book.rating}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 px-0.5">
                      <p className="text-p-white truncate text-xs font-bold leading-tight">{book.title}</p>
                      {book.authorKey ? (
                        <Link
                          href={`/author/${book.authorKey}`}
                          className="text-sh-grey hover:text-p-green truncate text-xs transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {book.author}
                        </Link>
                      ) : (
                        <p className="text-sh-grey truncate text-xs">{book.author}</p>
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
      {selectedBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.2s ease both" }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="w-full max-w-md rounded-2xl p-[1px]"
            style={{
              animation: "recsCardIn 0.25s ease both",
              background: "linear-gradient(135deg, rgba(0,224,84,0.2), rgba(255,255,255,0.05))",
            }}
          >
            <div className="bg-drop-black rounded-2xl p-6">
              {/* Book info */}
              <div className="mb-6 flex gap-4">
                {selectedBook.cover_i ? (
                  <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow-2xl">
                    <Image src={OL_COVER(selectedBook.cover_i)} alt={selectedBook.title} fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-28 w-20 flex-shrink-0 items-center justify-center rounded-xl text-3xl"
                    style={{ background: "linear-gradient(135deg, #1a2030, #0f1520)" }}>
                    📖
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-p-white font-bold leading-tight text-base">{selectedBook.title}</p>
                  <p className="text-sh-grey mt-1 text-sm">{selectedBook.author_name?.[0] ?? "Unknown"}</p>
                  {selectedBook.first_publish_year && (
                    <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#6b7a8d" }}>
                      {selectedBook.first_publish_year}
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
                className="bg-c-grey border-b-grey text-p-white placeholder:text-sh-grey w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />

              <div className="mt-5 flex gap-3">
                <button
                  onClick={closeModal}
                  className="border-b-grey text-sh-grey hover:text-p-white flex-1 rounded-xl border py-3 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveBook}
                  disabled={saving || modalRating === 0}
                  className="bg-p-green hover:bg-b-green text-h-blue flex-1 rounded-xl py-3 text-sm font-bold tracking-widest transition-all disabled:opacity-40"
                  style={{ boxShadow: modalRating > 0 ? "0 0 20px rgba(0,224,84,0.25)" : "none" }}
                >
                  {saving ? "Saving…" : "LOG BOOK"}
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
