"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { Profile } from "@/lib/profile";
import type { WindowState } from "@/lib/window";
import { api } from "./api";

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

export function useRequireMe(needProfile: boolean) {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  const call = useCallback(
    async <T,>(path: string, opts: { method?: string; body?: unknown } = {}) =>
      api<T>(path, { ...opts, token: await getToken() }),
    [getToken],
  );
  const refresh = useCallback(async () => setMe(await call<Me>("/api/me")), [call]);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace("/");
    refresh().catch(() => {});
  }, [loading, user, refresh, router]);

  useEffect(() => {
    if (me && needProfile && !me.profile) router.replace("/register");
  }, [me, needProfile, router]);

  return { me: needProfile && me && !me.profile ? null : me, call, refresh, user };
}
