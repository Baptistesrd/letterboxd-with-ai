"use client";
import React from "react";
import Link from "next/link";

const TMDB_IMG = (path: string) => `https://image.tmdb.org/t/p/w342${path}`;

export const GetStarted = ({ movies }: { movies: any }) => {
  const posters = (movies ?? [])
    .filter((m: any) => !!m.poster_path)
    .slice(0, 9);

  const colOffsets = ["0px", "44px", "22px"];

  return (
    <section
      className="relative flex min-h-screen items-center overflow-hidden"
      style={{ background: "#0a0e14" }}
    >
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-18px); }
        }
        @keyframes heroFloatR {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(14px); }
        }
        .eyebrow-line {
          border-bottom: 1px solid rgba(0, 224, 84, 0.35);
          padding-bottom: 3px;
        }
      `}</style>

      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(0,224,84,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Floating particles */}
      {[
        { l: "7%",  t: "18%", a: "heroFloat 5s ease-in-out infinite" },
        { l: "14%", t: "68%", a: "heroFloat 7s ease-in-out infinite 0.6s" },
        { l: "21%", t: "42%", a: "heroFloatR 6s ease-in-out infinite 1.1s" },
        { l: "44%", t: "24%", a: "heroFloatR 4.5s ease-in-out infinite 0.3s" },
        { l: "52%", t: "76%", a: "heroFloat 8s ease-in-out infinite 0.9s" },
        { l: "60%", t: "52%", a: "heroFloatR 5.5s ease-in-out infinite 1.6s" },
      ].map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute h-1 w-1 rounded-full"
          style={{
            background: "#00e054",
            opacity: 0.2,
            left: p.l,
            top: p.t,
            animation: p.a,
          }}
        />
      ))}

      {/* ── LEFT CONTENT ─────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full py-24 pl-6 md:w-[55%] md:pl-16 lg:pl-24"
        style={{ animation: "recsCardIn 0.5s ease both" }}
      >
        {/* Eyebrow */}
        <span className="text-p-green eyebrow-line mb-7 inline-block text-xs font-bold tracking-[0.3em]">
          FILMS · BOOKS · MUSIC
        </span>

        {/* Headline */}
        <h1 className="text-p-white mt-6 text-6xl font-black leading-none md:text-8xl">
          Track what
          <br />
          <span className="text-p-green">moves</span> you.
        </h1>

        {/* Subline */}
        <p className="text-sh-grey mt-5 max-w-sm text-lg">
          One place for everything that shapes your taste.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            className="bg-p-green text-h-blue rounded-xl px-8 py-3.5 text-sm font-bold tracking-widest transition-all hover:opacity-90"
            style={{ boxShadow: "0 0 30px rgba(0,224,84,0.3)" }}
          >
            GET STARTED FREE
          </button>
          <Link
            href="/films"
            className="text-sh-grey hover:text-p-white rounded-xl border px-8 py-3.5 text-sm font-bold tracking-widest transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.2)" }}
          >
            BROWSE FILMS
          </Link>
        </div>

        <p className="text-sh-grey mt-4 text-xs opacity-50">
          Also available on iOS and Android
        </p>
      </div>

      {/* ── RIGHT — POSTER MOSAIC ────────────────────────────────────── */}
      {posters.length > 0 && (
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 hidden w-[45%] overflow-hidden md:block">
          {/* Rotated grid */}
          <div
            className="absolute inset-0 flex gap-2.5"
            style={{
              transform: "rotate(3deg) scale(1.05)",
              padding: "20px 30px 20px 20px",
            }}
          >
            {[0, 1, 2].map((col) => (
              <div
                key={col}
                className="flex flex-1 flex-col gap-2.5"
                style={{ marginTop: colOffsets[col] }}
              >
                {posters.slice(col * 3, col * 3 + 3).map((movie: any, idx: number) => (
                  <div
                    key={movie.id}
                    className="relative aspect-[2/3] overflow-hidden rounded-xl"
                    style={{
                      animation: "recsCardIn 0.5s ease both",
                      animationDelay: `${(col * 3 + idx) * 90 + 250}ms`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={TMDB_IMG(movie.poster_path)}
                      alt={movie.title ?? ""}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom gradient fade */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 z-10"
            style={{
              height: "50%",
              background: "linear-gradient(to top, #0a0e14 0%, transparent 100%)",
            }}
          />
          {/* Left edge fade */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-24"
            style={{
              background: "linear-gradient(to right, #0a0e14 0%, transparent 100%)",
            }}
          />
        </div>
      )}
    </section>
  );
};
