"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { NssLogo } from "./logo";
import { Tag } from "./ui";

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user, signOut } = useAuth();
  return (
    <header className="border-b-[3px] border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="bubble inline-flex min-h-12 items-center text-3xl text-sun" aria-label="Udaan home">
          UDAAN
        </Link>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link href="/admin" className="min-h-12 content-center">
              <Tag tone="blue">Admin</Tag>
            </Link>
          )}
          {user && (
            <button onClick={() => signOut()} className="min-h-12 px-1 text-sm font-semibold underline underline-offset-4">
              Sign out
            </button>
          )}
          <NssLogo />
        </div>
      </div>
    </header>
  );
}
