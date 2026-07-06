type RequestFunction<T> = () => Promise<T>;

export class RequestManager {
  private globalQueue: Promise<any> = Promise.resolve();
  private resourceQueues = new Map<string, Promise<any>>();
  private inFlight = new Map<string, Promise<any>>();

  public globalQueuedRequest<T>(operation: RequestFunction<T>): Promise<T> {
    const promise = this.globalQueue.then(() => operation());

    // errors must not block future requests
    this.globalQueue = promise.catch(() => {});

    return promise;
  }

  public queuedRequest<T>(resourceKey: string, cacheKey: string, operation: RequestFunction<T>): Promise<T> {
    const currentQueue = this.resourceQueues.get(resourceKey) ?? Promise.resolve();

    const promise = currentQueue.then(() => this.deduplicatedRequest(cacheKey, operation));

    // errors must not block the queue
    this.resourceQueues.set(
      resourceKey,
      promise.catch(() => {}),
    );

    return promise;
  }

  public deduplicatedRequest<T>(cacheKey: string, operation: RequestFunction<T>): Promise<T> {
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)!;
    }

    const promise = operation();
    this.inFlight.set(cacheKey, promise);

    // void catch prevents unhandled rejection warning; error still propagates to the original awaiter
    promise
      .catch(() => {})
      .finally(() => {
        this.inFlight.delete(cacheKey);
      });

    return promise;
  }

  public clear(): void {
    this.globalQueue = Promise.resolve();
    this.resourceQueues.clear();
    this.inFlight.clear();
  }
}
