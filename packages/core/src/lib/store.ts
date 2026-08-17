import paths from "env-paths";
import { createStorage, type StorageValue } from "unstorage";
import fsDriver from "unstorage/drivers/fs-lite";

const locations = paths("forge", { suffix: "" });
const storage = createStorage({
  driver: fsDriver({ base: locations.cache }),
});

export enum Store {
  Instance = "instance",
  Environment = "env",
}

export const store = {
  async get<T extends StorageValue>(key: Store): Promise<T | undefined> {
    return (await storage.getItem<T>(key)) ?? undefined;
  },
  async set<T extends StorageValue>(key: Store, value: T): Promise<void> {
    await storage.setItem(key, value);
  },
  async clear(key: Store): Promise<void> {
    await storage.removeItem(key);
  },
};
