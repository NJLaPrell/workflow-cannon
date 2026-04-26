/**
 * CAE trace persistence port (**`T867`**) — legacy adapter shape retained for callers that
 * still need an explicit no-op. Runtime CLI persistence is handled by `cae-kit-sqlite.ts`
 * when `kit.cae.persistence` is true.
 */

export type CaeTracePersistencePort = {
  readonly kind: "noop" | "sqlite";
  persistEvaluationTrace(_traceId: string, _trace: Record<string, unknown>): void | Promise<void>;
};

export const noopCaeTracePersistence: CaeTracePersistencePort = {
  kind: "noop",
  persistEvaluationTrace() {
    /* Legacy default: callers that use this adapter intentionally stay ephemeral. */
  }
};
