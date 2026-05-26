export type DrawerSessionStep =
  | "idle"
  | "open"
  | "submitting"
  | "success"
  | "validation-error"
  | "failed"
  | "closing";

export type WcDrawerStateSnapshot = {
  workflowId: string;
  step: DrawerSessionStep;
  label: string;
  busy: boolean;
  validation?: string;
};

export type DrawerSessionPostMessage = {
  type: "wcDrawerState";
  state: WcDrawerStateSnapshot;
};

export type DrawerSessionPoster = (message: DrawerSessionPostMessage) => void | Promise<void>;

/**
 * Host-side drawer lifecycle state machine (T100489).
 * Emits wcDrawerState snapshots so the webview renders overlay UX from one channel.
 */
export class DrawerSessionController {
  private step: DrawerSessionStep = "idle";
  private workflowId = "";
  private label = "";
  private validation: string | undefined;

  constructor(private readonly post: DrawerSessionPoster) {}

  snapshot(): WcDrawerStateSnapshot {
    return {
      workflowId: this.workflowId,
      step: this.step,
      label: this.label,
      busy: this.step === "submitting",
      validation: this.validation
    };
  }

  open(workflowId: string): void {
    this.workflowId = workflowId;
    this.step = "open";
    this.label = "";
    this.validation = undefined;
    void this.emit();
  }

  setSubmitting(label: string): void {
    this.step = "submitting";
    this.label = label;
    this.validation = undefined;
    void this.emit();
  }

  setSuccess(message?: string): void {
    this.step = "success";
    if (message) {
      this.label = message;
    }
    this.validation = undefined;
    void this.emit();
  }

  setValidationError(message: string): void {
    this.step = "validation-error";
    this.validation = message;
    void this.emit();
  }

  setFailed(message: string): void {
    this.step = "failed";
    this.label = message;
    void this.emit();
  }

  beginClosing(): void {
    this.step = "closing";
    void this.emit();
  }

  reset(): void {
    this.step = "idle";
    this.workflowId = "";
    this.label = "";
    this.validation = undefined;
    void this.emit();
  }

  private emit(): void {
    void this.post({ type: "wcDrawerState", state: this.snapshot() });
  }
}

/** Apply wcDrawerState in the webview — shared with dashboard-webview-client bootstrap. */
export function buildDrawerStateApplierScript(): string {
  return `
  function applyWcDrawerState(state) {
    if (!state || typeof state !== 'object') return;
    var dh = document.getElementById('wc-drawer-host');
    if (!dh) return;
    var panel = dh.querySelector('.wc-drawer-panel');
    if (!panel && state.step !== 'idle' && state.step !== 'closing') return;
    if (state.step === 'idle' || state.step === 'closing') {
      setDrawerBusy(false);
      if (state.step === 'closing') {
        dh.innerHTML = '';
        dh.classList.add('wc-drawer-host--hidden');
        dh.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    if (state.validation) {
      setDrawerBusy(false);
      var v = document.getElementById('wc-drawer-validation');
      if (v) { v.textContent = state.validation; v.hidden = false; }
      return;
    }
    if (state.busy) {
      setDrawerBusy(true, state.label || undefined);
    } else {
      setDrawerBusy(false);
    }
  }
`.trim();
}

/** Apply wcHostSnapshot in the webview (T100494) — drawer slice + refresh busy. */
export function buildHostSnapshotApplierScript(): string {
  return `
  function applyHostSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1) return;
    hostSnapshot = snapshot;
    if (snapshot.drawer) applyWcDrawerState(snapshot.drawer);
    if (snapshot.interaction) {
      if (typeof snapshot.interaction.refreshBusy === 'boolean') {
        var refreshBtn = document.getElementById('btn');
        if (refreshBtn) setButtonBusy(refreshBtn, snapshot.interaction.refreshBusy, 'Refreshing…');
      }
    }
  }
`.trim();
}
