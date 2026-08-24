import { access, constants } from "node:fs/promises";
import semver from "semver";

export async function exists(path: string, writable = false) {
  try {
    await access(path, constants.F_OK | (writable ? constants.W_OK : 0));
    return true;
  } catch {
    return false;
  }
}

export function createVersion(input: string) {
  const version = semver.parse(input);

  if (!version) {
    return undefined;
  }

  return Object.assign(version, {
    satisfies: (range: string) => semver.satisfies(version, range),
  });
}

export function sortKeys<T extends object>(input: T, cmp?: (a: string, b: string) => number): T {
  const output: Record<string, T[keyof T]> = {};

  for (const key of Object.keys(input).sort(cmp ?? ((a, b) => a.localeCompare(b)))) {
    // SAFETY: key is guaranteed to be in obj since it comes from Object.keys(obj)
    output[key] = input[key as keyof T];
  }

  // SAFETY: sorted contains all keys from obj in the same order, so it has the same type
  return output as T;
}
