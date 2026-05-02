"use client";
import React from "react";
import Link from "next/link";

interface IntroMessageProps {
  user: any;
  watchedCount: number;
  booksCount: number;
  albumsCount: number;
}

export const IntroMessage = ({
  user,
  watchedCount,
  booksCount,
  albumsCount,
}: IntroMessageProps) => {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const name: string = user?.displayName ?? user?.email ?? "there";
  const initials = name
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <div
      className="mb-8 flex items-center justify-between gap-4"
      style={{ animation: "recsCardIn 0.4s ease both" }}
    >
      {/* Left: greeting + name + stats */}
      <div>
        <p className="text-sh-grey mb-1 text-sm">{greeting},</p>
        <Link href={`/profile/${user?.uid ?? ""}`}>
          <h2 className="text-p-white text-4xl font-bold leading-tight transition-colors hover:text-p-green">
            {user?.displayName ?? "there"}
          </h2>
        </Link>
        <p className="text-sh-grey mt-2 text-sm">
          <span className="text-p-green font-bold">{watchedCount}</span> films ·{" "}
          <span className="text-p-green font-bold">{booksCount}</span> books ·{" "}
          <span className="text-p-green font-bold">{albumsCount}</span> albums
        </p>
      </div>

      {/* Right: avatar */}
      <div className="flex-shrink-0">
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt={user.displayName ?? "avatar"}
            className="h-16 w-16 rounded-full object-cover"
            style={{ boxShadow: "0 0 0 2px rgba(0,224,84,0.35)" }}
          />
        ) : (
          <div
            className="text-h-blue flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold"
            style={{
              background: "linear-gradient(135deg, #00e054, #40bcf4)",
              boxShadow: "0 0 20px rgba(0,224,84,0.2)",
            }}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  );
};
