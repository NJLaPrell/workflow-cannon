/**
 * CAE trace persistence port (**`T867`**) — v1 default is ephemeral / no-op per **`ADR-cae-persistence-v1.md`**.
 */

export type CaeTracePersistencePort = {
  readonly kind: "noop" | "sqlite";
  persistEvaluationTrace(_traceId: string, _trace: Record<string, unknown>): void | Promise<void>;
};

export const noopCaeTracePersistence: CaeTracePersistencePort = {
  kind: "noop",
  persistEvaluationTrace() {
    /* v1 default: traces stay in session store only */
  }
};
