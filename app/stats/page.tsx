"use client";
import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "app/firebase/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";
import { UserReview } from "app/types";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  job?: string;
  order?: number;
}

interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  production_companies: { id: number; name: string; logo_path: string | null }[];
  original_language: string;
  poster_path: string | null;
  credits: {
    cast: TMDBPerson[];
    crew: TMDBPerson[];
  };
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#00e054",
  "#40bcf4",
  "#f59e0b",
  "#c084fc",
  "#f87171",
  "#34d399",
  "#fb923c",
  "#818cf8",
];
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const TMDB_POSTER = "https://image.tmdb.org/t/p/w200";
const CACHE_KEY = (uid: string) => `stats_v1_${uid}`;
const BATCH_SIZE = 20;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  pt: "Portuguese",
  ru: "Russian",
  hi: "Hindi",
  ar: "Arabic",
  sv: "Swedish",
  da: "Danish",
  nl: "Dutch",
  fi: "Finnish",
  pl: "Polish",
  tr: "Turkish",
  no: "Norwegian",
};

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

function getDecade(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function parseTimestamp(ts: string): Date | null {
  const parts = ts.split(".");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return new Date(y, m - 1, d);
}

// ─── STAR DISPLAY ─────────────────────────────────────────────────────────────

const StarDisplay = ({ rating }: { rating: number }) => (
  <span className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => {
      const fill = rating >= i ? "full" : rating >= i - 0.5 ? "half" : "empty";
      return (
        <span key={i} className="relative inline-block text-xs leading-none">
          {fill === "full" && <span className="text-yellow-400">★</span>}
          {fill === "half" && (
            <span className="relative inline-block">
              <span className="text-c-grey">★</span>
              <span
                className="absolute left-0 top-0 overflow-hidden text-yellow-400"
                style={{ width: "50%" }}
              >
                ★
              </span>
            </span>
          )}
          {fill === "empty" && <span className="text-c-grey">★</span>}
        </span>
      );
    })}
    <span className="text-sh-grey ml-1 text-xs">{rating}</span>
  </span>
);

// ─── SHARED CARD ─────────────────────────────────────────────────────────────

const StatCard = ({
  title,
  icon,
  delay = 0,
  children,
}: {
  title: string;
  icon: string;
  delay?: number;
  children: React.ReactNode;
}) => (
  <div
    className="border-b-grey bg-drop-black rounded-xl border p-5 md:p-7"
    style={{ animation: `statsCardIn 0.5s ease both`, animationDelay: `${delay}ms` }}
  >
    <h2 className="text-sh-grey mb-5 flex items-center gap-2 text-xs font-bold tracking-widest">
      <span className="text-base">{icon}</span>
      {title}
    </h2>
    {children}
  </div>
);

// ─── RECHARTS DARK TOOLTIP ────────────────────────────────────────────────────

const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-b-grey bg-drop-black rounded border px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-p-white mb-0.5 font-bold">{label}</p>}
      <p className="text-p-green font-bold">{payload[0].value}</p>
    </div>
  );
};

// ─── HORIZONTAL BAR ROW ───────────────────────────────────────────────────────

const BarRow = ({
  name,
  count,
  max,
  color,
  rank,
}: {
  name: string;
  count: number;
  max: number;
  color: string;
  rank?: number;
}) => (
  <div className="flex items-center gap-2">
    {rank !== undefined && (
      <span className="text-sh-grey w-4 shrink-0 text-center text-xs">{rank}</span>
    )}
    <div className="bg-c-grey h-5 flex-1 overflow-hidden rounded">
      <div
        className="flex h-full items-center rounded px-2 transition-all duration-700"
        style={{ width: `${Math.max(4, Math.round((count / max) * 100))}%`, background: color }}
      >
        <span className="text-drop-black truncate text-xs font-bold">{name}</span>
      </div>
    </div>
    <span className="text-p-white w-7 shrink-0 text-right text-xs font-bold">{count}</span>
  </div>
);

