import { describe, expect, test, vi } from "vitest";

import { createPolledResource, createResource } from "#plugin/resource";

describe("resource", () => {
  test("stores values and does not notify new listeners immediately", () => {
    const resource = createResource<string>("initial");
    const listener = vi.fn();

    expect(resource.get()).toBe("initial");
    const unsubscribe = resource.listen(listener);
    expect(listener).not.toHaveBeenCalled();

    resource.set("updated");
    expect(listener.mock.calls[0]?.[0]).toBe("updated");
    unsubscribe();
  });

  test("updates after an async value fulfills", async () => {
    const resource = createResource<string>("initial");

    await resource.set(Promise.resolve("updated"));

    expect(resource.get()).toBe("updated");
  });

  test("keeps the previous value when an async value rejects", async () => {
    const resource = createResource<string>("initial");

    await expect(resource.set(Promise.reject(new Error("failed")))).rejects.toThrow("failed");

    expect(resource.get()).toBe("initial");
  });

  test("deduplicates overlapping loader sets", async () => {
    let resolve: (value: string) => void = () => undefined;
    const load = vi.fn(() => new Promise<string>((done) => (resolve = done)));
    const resource = createResource<string>();

    const first = resource.load(load);
    const second = resource.load(load);
    resolve("value");

    await expect(Promise.all([first, second])).resolves.toEqual(["value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("polled resource", () => {
  test("keeps state isolated between factories", async () => {
    const first = createPolledResource(async () => "first");
    const second = createPolledResource(async () => "second");

    await first.refresh();

    expect(first.get()).toBe("first");
    expect(second.get()).toBeUndefined();
  });

  test("deduplicates overlapping refreshes", async () => {
    let resolve: (value: string) => void = () => undefined;
    const load = vi.fn(() => new Promise<string>((done) => (resolve = done)));
    const resource = createPolledResource(load);

    const first = resource.refresh();
    const second = resource.refresh();
    resolve("value");

    await expect(Promise.all([first, second])).resolves.toEqual(["value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("shares one initial load between two listeners", async () => {
    const load = vi.fn(async () => "value");
    const resource = createPolledResource(load);
    const first = resource.listen(() => undefined);
    const second = resource.listen(() => undefined);

    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    first();
    second();
  });

  test("polls at the default interval and stops after the last listener unsubscribes", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => "value");
    const resource = createPolledResource(load);
    const unsubscribe = resource.listen(() => undefined);

    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("returns the latest value after refresh", async () => {
    const resource = createPolledResource(async () => 42);

    await resource.refresh();

    expect(resource.get()).toBe(42);
  });

  test("does not notify listeners until the value changes", async () => {
    const listener = vi.fn();
    const resource = createPolledResource(async () => "value");
    const unsubscribe = resource.listen(listener);

    expect(listener).not.toHaveBeenCalled();
    await resource.refresh();
    unsubscribe();

    expect(listener.mock.calls[0]?.[0]).toBe("value");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
