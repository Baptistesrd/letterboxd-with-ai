"use client";
import React from "react";
import Link from "next/link";
import { GetStarted } from "./GetStarted";
import { PopularMovies } from "./PopularMovies";

export const HomeSignedOut = ({ movies }: { movies: any }) => {
  return (
    <div className="bg-h-blue">
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <GetStarted movies={movies} />

      {/* ── STATS BAR ─────────────────────────────────────────────────── */}
      <div
        className="border-b-grey bg-drop-black border-y py-8"
        style={{ animation: "recsCardIn 0.6s ease both" }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4">
          {[
            { value: "10,000+", label: "FILMS" },
            { value: "1M+",     label: "BOOKS" },
            { value: "500K+",   label: "ALBUMS" },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && (
                <div
                  className="border-b-grey mx-10 h-8 border-l"
                  aria-hidden="true"
                />
              )}
              <div className="text-center">
                <p className="text-p-white text-xl font-bold">{stat.value}</p>
                <p className="text-sh-grey mt-0.5 text-xs tracking-widest">{stat.label}</p>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── POPULAR THIS WEEK ─────────────────────────────────────────── */}
      <div
        className="mx-auto max-w-5xl px-4 py-12"
        style={{ animation: "recsCardIn 0.6s ease 0.1s both" }}
      >
        <PopularMovies movies={movies} />
      </div>

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <div
        className="mx-auto max-w-5xl px-4 pb-16"
        style={{ animation: "recsCardIn 0.6s ease 0.2s both" }}
      >
        <p className="text-sh-grey mb-6 text-xs font-bold tracking-widest">
          EVERYTHING IN ONE PLACE
        </p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            {
              icon: "🎬",
              title: "Track every film",
              body: "Rate, review, and discover films. Build your watchlist and see what your taste really looks like.",
            },
            {
              icon: "📚",
              title: "Log your reading",
              body: "From classics to new releases. Track authors, build your library, get AI recommendations.",
            },
            {
              icon: "🎵",
              title: "Your music diary",
              body: "Log albums, rate artists, and let AI find your next obsession based on what you actually love.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="bg-drop-black rounded-2xl border p-6 transition-all duration-300"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,224,84,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)";
              }}
            >
              <p className="mb-3 text-3xl">{card.icon}</p>
              <p className="text-p-white mb-2 text-base font-bold">{card.title}</p>
              <p className="text-sh-grey text-sm leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI / FOR YOU TEASER ───────────────────────────────────────── */}
      <div
        className="px-4 py-20 text-center"
        style={{
          background:
            "linear-gradient(to right, rgba(0,224,84,0.04) 0%, transparent 50%, rgba(0,224,84,0.04) 100%)",
          animation: "recsCardIn 0.6s ease 0.3s both",
        }}
      >
        <p className="text-p-green mb-4 text-xs font-bold tracking-widest">
          POWERED BY AI
        </p>
        <h2 className="text-p-white mx-auto mb-4 max-w-xl text-4xl font-bold">
          Recommendations that actually get you.
        </h2>
        <p className="text-sh-grey mx-auto mb-8 max-w-lg text-base">
          Claude analyzes your films, books, and music together to find
          connections you&apos;d never spot alone.
        </p>
        <Link
          href="/recommendations"
          className="text-p-green text-sm font-bold hover:underline"
        >
          See your FOR YOU page →
        </Link>
      </div>
    </div>
  );
};
