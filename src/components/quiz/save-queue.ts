/** How a failed save is handled: give up on the attempt, drop just this answer, or keep it for a retry. */
export type ErrorKind = "closed" | "drop" | "retry";
export type FlushResult = "saved" | "failed" | "closed";

/**
 * Answers waiting to reach the server, latest pick per question. One request at a time, in order;
 * a pick made while an older one is on the wire is kept and sent next (never deleted by the older reply).
 * Concurrent callers share the single in-flight flush instead of being turned away.
 */
export class SaveQueue {
  private pending: Record<string, number> = {};
  private inflight: Promise<FlushResult> | null = null;

  constructor(
    private send: (index: number, choice: number) => Promise<void>,
    private classify: (e: unknown) => ErrorKind,
  ) {}

  get size(): number {
    return Object.keys(this.pending).length;
  }

  set(index: number, choice: number): void {
    this.pending[String(index)] = choice;
  }

  /** Sends what is queued, or joins the flush already running. */
  flush(): Promise<FlushResult> {
    this.inflight ??= this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Flushes until the queue is empty, the server closes the attempt, or a real failure occurs. */
  async drain(): Promise<FlushResult> {
    for (;;) {
      const r = await this.flush();
      if (r !== "saved" || this.size === 0) return r;
    }
  }

  private async run(): Promise<FlushResult> {
    while (this.size) {
      for (const [k, v] of Object.entries(this.pending)) {
        try {
          await this.send(Number(k), v);
          if (this.pending[k] === v) delete this.pending[k];
        } catch (e) {
          const kind = this.classify(e);
          if (kind === "closed") {
            this.pending = {};
            return "closed";
          }
          if (kind === "drop") {
            if (this.pending[k] === v) delete this.pending[k];
            continue;
          }
          return "failed";
        }
      }
    }
    return "saved";
  }
}
