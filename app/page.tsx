"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { auth, db } from "./firebase/firebase";
import { Home } from "./components/Home/Home";
import { HomeSignedOut } from "./components/Home/HomeSignedOut";
import { LayoutNavbar } from "./components/Navigation/LayoutNavbar";
import { Footer } from "./components/Navigation/Footer";

export default function Page() {
  const [user, setUser] = useState<any>();
  const [movies, setMovies] = useState<any>();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingOnboard, setCheckingOnboard] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const fetchPopularMovies = async () => {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
    );
    if (!res.ok) {
      console.error("error fetching popular movies");
      return;
    }
    const data = await res.json();
    setMovies(data.results);
  };

  useEffect(() => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsLoggedIn(true);
        setCheckingOnboard(true);
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            const watched: unknown[] = data.watched ?? [];
            const books: unknown[] = data.books ?? [];
            const albums: unknown[] = data.albums ?? [];
            if (
              watched.length === 0 &&
              books.length === 0 &&
              albums.length === 0
            ) {
              setShowOnboarding(true);
            }
          }
        } catch {}
        setCheckingOnboard(false);
      } else {
        setIsLoggedIn(false);
        setCheckingOnboard(false);
      }
    });
    fetchPopularMovies();
  }, []);

  return (
    <>
      <LayoutNavbar />

      {/* Checking onboard status */}
      {checkingOnboard && (
        <main className="bg-h-blue flex min-h-screen items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
            style={{ borderTopColor: "#00e054" }}
          />
        </main>
      )}

      {/* Onboarding welcome screen */}
      {!checkingOnboard && isLoggedIn && showOnboarding && (
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-3xl text-center">
            <h1
              className="text-p-green mb-3 text-4xl font-bold tracking-widest md:text-5xl"
              style={{ textShadow: "0 0 40px rgba(0,224,84,0.25)" }}
            >
              Welcome to Filmmaxxxing
            </h1>
            <p className="text-sh-grey mb-10 text-base">
              Track everything you watch, read, and listen to.
            </p>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {[
                {
                  icon: "🎬",
                  title: "Log your first film",
                  sub: "Search thousands of movies",
                  href: "/films",
                },
                {
                  icon: "📚",
                  title: "Log your first book",
                  sub: "Track your reading journey",
                  href: "/books",
                },
                {
                  icon: "🎵",
                  title: "Log your first album",
                  sub: "Build your music library",
                  href: "/music",
                },
              ].map((card) => (
                <div
                  key={card.href}
                  className="border-b-grey bg-drop-black flex flex-col items-center gap-4 rounded-2xl border p-8 transition-transform duration-200 hover:-translate-y-1"
                >
                  <span className="text-4xl">{card.icon}</span>
                  <div>
                    <p className="text-p-white mb-1 font-bold">{card.title}</p>
                    <p className="text-sh-grey text-sm">{card.sub}</p>
                  </div>
                  <Link
                    href={card.href}
                    className="bg-p-green hover:bg-b-green text-h-blue mt-auto rounded-xl px-6 py-2.5 text-sm font-bold tracking-wide transition-colors"
                  >
                    Get started →
                  </Link>
                </div>
              ))}
            </div>

            <p className="text-sh-grey mt-8 text-xs opacity-60">
              Already have content? Refresh the page.
            </p>
          </div>
        </main>
      )}

      {/* Normal home for logged-in users with content */}
      {!checkingOnboard && isLoggedIn && !showOnboarding && (
        <Home movies={movies} user={user} />
      )}

      {/* Logged-out home */}
      {!isLoggedIn && !checkingOnboard && (
        <HomeSignedOut movies={movies} />
      )}

      <Footer />
    </>
  );
}
