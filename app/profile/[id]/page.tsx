"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { ProfileBio } from "app/components/Profile/ProfileBio";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { ProfileMoviesHighlight } from "app/components/Profile/ProfileMoviesHighlight";
import { ProfileReviews } from "app/components/Profile/ProfileReviews";
import {
  User,
  UserFavourite,
  UserReview,
  UserWatched,
  UserBook,
  UserAlbum,
} from "app/types";
import { Footer } from "app/components/Navigation/Footer";
import Link from "next/link";

type Tab = "films" | "books" | "music";

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

// ─── ALBUM COVER (404-safe) ───────────────────────────────────────────────────

function AlbumCover({ mbid, title }: { mbid: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!mbid || failed) {
    return (
      <div className="flex h-full items-center justify-center text-2xl">🎵</div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://coverartarchive.org/release-group/${mbid}/front-250`}
      alt={title}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      onError={() => setFailed(true)}
    />
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User>({} as User);
  const [isAuthor, setIsAuthor] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("films");

  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [favourites, setFavourites] = useState<UserFavourite[]>([]);
  const [watched, setWatched] = useState<UserWatched[]>([]);
  const [books, setBooks] = useState<UserBook[]>([]);
  const [albums, setAlbums] = useState<UserAlbum[]>([]);

  const router = useRouter();

  const initProfilePage = async () => {
    setLoading(true);
    const userSnap = await getDoc(doc(db, "users", id));
    if (userSnap.exists()) {
      const data = userSnap.data();
      setUser(data as User);
      setReviews((data.reviews ?? []).slice().reverse().slice(0, 6));
      setWatched(data.watched ?? []);
      setFavourites(data.favourites ?? []);
      setBooks(data.books ?? []);
      setAlbums(data.albums ?? []);
    }
    setLoading(false);
  };

  const refreshMovies = async () => {
    const userSnap = await getDoc(doc(db, "users", id));
    if (userSnap.exists()) {
      const data = userSnap.data() as User;
      setWatched(data.watched);
      setFavourites(data.favourites);
    }
  };

  useEffect(() => {
    initProfilePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    setIsAuthor(auth.currentUser?.uid === user.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.currentUser, user]);

  if (loading) return <p>Loading...</p>;
  if (!loading && !user) return <p>Error loading user.</p>;

  // Derived stats for books/music
  const topAuthors = countBy(books.map((b) => b.author)).slice(0, 3);
  const topArtists = countBy(albums.map((a) => a.artist)).slice(0, 3);

  const ratedBooks = books.filter((b) => b.rating);
  const avgBookRating =
    ratedBooks.length > 0
      ? (
          ratedBooks.reduce((acc, b) => acc + (b.rating ?? 0), 0) /
          ratedBooks.length
        ).toFixed(1)
      : null;

  const ratedAlbums = albums.filter((a) => a.rating);
  const avgAlbumRating =
    ratedAlbums.length > 0
      ? (
          ratedAlbums.reduce((acc, a) => acc + (a.rating ?? 0), 0) /
          ratedAlbums.length
        ).toFixed(1)
      : null;

  return (
    <>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <LayoutNavbar />

      <div className="site-body min-h-[78vh] py-5">
        <div className="flex flex-col px-4 font-['Graphik'] md:mx-auto md:my-0 md:w-[950px] md:py-8">
          <ProfileBio user={user} isAuthor={isAuthor} />

          {/* Tab switcher */}
          <div className="mb-6 mt-4 flex justify-center">
            <div className="border-b-grey bg-drop-black flex overflow-x-auto rounded-full border p-1">
              {(["films", "books", "music"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "whitespace-nowrap rounded-full px-5 py-2 text-xs font-bold tracking-widest transition-colors",
                    activeTab === tab
                      ? "text-p-green"
                      : "text-sh-grey hover:text-p-white",
                  ].join(" ")}
                  style={
                    activeTab === tab
                      ? {
                          background: "rgba(0,224,84,0.08)",
                          borderBottom: "2px solid #00e054",
                        }
                      : undefined
                  }
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ── FILMS TAB ─────────────────────────────────────────────────── */}
          {activeTab === "films" && (
            <div className="flex flex-col gap-4 md:flex-row md:justify-between">
              <div>
                <ProfileMoviesHighlight
                  user={user}
                  movies={favourites}
                  watched={watched}
                  favourites={favourites}
                  type="favourites"
                  onEvent={refreshMovies}
                />
                <ProfileMoviesHighlight
                  user={user}
                  movies={watched}
                  watched={watched}
                  favourites={favourites}
                  type="watched"
                  onEvent={refreshMovies}
                />
              </div>
              {user.reviews && <ProfileReviews reviews={reviews} />}
            </div>
          )}

          {/* ── BOOKS TAB ─────────────────────────────────────────────────── */}
          {activeTab === "books" && (
            <div>
              {books.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <p className="text-sh-grey text-sm">No books logged yet.</p>
                  <Link
                    href="/books"
                    className="text-p-green text-xs underline"
                  >
                    Log your first book →
                  </Link>
                </div>
              ) : (
                <>
                  {/* Stats row */}
                  <div className="border-b-grey bg-drop-black mb-6 flex flex-wrap items-center gap-5 rounded-xl border p-4">
                    <div className="text-center">
                      <p
                        className="text-xl font-bold"
                        style={{ color: "#40bcf4" }}
                      >
                        {books.length}
                      </p>
                      <p className="text-sh-grey text-[10px]">BOOKS READ</p>
                    </div>
                    {avgBookRating && (
                      <div className="text-center">
                        <p className="text-xl font-bold text-yellow-400">
                          ★ {avgBookRating}
                        </p>
                        <p className="text-sh-grey text-[10px]">AVG RATING</p>
                      </div>
                    )}
                    {topAuthors.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {topAuthors.map((a) => (
                          <span
                            key={a.name}
                            className="border-b-grey text-sh-grey rounded-full border px-2.5 py-0.5 text-xs"
                          >
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Books grid */}
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {books.map((book, i) => (
                      <div
                        key={book.bookKey}
                        className="group cursor-default"
                        style={{
                          animation: "cardIn 0.4s ease both",
                          animationDelay: `${i * 30}ms`,
                        }}
                      >
                        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#1a1d23]">
                          {book.cover_id ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://covers.openlibrary.org/b/id/${book.cover_id}-M.jpg`}
                              alt={book.title}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-2xl">
                              📖
                            </div>
                          )}
                          {book.rating !== undefined && book.rating > 0 && (
                            <div
                              className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                              style={{
                                background: "rgba(0,0,0,0.75)",
                                color: "#fbbf24",
                                backdropFilter: "blur(4px)",
                              }}
                            >
                              {"★".repeat(book.rating)}
                            </div>
                          )}
                          {book.review && (
                            <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <p className="text-p-white line-clamp-5 text-[10px] leading-relaxed">
                                {book.review}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="mt-1.5 px-0.5">
                          <p className="text-p-white truncate text-[11px] font-bold leading-tight">
                            {book.title}
                          </p>
                          <p className="text-sh-grey truncate text-[10px]">
                            {book.author}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── MUSIC TAB ─────────────────────────────────────────────────── */}
          {activeTab === "music" && (
            <div>
              {albums.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <p className="text-sh-grey text-sm">No albums logged yet.</p>
                  <Link
                    href="/music"
                    className="text-p-green text-xs underline"
                  >
                    Log your first album →
                  </Link>
                </div>
              ) : (
                <>
                  {/* Stats row */}
                  <div className="border-b-grey bg-drop-black mb-6 flex flex-wrap items-center gap-5 rounded-xl border p-4">
                    <div className="text-center">
                      <p
                        className="text-xl font-bold"
                        style={{ color: "#c084fc" }}
                      >
                        {albums.length}
                      </p>
                      <p className="text-sh-grey text-[10px]">ALBUMS LOGGED</p>
                    </div>
                    {avgAlbumRating && (
                      <div className="text-center">
                        <p className="text-xl font-bold text-yellow-400">
                          ★ {avgAlbumRating}
                        </p>
                        <p className="text-sh-grey text-[10px]">AVG RATING</p>
                      </div>
                    )}
                    {topArtists.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {topArtists.map((a) => (
                          <span
                            key={a.name}
                            className="border-b-grey text-sh-grey rounded-full border px-2.5 py-0.5 text-xs"
                          >
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Albums grid */}
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {albums.map((album, i) => (
                      <div
                        key={album.mbid}
                        className="group cursor-default"
                        style={{
                          animation: "cardIn 0.4s ease both",
                          animationDelay: `${i * 30}ms`,
                        }}
                      >
                        <div className="relative aspect-square overflow-hidden rounded-xl bg-[#1a1d23]">
                          <AlbumCover mbid={album.mbid} title={album.title} />
                          {album.rating !== undefined && album.rating > 0 && (
                            <div
                              className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                              style={{
                                background: "rgba(0,0,0,0.75)",
                                color: "#fbbf24",
                                backdropFilter: "blur(4px)",
                              }}
                            >
                              {"★".repeat(album.rating)}
                            </div>
                          )}
                          {album.review && (
                            <div className="absolute inset-0 flex flex-col justify-end rounded-xl bg-black/90 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <p className="text-p-white line-clamp-5 text-[10px] leading-relaxed">
                                {album.review}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="mt-1.5 px-0.5">
                          <p className="text-p-white truncate text-[11px] font-bold leading-tight">
                            {album.title}
                          </p>
                          <p className="text-sh-grey truncate text-[10px]">
                            {album.artist}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}
