import { ForgeNotReady, ForgeNotRunning, ForgeError } from "./lib/errors";
import { Forge, ForgeMinimumVersion } from "./lib/forge";
import { handshake } from "./lib/handshake";
import { Store, store } from "./lib/store";
import { createVersion } from "./lib/utils";

export type { ForgeAgent } from "./lib/resources/agents";
export type { ForgeCommand } from "./lib/resources/commands";
export type { ForgeEnvironment, ForgeEnvironmentVariables } from "./lib/api/env";
export type { ForgeModel, ForgeModels } from "./lib/resources/models";
export type { ForgeModelBand, ForgeModelCostTier, ForgeModelSpeedTier } from "./lib/api/models";
export type { ForgeProvider } from "./lib/resources/provider";
export type { ForgeUsage } from "./lib/resources/usage";

export { ForgeNotReady, ForgeNotRunning, ForgeError, Forge };

export async function createForge() {
  const { hash, ...instance } = await handshake();

  // Validate process is running
  try {
    process.kill(instance.pid, 0);
  } catch {
    throw new ForgeNotRunning(`Forge process not detected.`);
  }

  if ((await store.get(Store.Instance)) !== hash) {
    await store.set(Store.Instance, hash);
    await store.clear(Store.Environment);
  }

  // Validate API is reachable and user is signed in
  try {
    const api = new Forge(
      instance.appPath,
      `http://${instance.host}:${instance.port}`,
      instance.token,
    );
    const status = await api.status();
    const version = createVersion(status.version);

    if (!version || !version.satisfies(`>=${ForgeMinimumVersion}`)) {
      throw new ForgeNotReady(`Forge version ${ForgeMinimumVersion} or higher is required.`);
    }

    if (!status.ok || !status.signedIn) {
      throw new ForgeNotReady(`Forge cannot be reached or not signed in.`);
    }

    return api;
  } catch (error) {
    if (error instanceof ForgeNotReady) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ForgeNotRunning(`Forge cannot be reached. ${message}`);
  }
}

export default Forge;
