"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { Profile } from "@/lib/profile";
import type { WindowState } from "@/lib/window";
import { api, ApiError } from "./api";

export interface Me {
  email: string;
  name: string;
  isAdmin: boolean;
  profile: Profile | null;
  window: { state: WindowState; openAt: number; closeAt: number };
  serverNow: number;
  attempt: { status: "in_progress" | "submitted"; score: number | null } | null;
  poster: { uploadedAt: number; fileType: string } | null;
}

/**
 * Loads `/api/me` for a protected page. `me` is null while loading; if loading fails, `error`
 * is set instead (consumers should show it rather than spin forever). A 401 signs the user out
 * and sends them to `/` (signing out first avoids a loop, since `/` redirects signed-in users).
 */
export function useRequireMe(needProfile: boolean) {
  const { user, loading, getToken, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const uid = user?.uid ?? null;
  const uidRef = useRef(uid);

  // Never show one account's data to another: drop `me` whenever the signed-in user changes.
  useEffect(() => {
    uidRef.current = uid;
    setMe(null);
    setError(null);
  }, [uid]);

  const call = useCallback(
    async <T,>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}) =>
      api<T>(path, { ...opts, token: await getToken() }),
    [getToken],
  );

  const refresh = useCallback(async () => {
    const forUid = uidRef.current;
    try {
      const next = await call<Me>("/api/me");
      if (uidRef.current !== forUid) return; // user changed mid-flight; discard
      setMe(next);
      setError(null);
    } catch (e) {
      if (uidRef.current !== forUid) return;
      setError(e instanceof Error ? e : new Error("Request failed"));
      if (e instanceof ApiError && e.status === 401) {
        await signOut().catch(() => {});
        router.replace("/");
      }
      throw e;
    }
  }, [call, signOut, router]);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace("/");
    refresh().catch(() => {}); // recorded in `error`
  }, [loading, user, refresh, router]);

  useEffect(() => {
    if (me && needProfile && !me.profile) router.replace("/register");
  }, [me, needProfile, router]);

  const visible = user && me && !(needProfile && !me.profile) ? me : null;
  return { me: visible, error, call, refresh, user };
}
