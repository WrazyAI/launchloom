/**
 * Minimal bounded-concurrency task queue.
 *
 * Used to overlap independent model calls (per-candidate judges) without
 * unbounded parallelism: tasks start immediately while a worker slot is free
 * and otherwise wait in submission order. Rejections propagate to the caller.
 */
export function createTaskLimiter(concurrency = 2) {
  const parsed = Number(concurrency);
  const max = Math.max(1, Number.isFinite(parsed) ? Math.trunc(parsed) : 1);
  let active = 0;
  const queue = [];

  const runNext = () => {
    while (active < max && queue.length) {
      const task = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task.fn)
        .then(task.resolve, task.reject)
        .finally(() => {
          active -= 1;
          runNext();
        });
    }
  };

  return function schedule(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}
