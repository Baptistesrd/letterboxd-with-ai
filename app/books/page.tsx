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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const OL_COVER = (cover_id: number, size: "S" | "M" | "L" = "M") =>
  `https://covers.openlibrary.org/b/id/${cover_id}-${size}.jpg`;

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

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

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

  // Auth guard + load logged books
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setReady(true);
      setUid(user.uid);
      loadLoggedBooks(user.uid);
    });
    return () => unsub();
  }, []);

  const loadLoggedBooks = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) {
        setLoggedBooks(snap.data().books ?? []);
      }
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
      const rawAuthorKey = selectedBook.author_key?.[0]; // e.g. "/authors/OL23919A"
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
      await setDoc(
        doc(db, "users", uid),
        { books: arrayUnion(entry) },
        { merge: true }
      );
      setLoggedBooks((prev) => [...prev, entry]);
      closeModal();
    } catch (err) {
      console.error("saveBook error:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading phase ──────────────────────────────────────────────────────────

  if (!ready || loadingBooks) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-xs text-center">
            <p
              className="text-p-green mb-2 text-4xl font-bold tracking-widest"
              style={{ textShadow: "0 0 30px rgba(0,224,84,0.3)" }}
            >
              BOOKS
            </p>
            <p className="text-sh-grey text-sm">Loading your library…</p>
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
              BOOKS
            </h1>
            <p className="text-sh-grey mt-2 text-sm">
              Log books you&apos;ve read and track your literary journey
            </p>
          </div>

          {/* Search panel */}
          <div
            className="border-b-grey bg-drop-black mb-8 rounded-xl border p-5"
            style={{ animation: "recsCardIn 0.4s ease 0.05s both" }}
          >
            <p className="text-sh-grey mb-3 text-xs font-bold tracking-widest">
              SEARCH BOOKS
            </p>
            <MediaSearchInput
              type="book"
              placeholder="Search by title, author, or ISBN…"
              onSelect={handleSearchSelect}
              alreadyLoggedIds={loggedBooks.map((b) => b.bookKey)}
            />
          </div>

          {/* Logged books */}
          <div style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sh-grey text-xs font-bold tracking-widest">
                YOUR LIBRARY
                {loggedBooks.length > 0 && (
                  <span className="text-p-green ml-2">{loggedBooks.length}</span>
                )}
              </p>
            </div>

            {loggedBooks.length === 0 ? (
              <div className="border-b-grey bg-drop-black rounded-xl border p-10 text-center">
                <p className="text-sh-grey text-sm">
                  No books logged yet. Search above to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {loggedBooks.map((book, i) => (
                  <div
                    key={`${book.bookKey}-${i}`}
                    className="group cursor-default"
                    style={{
                      animation: "recsCardIn 0.45s ease both",
                      animationDelay: `${i * 35}ms`,
                    }}
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
                        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                          <span className="text-sh-grey text-2xl">📖</span>
                          <p className="text-sh-grey text-xs leading-tight">
                            {book.title}
                          </p>
                        </div>
                      )}

                      {/* Hover overlay — review */}
                      <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <p className="text-sh-grey mb-1 text-[10px] font-bold tracking-widest">
                          YOUR REVIEW
                        </p>
                        <p className="text-p-white text-xs leading-relaxed">
                          {book.review ?? "No review written."}
                        </p>
                        {book.rating && (
                          <p className="mt-1.5 text-xs text-yellow-400">
                            {"★".repeat(book.rating)}
                            {"☆".repeat(5 - book.rating)}
                          </p>
                        )}
                      </div>

                      {/* Rating badge */}
                      {book.rating && (
                        <div className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-sm">
                          ★ {book.rating}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 px-0.5">
                      <p className="text-p-white truncate text-xs font-bold leading-tight">
                        {book.title}
                      </p>
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

      {/* Log modal */}
      {selectedBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.2s ease both" }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="border-b-grey bg-drop-black w-full max-w-md rounded-2xl border p-6"
            style={{ animation: "recsCardIn 0.25s ease both" }}
          >
            {/* Book info */}
            <div className="mb-5 flex gap-4">
              {selectedBook.cover_i ? (
                <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={OL_COVER(selectedBook.cover_i)}
                    alt={selectedBook.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="bg-c-grey flex h-24 w-16 flex-shrink-0 items-center justify-center rounded-lg text-2xl">
                  📖
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-p-white font-bold leading-tight">
                  {selectedBook.title}
                </p>
                <p className="text-sh-grey mt-0.5 text-sm">
                  {selectedBook.author_name?.[0] ?? "Unknown"}
                </p>
                {selectedBook.first_publish_year && (
                  <p className="text-sh-grey mt-0.5 text-xs">
                    {selectedBook.first_publish_year}
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
                onClick={saveBook}
                disabled={saving || modalRating === 0}
                className="bg-p-green hover:bg-b-green text-h-blue flex-1 rounded-xl py-2.5 text-sm font-bold tracking-widest transition-colors disabled:opacity-40"
              >
                {saving ? "Saving…" : "LOG BOOK"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
