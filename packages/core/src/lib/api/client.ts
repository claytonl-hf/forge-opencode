import { z } from "zod";

import { ForgeNotReady } from "../errors";

export function client(uri: string, token: string) {
  return async function request<T = unknown>(
    path: string,
    { schema, ...options }: RequestInit & { schema?: z.ZodSchema<T> } = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);

    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${uri}${path}`, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new ForgeNotReady(
        `Forge is not reachable. Request to ${path} failed with status ${response.status} ${response.statusText}.`,
      );
    }

    const data: unknown = await response.json();

    if (!schema) {
      // SAFETY: callers without a schema explicitly select T for this untyped transport.
      return data as T;
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      throw new ForgeNotReady(`Forge response for ${path} is malformed. ${result.error.message}`);
    }

    return result.data;
  };
}
