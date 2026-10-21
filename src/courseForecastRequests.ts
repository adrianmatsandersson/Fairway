/** Shares in-flight requests by course ID and permits retries after settlement. */
export class CourseForecastRequests<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  run(courseId: string, request: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(courseId);
    if (existing) return existing;

    const pending = Promise.resolve().then(request);
    this.inFlight.set(courseId, pending);
    const clear = () => {
      if (this.inFlight.get(courseId) === pending) this.inFlight.delete(courseId);
    };
    void pending.then(clear, clear);
    return pending;
  }

  clear(): void {
    this.inFlight.clear();
  }
}
