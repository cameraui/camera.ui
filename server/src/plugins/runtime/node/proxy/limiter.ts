const REGISTER_CONCURRENCY = 8;

let active = 0;
const queue: (() => void)[] = [];

export function limitRegistration<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = (): void => {
      active++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < REGISTER_CONCURRENCY) run();
    else queue.push(run);
  });
}