// ─── SECTION: FUN STATS ───────────────────────────────────────────────────────

const FunSection = ({
  movies,
  reviews,
}: {
  movies: TMDBMovie[];
  reviews: UserReview[];
}) => {
  const totalMinutes = movies.reduce((acc, m) => acc + (m.runtime ?? 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = (totalMinutes / 60 / 24).toFixed(1);

  const longest = [...movies]
    .filter((m) => m.runtime)
    .sort((a, b) => (b.runtime ?? 0) - (a.runtime ?? 0))[0];

  const oldest = [...movies]
    .filter((m) => m.release_date)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))[0];

  const recent = movies.filter(
    (m) => parseInt(m.release_date?.slice(0, 4) ?? "0") >= 2015
  ).length;
  const classic = movies.length - recent;
  const recentPct = movies.length ? Math.round((recent / movies.length) * 100) : 0;

  // Most active month from reviews
  const monthCounts: Record<string, number> = {};
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  reviews.forEach((r) => {
    if (!r.timestamp) return;
    const d = parseTimestamp(r.timestamp);
    if (!d) return;
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    monthCounts[key] = (monthCounts[key] || 0) + 1;
  });
  const topMonth = Object.entries(monthCounts).sort(([, a], [, b]) => b - a)[0];

  // Review streak
  const reviewDates = reviews
    .filter((r) => r.timestamp)
    .map((r) => parseTimestamp(r.timestamp!))
    .filter((d): d is Date => d !== null);
  const uniqueDays = [
    ...new Set(reviewDates.map((d) => d.toDateString())),
  ]
    .map((s) => new Date(s))
    .sort((a, b) => b.getTime() - a.getTime());

  let streak = 0;
  if (uniqueDays.length) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const first = new Date(uniqueDays[0]);
    first.setHours(0, 0, 0, 0);
    if (
      first.getTime() === today.getTime() ||
      first.getTime() === yesterday.getTime()
    ) {
      streak = 1;
      let prev = first;
      for (let i = 1; i < uniqueDays.length; i++) {
        const curr = new Date(uniqueDays[i]);
        curr.setHours(0, 0, 0, 0);
        if ((prev.getTime() - curr.getTime()) / 86400000 === 1) {
          streak++;
          prev = curr;
        } else break;
      }
    }
  }

  const miniCards = [
    {
      label: "Total Watch Time",
      value: `${totalHours.toLocaleString()}h`,
      sub: `${totalDays} days`,
      color: "text-p-green",
    },
    {
      label: "Films Watched",
      value: movies.length.toString(),
      sub: "in your list",
      color: "text-hov-blue",
    },
    longest && {
      label: "Longest Film",
      value: `${longest.runtime}min`,
      sub: longest.title,
      color: "text-p-white",
    },
    oldest && {
      label: "Oldest Film",
      value: oldest.release_date?.slice(0, 4) ?? "—",
      sub: oldest.title,
      color: "text-p-white",
    },
    topMonth && {
      label: "Most Active Month",
      value: topMonth[0],
      sub: `${topMonth[1]} review${topMonth[1] !== 1 ? "s" : ""}`,
      color: "text-yellow-400",
    },
    {
      label: "Review Streak",
      value: `${streak}`,
      sub: `consecutive day${streak !== 1 ? "s" : ""}`,
      color: streak > 2 ? "text-p-green" : "text-sh-grey",
    },
  ].filter(Boolean) as {
    label: string;
    value: string;
    sub: string;
    color: string;
  }[];

  return (
    <StatCard title="FUN STATS" icon="🏆" delay={0}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {miniCards.map((card, i) => (
          <div key={i} className="bg-c-grey rounded-lg p-4">
            <p className="text-sh-grey mb-1 text-xs">{card.label}</p>
            <p className={`truncate text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-sh-grey mt-0.5 truncate text-xs">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent vs Classic bar */}
      <div className="bg-c-grey mt-4 rounded-lg p-4">
        <p className="text-sh-grey mb-3 text-xs">Recent (2015+) vs Classic (&lt;2015)</p>
        <div className="bg-c-blue mb-2 h-3 overflow-hidden rounded-full">
          <div
            className="bg-p-green h-full rounded-full transition-all duration-700"
            style={{ width: `${recentPct}%` }}
          />
        </div>
        <div className="text-sh-grey flex justify-between text-xs">
          <span>
            <span className="text-p-green font-bold">{recent}</span> recent ({recentPct}%)
          </span>
          <span>
            <span className="text-hov-blue font-bold">{classic}</span> classic (
            {100 - recentPct}%)
          </span>
        </div>
      </div>
    </StatCard>
  );
};

// ─── SECTION: RATING STATS ────────────────────────────────────────────────────

const RatingSection = ({
  reviews,
  movieMap,
}: {
  reviews: UserReview[];
  movieMap: Record<string, TMDBMovie>;
}) => {
  const rated = reviews.filter((r) => r.rating !== undefined && r.rating > 0);
  if (!rated.length) return null;

  const avg = rated.reduce((acc, r) => acc + (r.rating ?? 0), 0) / rated.length;

  const ALL_RATINGS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  const distMap: Record<string, number> = Object.fromEntries(
    ALL_RATINGS.map((r) => [r.toString(), 0])
  );
  rated.forEach((r) => {
    const k = (r.rating ?? 0).toString();
    distMap[k] = (distMap[k] || 0) + 1;
  });
  const distData = ALL_RATINGS.map((r) => ({
    rating: r % 1 === 0 ? r.toString() : r.toString(),
    count: distMap[r.toString()],
  }));

  const top5 = [...rated]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);

  // Best rated directors (min 2 movies rated)
  const dirRatings: Record<string, number[]> = {};
  rated.forEach((rev) => {
    const movie = movieMap[rev.movieID];
    if (!movie) return;
    movie.credits.crew
      .filter((c) => c.job === "Director")
      .forEach((d) => {
        if (!dirRatings[d.name]) dirRatings[d.name] = [];
        dirRatings[d.name].push(rev.rating ?? 0);
      });
  });
  const topDirs = Object.entries(dirRatings)
    .filter(([, rs]) => rs.length >= 2)
    .map(([name, rs]) => ({
      name,
      avg: rs.reduce((a, b) => a + b, 0) / rs.length,
      count: rs.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  return (
    <StatCard title="RATING STATS" icon="⭐" delay={100}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Average + distribution */}
        <div>
          <p className="text-sh-grey mb-1 text-xs">Average Rating</p>
          <div className="flex items-baseline gap-2">
            <p className="text-p-green text-5xl font-bold">{avg.toFixed(2)}</p>
            <p className="text-sh-grey text-xs">
              / 5 &nbsp;·&nbsp; {rated.length} film{rated.length !== 1 ? "s" : ""} rated
            </p>
          </div>
          <div className="mt-4">
            <p className="text-sh-grey mb-2 text-xs">Distribution</p>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={distData} margin={{ top: 0, right: 0, left: -36, bottom: 0 }}>
                <XAxis
                  dataKey="rating"
                  tick={{ fill: "#9ab", fontSize: 8 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "#9ab", fontSize: 8 }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" fill="#00e054" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 rated */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Top Rated Films</p>
          <div className="flex flex-col gap-3">
            {top5.map((rev, i) => {
              const movie = movieMap[rev.movieID];
              return (
                <div key={i} className="flex items-center gap-3">
                  {movie?.poster_path ? (
                    <Link href={`/movie/${rev.movieID}`} className="shrink-0">
                      <Image
                        src={TMDB_POSTER + movie.poster_path}
                        alt={movie?.title ?? ""}
                        width={32}
                        height={48}
                        className="rounded"
                      />
                    </Link>
                  ) : (
                    <div className="bg-c-grey h-12 w-8 shrink-0 rounded" />
                  )}
                  <div className="min-w-0">
                    <p className="text-p-white truncate text-sm font-bold">
                      {movie?.title ?? `#${rev.movieID}`}
                    </p>
                    <p className="text-sh-grey text-xs">
                      {movie?.release_date?.slice(0, 4)}
                    </p>
                    <StarDisplay rating={rev.rating ?? 0} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Best rated directors */}
        {topDirs.length > 0 && (
          <div className="md:col-span-2">
            <p className="text-sh-grey mb-3 text-xs">Best Rated Directors (min. 2 films)</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {topDirs.map((d, i) => (
                <div
                  key={i}
                  className="bg-c-grey flex items-center justify-between rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-bold"
                      style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}
                    >
                      #{i + 1}
                    </span>
                    <div>
                      <p className="text-p-white text-sm font-bold">{d.name}</p>
                      <p className="text-sh-grey text-xs">{d.count} rated films</p>
                    </div>
                  </div>
                  <span className="text-p-green text-lg font-bold">{d.avg.toFixed(2)} ★</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StatCard>
  );
};

// ─── SECTION: CONTENT STATS ───────────────────────────────────────────────────

const ContentSection = ({ movies }: { movies: TMDBMovie[] }) => {
  if (!movies.length) return null;

  // Genres
  const genreNames = movies.flatMap((m) => m.genres.map((g) => g.name));
  const genreData = countBy(genreNames).slice(0, 8);
  const genreTotal = genreData.reduce((a, b) => a + b.count, 0);

  // Decades
  const DECADES_ORDER = ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"];
  const decadeCounts: Record<string, number> = {};
  movies.forEach((m) => {
    if (!m.release_date) return;
    const y = parseInt(m.release_date.slice(0, 4));
    if (isNaN(y)) return;
    const d = getDecade(y);
    decadeCounts[d] = (decadeCounts[d] || 0) + 1;
  });
  const decadeData = DECADES_ORDER.filter((d) => decadeCounts[d]).map((d) => ({
    decade: d,
    count: decadeCounts[d],
  }));

  // Countries
  const countryNames = movies.flatMap((m) =>
    m.production_countries.map((c) => c.name)
  );
  const countryData = countBy(countryNames).slice(0, 8);

  // Languages
  const langNames = movies.map(
    (m) => LANGUAGE_NAMES[m.original_language] || m.original_language.toUpperCase()
  );
  const langData = countBy(langNames).slice(0, 8);

  return (
    <StatCard title="CONTENT STATS" icon="🎭" delay={200}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Genre donut chart */}
        <div>
          <p className="text-sh-grey mb-2 text-xs">Favorite Genres</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={genreData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={85}
                innerRadius={52}
                paddingAngle={2}
              >
                {genreData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const pct = ((payload[0].value / genreTotal) * 100).toFixed(1);
                  return (
                    <div className="border-b-grey bg-drop-black rounded border px-3 py-2 text-xs shadow-lg">
                      <p className="text-p-white font-bold">{payload[0].name}</p>
                      <p className="text-p-green">
                        {payload[0].value} films ({pct}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                iconSize={8}
                iconType="circle"
                formatter={(v) => (
                  <span className="text-sh-grey text-xs">{v}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Decades bar chart */}
        <div>
          <p className="text-sh-grey mb-2 text-xs">Films by Decade</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={decadeData}
              margin={{ top: 0, right: 0, left: -36, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#283038" vertical={false} />
              <XAxis
                dataKey="decade"
                tick={{ fill: "#9ab", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#9ab", fontSize: 9 }}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="count" fill="#40bcf4" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Countries */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Top Countries</p>
          <div className="flex flex-col gap-1.5">
            {countryData.map((c, i) => (
              <BarRow
                key={i}
                name={c.name}
                count={c.count}
                max={countryData[0].count}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </div>

        {/* Languages */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Top Languages</p>
          <div className="flex flex-col gap-1.5">
            {langData.map((l, i) => (
              <BarRow
                key={i}
                name={l.name}
                count={l.count}
                max={langData[0].count}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </div>
      </div>
    </StatCard>
  );
};

// ─── SECTION: CREATOR STATS ───────────────────────────────────────────────────

const CreatorSection = ({ movies }: { movies: TMDBMovie[] }) => {
  if (!movies.length) return null;

  const WRITER_JOBS = new Set(["Screenplay", "Writer", "Story", "Original Story"]);

  // Directors
  const directorNames = movies.flatMap((m) =>
    m.credits.crew.filter((c) => c.job === "Director").map((c) => c.name)
  );
  const directors = countBy(directorNames).slice(0, 10);

  // Actors: top 10 cast per movie, deduplicated per movie first
  const actorMap: Record<string, { count: number; profile_path: string | null }> = {};
  movies.forEach((m) => {
    const seen = new Set<string>();
    m.credits.cast.slice(0, 10).forEach((a) => {
      if (seen.has(a.name)) return;
      seen.add(a.name);
      if (!actorMap[a.name]) actorMap[a.name] = { count: 0, profile_path: a.profile_path };
      actorMap[a.name].count++;
    });
  });
  const actors = Object.entries(actorMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([name, data]) => ({ name, ...data }));

  // Writers: deduplicate per movie
  const writerNames = movies.flatMap((m) => {
    const seen = new Set<string>();
    return m.credits.crew
      .filter((c) => WRITER_JOBS.has(c.job ?? ""))
      .filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      })
      .map((c) => c.name);
  });
  const writers = countBy(writerNames).slice(0, 10);

  // Production companies
  const companyNames = movies.flatMap((m) =>
    m.production_companies.map((c) => c.name)
  );
  const companies = countBy(companyNames).slice(0, 8);

  return (
    <StatCard title="CREATOR STATS" icon="🎥" delay={300}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Directors */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Most Watched Directors</p>
          <div className="flex flex-col gap-1.5">
            {directors.map((d, i) => (
              <BarRow
                key={i}
                name={d.name}
                count={d.count}
                max={directors[0].count}
                color={CHART_COLORS[i % CHART_COLORS.length]}
                rank={i + 1}
              />
            ))}
          </div>
        </div>

        {/* Actors with photos */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Most Watched Actors</p>
          <div className="flex flex-col gap-2">
            {actors.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sh-grey w-4 shrink-0 text-center text-xs">{i + 1}</span>
                {a.profile_path ? (
                  <Image
                    src={TMDB_IMG + a.profile_path}
                    alt={a.name}
                    width={28}
                    height={28}
                    className="shrink-0 rounded-full object-cover"
                    style={{ width: 28, height: 28 }}
                  />
                ) : (
                  <div className="bg-c-grey text-sh-grey flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {a.name[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="bg-c-grey h-5 overflow-hidden rounded">
                    <div
                      className="flex h-full items-center rounded px-2"
                      style={{
                        width: `${Math.max(10, Math.round((a.count / actors[0].count) * 100))}%`,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    >
                      <span className="text-drop-black truncate text-xs font-bold">
                        {a.name}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-p-white w-6 shrink-0 text-right text-xs font-bold">
                  {a.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Writers */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Most Watched Writers</p>
          {writers.length === 0 ? (
            <p className="text-sh-grey text-xs">No writer data available.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {writers.map((w, i) => (
                <BarRow
                  key={i}
                  name={w.name}
                  count={w.count}
                  max={writers[0].count}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                  rank={i + 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Production companies */}
        <div>
          <p className="text-sh-grey mb-3 text-xs">Top Production Companies</p>
          <div className="flex flex-col gap-1.5">
            {companies.map((c, i) => (
              <BarRow
                key={i}
                name={c.name}
                count={c.count}
                max={companies[0].count}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </div>
      </div>
    </StatCard>
  );
};

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────

const LoadingScreen = ({ fetched, total }: { fetched: number; total: number }) => (
  <>
    <LayoutNavbar />
    <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-p-green mb-2 text-4xl font-bold tracking-widest">STATS</p>
        <p className="text-sh-grey mb-6 text-sm">Analyzing your film diary…</p>
        {total > 0 ? (
          <>
            <div className="bg-c-grey mb-3 h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-p-green h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round((fetched / total) * 100)}%` }}
              />
            </div>
            <p className="text-sh-grey text-xs">
              {fetched} / {total} films fetched
            </p>
          </>
        ) : (
          <div className="bg-c-grey mb-3 h-2 w-full overflow-hidden rounded-full">
            <div className="bg-p-green h-full animate-pulse rounded-full" style={{ width: "30%" }} />
          </div>
        )}
      </div>
    </main>
  </>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ fetched: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setReady(true);
      loadStats(user.uid);
    });
    return () => unsub();
  }, []);

  const loadStats = async (uid: string) => {
    const cacheKey = CACHE_KEY(uid);
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setMovies(parsed.movies ?? []);
        setReviews(parsed.reviews ?? []);
        setLoading(false);
        return;
      }
    } catch {}

    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        setLoading(false);
        return;
      }
      const data = snap.data();
      const userReviews: UserReview[] = data.reviews ?? [];
      setReviews(userReviews);

      const watchedIds: string[] = (data.watched ?? []).map((w: any) => w.movieID);
      const reviewIds: string[] = userReviews.map((r) => r.movieID);
      const allIds = [...new Set([...watchedIds, ...reviewIds])];

      setProgress({ fetched: 0, total: allIds.length });

      const fetched: TMDBMovie[] = [];
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((id) =>
            fetch(
              `https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=credits`
            )
              .then((r) => r.json())
              .catch(() => null)
          )
        );
        results.forEach((m) => {
          if (m && m.id && !m.status_code) fetched.push(m as TMDBMovie);
        });
        setProgress((p) => ({
          fetched: Math.min(i + BATCH_SIZE, allIds.length),
          total: p.total,
        }));
      }

      setMovies(fetched);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ movies: fetched, reviews: userReviews }));
      } catch {}
    } catch (err) {
      console.error(err);
      setError("Failed to load stats. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready || loading) {
    return <LoadingScreen fetched={progress.fetched} total={progress.total} />;
  }

  if (error) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen items-center justify-center">
          <p className="text-sh-grey text-sm">{error}</p>
        </main>
      </>
    );
  }

  if (!movies.length && !reviews.length) {
    return (
      <>
        <LayoutNavbar />
        <main className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-p-green mb-2 text-4xl font-bold tracking-widest">STATS</p>
          <p className="text-sh-grey text-sm">
            Add films to your watched list to start building your stats.
          </p>
        </main>
        <Footer />
      </>
    );
  }

  const movieMap = Object.fromEntries(movies.map((m) => [m.id.toString(), m]));

  return (
    <>
      <style>{`
        @keyframes statsCardIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <LayoutNavbar />

      <main className="bg-h-blue min-h-screen px-4 pb-16 pt-10">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-10 text-center">
            <p className="text-sh-grey mb-1 text-xs font-bold tracking-[0.3em]">YOUR FILM DIARY</p>
            <h1
              className="text-p-green mb-2 text-5xl font-bold tracking-widest md:text-6xl"
              style={{ textShadow: "0 0 40px rgba(0,224,84,0.3)" }}
            >
              STATS
            </h1>
            <p className="text-sh-grey text-sm">
              {movies.length} film{movies.length !== 1 ? "s" : ""} analyzed
              {reviews.length > 0 && ` · ${reviews.length} review${reviews.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Sections */}
          <div className="flex flex-col gap-6">
            <FunSection movies={movies} reviews={reviews} />
            <RatingSection reviews={reviews} movieMap={movieMap} />
            <ContentSection movies={movies} />
            <CreatorSection movies={movies} />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
