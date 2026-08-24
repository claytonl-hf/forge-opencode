import { atom } from "nanostores";

const DEFAULT_POLL_INTERVAL_MS = 60_000;

export function createResource<T>(initial?: T) {
  const state = atom<T | undefined>(initial);
  let inFlight: Promise<T> | undefined;

  function set(value: T | undefined): void;
  function set(value: Promise<T>): Promise<T>;
  function set(value: T | undefined | Promise<T>) {
    if (value instanceof Promise) {
      const request = value.then((next) => {
        state.set(next);
        return next;
      });
      inFlight = request;
      void request.then(
        () => {
          if (inFlight === request) inFlight = undefined;
        },
        () => {
          if (inFlight === request) inFlight = undefined;
        },
      );
      return request;
    }

    state.set(value);
  }

  function load(loader: () => Promise<T>): Promise<T> {
    if (inFlight) return inFlight;
    return set(loader());
  }

  return {
    get: () => state.get(),
    set,
    load,
    listen: (fn: (value: T | undefined) => void) => state.listen(fn),
  };
}

export function createPolledResource<T>(load: () => Promise<T>) {
  const resource = createResource<T>();
  let references = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => resource.load(load);

  const poll = () => {
    if (!references) return;
    refresh()
      .catch(() => undefined)
      .finally(() => {
        if (references) timer = setTimeout(poll, DEFAULT_POLL_INTERVAL_MS);
      });
  };

  return {
    get: resource.get,
    listen: (fn: (value: T | undefined) => void) => {
      const unsubscribe = resource.listen(fn);
      references += 1;
      if (references === 1) poll();
      return () => {
        unsubscribe();
        references -= 1;
        if (!references && timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
    refresh,
  };
}
