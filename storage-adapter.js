function defaultExtensionStorage() {
  return globalThis.chrome?.storage?.local ?? null;
}

function defaultWebStorage() {
  return globalThis.localStorage ?? null;
}

export function createStorageAdapter({
  getExtensionStorage = defaultExtensionStorage,
  getWebStorage = defaultWebStorage,
  onError = () => {},
} = {}) {
  return {
    async get(
      key,
      {
        fallback = null,
        deserializeExtension = (value) => value,
        deserializeWeb = (value) => value,
      } = {},
    ) {
      try {
        const extensionStorage = getExtensionStorage();
        if (extensionStorage?.get) {
          const result = await extensionStorage.get([key]);
          const value = result?.[key];
          return value === undefined
            ? fallback
            : deserializeExtension(value);
        }

        const webStorage = getWebStorage();
        if (!webStorage?.getItem) return fallback;
        const value = webStorage.getItem(key);
        return value === null ? fallback : deserializeWeb(value);
      } catch (error) {
        onError(error, { key, operation: "read" });
        return fallback;
      }
    },

    async set(
      key,
      value,
      { serializeWeb = (storedValue) => String(storedValue) } = {},
    ) {
      try {
        const extensionStorage = getExtensionStorage();
        if (extensionStorage?.set) {
          await extensionStorage.set({ [key]: value });
          return true;
        }

        const webStorage = getWebStorage();
        if (!webStorage?.setItem) return false;
        webStorage.setItem(key, serializeWeb(value));
        return true;
      } catch (error) {
        onError(error, { key, operation: "write" });
        return false;
      }
    },
  };
}
