import Link from "next/link";
import { LayoutNavbar } from "app/components/Navigation/LayoutNavbar";
import { Footer } from "app/components/Navigation/Footer";

export default function NotFound() {
  return (
    <>
      <style>{`
        @keyframes recsCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <LayoutNavbar />

      <main
        className="bg-h-blue flex min-h-screen flex-col items-center justify-center px-4"
      >
        <div
          className="flex flex-col items-center text-center"
          style={{ animation: "recsCardIn 0.4s ease both" }}
        >
          <p
            className="text-p-green text-8xl font-bold tracking-widest"
            style={{ textShadow: "0 0 60px rgba(0,224,84,0.3)" }}
          >
            404
          </p>

          <p className="text-sh-grey mt-4 text-lg font-semibold">
            This page doesn&apos;t exist.
          </p>

          <p className="text-sh-grey mt-2 text-sm opacity-60">
            The film, book, or album you&apos;re looking for has gone missing.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/"
              className="bg-p-green text-h-blue rounded-xl px-6 py-3 text-sm font-bold tracking-widest transition-opacity hover:opacity-90"
            >
              ← Go Home
            </Link>
            <Link
              href="/films"
              className="border-b-grey text-sh-grey rounded-xl border px-6 py-3 text-sm font-bold tracking-widest transition-colors hover:text-p-white"
            >
              Browse Films →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
