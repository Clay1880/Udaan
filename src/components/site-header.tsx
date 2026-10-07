"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { Tag } from "./ui";

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user, signOut } = useAuth();
  return (
    <header className="border-b-[3px] border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="inline-flex min-h-12 flex-col items-center justify-center leading-none" aria-label="Udaan home">
          <span className="bubble text-2xl text-sun min-[400px]:text-3xl">UDAAN</span>
          <span className="mt-1 rounded-full border-2 border-ink bg-bubble px-2 py-0.5 font-display text-[0.65rem] uppercase tracking-widest text-signal shadow-[2px_2px_0_var(--color-ink)]">by NSS</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {isAdmin && (
            <Link href="/admin" className="min-h-12 content-center">
              <Tag tone="blue">Admin</Tag>
            </Link>
          )}
          {user && (
            <button onClick={() => signOut()} className="min-h-12 whitespace-nowrap">
              <Tag tone="white">Sign out</Tag>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
