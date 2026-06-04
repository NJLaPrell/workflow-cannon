export class DashboardStartupSingleFlight {
  private inFlight: Promise<void> | undefined;

  isInFlight(): boolean {
    return this.inFlight !== undefined;
  }

  run(factory: () => Promise<void>, onReuse?: () => void): Promise<void> {
    if (this.inFlight) {
      onReuse?.();
      return this.inFlight;
    }
    const run = factory().finally(() => {
      if (this.inFlight === run) {
        this.inFlight = undefined;
      }
    });
    this.inFlight = run;
    return run;
  }

  clear(): void {
    this.inFlight = undefined;
  }
}
