"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Badge, Cloud, Contrail, Jet, Sparkle, Starburst } from "@/components/art";
import { NssLogo } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import { Button, Card, Label, Tag } from "@/components/ui";

const CARDS = [
  { no: "01", title: "Air Force Quiz", tone: "white" as const, tilt: -1.5, numTone: "text-bubble", lines: ["20 questions", "15 minutes", "One attempt only"] },
  { no: "02", title: "Poster Making", tone: "white" as const, tilt: 1.5, numTone: "text-sun", lines: ["PDF, JPG or PNG", "Up to 10 MB", "Replace until 9 Oct"] },
];

export default function Landing() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-14 sm:px-6 sm:pt-28">
        <section className="grid-panel fade-up relative px-5 pb-6 sm:px-10 sm:pb-10">
          {/* Decoration clipped to the panel so nothing causes sideways scroll. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="dot -left-5 top-[42%] h-14 w-14 sm:top-[60%] sm:h-20 sm:w-20 lg:hidden" />
            <span className="dot right-6 top-[30%] h-7 w-7 sm:right-10 sm:h-10 sm:w-10" />
            <span className="dot -bottom-6 left-[8%] h-12 w-12 sm:left-[30%]" />
            <Cloud className="absolute -right-5 top-[57%] w-20 sm:top-[18%] sm:w-32" />
            <Cloud className="absolute -left-6 bottom-[30%] w-16 sm:bottom-[22%] sm:w-24 lg:bottom-[14%] lg:left-[44%] lg:w-32" fill="#f27fb5" />
            <Sparkle className="absolute bottom-[30%] left-[36%] hidden h-9 w-9 lg:block" fill="#fff" />
          </div>

          <div className="relative">
            {/* The title straddles the panel's top edge, like the poster. */}
            <div className="relative -mt-[0.62em] inline-block text-[clamp(3.5rem,16.5vw,8.5rem)]">
              <h1 className="bubble text-sun">UDAAN</h1>
              <Sparkle className="absolute -left-[0.18em] -top-[0.22em] h-[0.4em] w-[0.4em]" />
              <Sparkle className="absolute -right-[0.3em] top-[0.05em] h-[0.3em] w-[0.3em]" />
            </div>

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-6">
              <div>
                <p className="mt-6 flex items-end sm:mt-8" aria-label="8 to 9 October">
                  <span className="bubble bubble-deep text-[clamp(5rem,23vw,10rem)] text-signal">8-9</span>
                  <span className="bubble -ml-[0.05em] mb-[0.12em] text-[clamp(1.75rem,8vw,3.5rem)] text-signal">Oct</span>
                </p>

                <div className="mt-3 flex items-center justify-between gap-3 sm:mt-5">
                  <p className="ink-edge max-w-[11rem] text-xl font-semibold leading-snug sm:max-w-none sm:text-2xl">
                    Join the fun, don&apos;t miss it.
                  </p>
                  <div className="-mr-3 shrink-0 rotate-12 sm:mr-0 lg:hidden">
                    <Starburst className="h-28 w-28 sm:h-36 sm:w-36" fill="#f27fb5">
                      <span className="bubble block text-xl text-sun sm:text-3xl">QUIZ!</span>
                    </Starburst>
                  </div>
                </div>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:mt-9">
                  <Button
                    className="w-full sm:w-auto"
                    disabled={loading}
                    onClick={() => {
                      setError("");
                      signIn().catch(() => setError("Sign-in failed. Please try again."));
                    }}
                  >
                    Sign in with Google
                    <span aria-hidden>→</span>
                  </Button>
                  <Tag tone="white" className="self-start sm:self-auto">All years · All branches</Tag>
                </div>
                {error && (
                  <p role="alert" className="sticker mt-4 bg-white px-4 py-2 font-semibold text-signal">
                    {error}
                  </p>
                )}
              </div>

              {/* Laptop: the jet climbs out of a dotted flight path, QUIZ! burst above it. */}
              <div className="pointer-events-none relative hidden h-[22rem] lg:block" aria-hidden>
                <Contrail className="absolute left-[-9rem] top-[11.5rem] w-[22rem]" />
                <Jet className="absolute right-6 top-14 w-36 rotate-[28deg]" />
                <div className="absolute left-[-1rem] top-2 -rotate-12">
                  <Starburst className="h-40 w-40" fill="#f27fb5">
                    <span className="bubble block text-3xl text-sun">QUIZ!</span>
                  </Starburst>
                </div>
              </div>
            </div>

            {/* Poster's bottom band: NSS block, a climbing jet in place of the hand, 2026 block. */}
            <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-end gap-2 lg:mt-4 lg:grid-cols-2">
              <div className="pb-2">
                <div className="inline-block -rotate-6">
                  <NssLogo className="px-4 py-1.5 text-3xl sm:text-5xl" />
                </div>
              </div>

              <div className="relative flex flex-col items-center lg:hidden" aria-hidden>
                <Jet className="w-24 sm:w-32" />
                <span className="-mt-1 h-16 border-l-[5px] border-dotted border-white sm:h-24" />
              </div>

              <div className="relative justify-self-end">
                <Card tone="green" tilt={5} className="px-3 py-2 sm:px-5 sm:py-3">
                  <span className="bubble block text-center text-3xl leading-[0.95] text-bubble sm:text-5xl">
                    20
                    <br />
                    26
                  </span>
                </Card>
                <Sparkle className="absolute -right-3 -top-4 h-8 w-8" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Badge className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" />
              <p className="ink-edge text-right text-sm font-bold uppercase leading-tight tracking-wide sm:text-lg">
                On the occasion of
                <br />
                Air Force Day
              </p>
            </div>
          </div>
        </section>

        <section className="fade-up mt-12 grid gap-7 sm:grid-cols-2 sm:gap-8" style={{ animationDelay: "0.15s" }}>
          {CARDS.map((c) => (
            <Card key={c.no} tone={c.tone} tilt={c.tilt} className="relative p-6 sm:p-7">
              <span className={`bubble absolute -top-6 right-5 text-5xl ${c.numTone}`} aria-hidden>
                {c.no}
              </span>
              <Label>Competition {c.no}</Label>
              <h2 className="mt-2 font-display text-2xl leading-tight sm:text-3xl">{c.title}</h2>
              <ul className="mt-4 space-y-2 text-lg font-medium">
                {c.lines.map((l) => (
                  <li key={l} className="flex items-center gap-2.5">
                    <Sparkle className="h-5 w-5 shrink-0" />
                    {l}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      </main>
    </>
  );
}
