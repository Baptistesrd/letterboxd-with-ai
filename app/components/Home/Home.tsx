"use client";
import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "app/firebase/firebase";
import Link from "next/link";
import { IntroMessage } from "./IntroMessage";
import { PopularMovies } from "./PopularMovies";

export const Home = ({ movies, user }: { movies: any; user: any }) => {
  const [watchedCount, setWatchedCount] = useState(0);
  const [booksCount, setBooksCount] = useState(0);
  const [albumsCount, setAlbumsCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setWatchedCount((data.watched ?? []).length);
          setBooksCount((data.books ?? []).length);
          setAlbumsCount((data.albums ?? []).length);
        }
      })
      .catch(() => {});
  }, [user?.uid]);

  const quickActions = [
    { icon: "🎬", label: "Continue watching", href: "/films",  count: watchedCount },
    { icon: "📚", label: "Reading list",       href: "/books",  count: booksCount   },
    { icon: "🎵", label: "Music diary",        href: "/music",  count: albumsCount  },
  ];

  return (
    <div className="bg-h-blue min-h-screen">
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">

        {/* ── PERSONALIZED HEADER ─────────────────────────────────────── */}
        <IntroMessage
          user={user}
          watchedCount={watchedCount}
          booksCount={booksCount}
          albumsCount={albumsCount}
        />

        {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
        <div
          className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3"
          style={{ animation: "recsCardIn 0.4s ease 0.1s both" }}
        >
          {quickActions.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="bg-drop-black group flex items-center justify-between rounded-xl border px-5 py-4 transition-all duration-200 hover:-translate-y-0.5"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor =
                  "rgba(0,224,84,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor =
                  "rgba(255,255,255,0.08)";
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{card.icon}</span>
                <div>
                  <p className="text-p-white text-sm font-bold">{card.label}</p>
                  <p className="text-sh-grey text-xs">
                    <span className="text-p-green font-bold">{card.count}</span> logged
                  </p>
                </div>
              </div>
              <span className="text-sh-grey transition-colors group-hover:text-p-green">
                →
              </span>
            </Link>
          ))}
        </div>

        {/* ── POPULAR FILMS ───────────────────────────────────────────── */}
        <div style={{ animation: "recsCardIn 0.4s ease 0.2s both" }}>
          <PopularMovies movies={movies} />
        </div>

      </main>
    </div>
  );
};
