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
