import { describe, expect, it } from "vitest";
import { SaveQueue, type ErrorKind } from "@/components/quiz/save-queue";

/** A fake transport whose requests stay open until the test settles them. */
function harness(classify: (e: unknown) => ErrorKind = () => "retry") {
  const calls: { index: number; choice: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  let open = 0;
  let maxOpen = 0;
  const q = new SaveQueue(
    (index, choice) =>
      new Promise<void>((resolve, reject) => {
        open++;
        maxOpen = Math.max(maxOpen, open);
        const done = () => open--;
        calls.push({
          index,
          choice,
          resolve: () => (done(), resolve()),
          reject: (e) => (done(), reject(e)),
        });
      }),
    classify,
  );
  const tick = () => new Promise((r) => setTimeout(r, 0));
  /** Answer every request as it arrives, until `p` settles. */
  async function settleAll<T>(p: Promise<T>, how: "resolve" | "reject" = "resolve", err?: unknown): Promise<T> {
    let settled = false;
    void p.finally(() => (settled = true));
    let served = 0;
    while (!settled) {
      await tick();
      while (served < calls.length) {
        const c = calls[served++];
        if (how === "resolve") c.resolve();
        else c.reject(err);
      }
    }
    return p;
  }
  return { q, calls, tick, settleAll, maxOpen: () => maxOpen };
}

describe("SaveQueue", () => {
  it("tap then submit while a save is in flight: drain waits for it and reports saved", async () => {
    const h = harness();
    h.q.set(0, 1);
    const first = h.q.flush(); // save in flight
    await h.tick();
    expect(h.calls).toHaveLength(1);
    const drained = h.q.drain(); // "Yes, submit" tapped right away
    let result: string | undefined;
    void drained.then((r) => (result = r));
    await h.tick();
    expect(result).toBeUndefined(); // must not give up while the save is still running
    h.calls[0].resolve();
    expect(await drained).toBe("saved");
    expect(await first).toBe("saved");
    expect(h.q.size).toBe(0);
  });

  it("a second flush while one runs shares it instead of returning false", async () => {
    const h = harness();
    h.q.set(3, 2);
    const a = h.q.flush();
    const b = h.q.flush();
    expect(b).toBe(a);
    expect(await h.settleAll(a)).toBe("saved");
  });

  it("time-up retry racing finish: both resolve saved, one request at a time", async () => {
    const h = harness();
    h.q.set(0, 1);
    h.q.set(1, 2);
    const retry = h.q.flush(); // interval tick
    const finish = h.q.drain(); // finish() in the same tick
    expect(await h.settleAll(finish)).toBe("saved");
    expect(await retry).toBe("saved");
    expect(h.maxOpen()).toBe(1);
    expect(h.calls.map((c) => [c.index, c.choice])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("a newer pick made during a save is not deleted and is sent after, in order", async () => {
    const h = harness();
    h.q.set(0, 1);
    const p = h.q.drain();
    await h.tick();
    h.q.set(0, 3); // student changes their mind while choice 1 is on the wire
    expect(await h.settleAll(p)).toBe("saved");
    expect(h.calls.map((c) => c.choice)).toEqual([1, 3]);
    expect(h.q.size).toBe(0);
  });

  it("a network failure reports failed and keeps the pick queued", async () => {
    const h = harness();
    h.q.set(4, 0);
    expect(await h.settleAll(h.q.drain(), "reject", new Error("offline"))).toBe("failed");
    expect(h.q.size).toBe(1);
  });

  it("the server closing the attempt reports closed and clears the queue", async () => {
    const h = harness((e) => (e === "409" ? "closed" : "retry"));
    h.q.set(0, 1);
    h.q.set(1, 1);
    expect(await h.settleAll(h.q.drain(), "reject", "409")).toBe("closed");
    expect(h.q.size).toBe(0);
  });

  it("an answer the server rejects as invalid is dropped, the rest still save", async () => {
    const h = harness((e) => (e === "400" ? "drop" : "retry"));
    h.q.set(0, 1);
    h.q.set(1, 2);
    const p = h.q.drain();
    await h.tick();
    h.calls[0].reject("400");
    await h.tick();
    h.calls[1].resolve();
    expect(await p).toBe("saved");
    expect(h.q.size).toBe(0);
  });
});
