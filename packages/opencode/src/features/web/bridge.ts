import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type OpenWebPayload = {
  v: 1;
  action: "open-web";
  sessionId: string;
  directory: string;
  baseUrl?: string;
};

export type OpenWebResult = { ok: true } | { ok: false; error: string };

export function writeOpenWebRequest(webFile: string, payload: OpenWebPayload): OpenWebResult {
  if (!webFile.trim()) {
    return { ok: false, error: "Forge bridge unavailable (restart terminal from Forge)" };
  }

  try {
    mkdirSync(dirname(webFile), { recursive: true });
    appendFileSync(webFile, `${JSON.stringify(payload)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function openSessionInWeb(
  api: TuiPluginApi,
  webFile: string,
  sessionId: string,
  webUrl?: string,
): OpenWebResult {
  const directory =
    api.state.session.get(sessionId)?.directory.trim() || api.state.path.directory.trim();
  if (!directory) return { ok: false, error: "No workspace directory for this session" };

  const baseUrl = webUrl?.trim().replace(/\/$/, "");
  const payload: OpenWebPayload = {
    v: 1,
    action: "open-web",
    sessionId,
    directory,
  };
  if (baseUrl) payload.baseUrl = baseUrl;
  return writeOpenWebRequest(webFile, payload);
}
