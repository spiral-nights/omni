export class PluginStorageManager {
  private db: IDBDatabase | null = null;
  private dbName: string;

  constructor(dbName: string = "omni_plugin_storage") {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("plugin_kv")) {
          // Key path is compound: [pluginId, key]
          const store = db.createObjectStore("plugin_kv", { keyPath: ["pluginId", "key"] });
          store.createIndex("pluginId", "pluginId", { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async get<T = unknown>(pluginId: string, key: string): Promise<T | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["plugin_kv"], "readonly");
      const store = tx.objectStore("plugin_kv");
      const req = store.get([pluginId, key]);

      req.onsuccess = () => {
        resolve(req.result ? req.result.value : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(pluginId: string): Promise<Record<string, any>> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["plugin_kv"], "readonly");
      const store = tx.objectStore("plugin_kv");
      const index = store.index("pluginId");
      const req = index.openCursor(IDBKeyRange.only(pluginId));
      const result: Record<string, any> = {};

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          result[cursor.value.key] = cursor.value.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async set<T = unknown>(pluginId: string, key: string, value: T): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["plugin_kv"], "readwrite");
      const store = tx.objectStore("plugin_kv");
      const record = {
        pluginId,
        key,
        value,
        updatedAt: Date.now()
      };
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(pluginId: string, key: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["plugin_kv"], "readwrite");
      const store = tx.objectStore("plugin_kv");
      const req = store.delete([pluginId, key]);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(pluginId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["plugin_kv"], "readwrite");
      const store = tx.objectStore("plugin_kv");
      const index = store.index("pluginId");
      const req = index.openCursor(IDBKeyRange.only(pluginId));

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getUsage(pluginId: string): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["plugin_kv"], "readonly");
      const store = tx.objectStore("plugin_kv");
      const index = store.index("pluginId");
      const req = index.openCursor(IDBKeyRange.only(pluginId));
      let totalBytes = 0;

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const json = JSON.stringify(cursor.value);
          totalBytes += json.length * 2; // rough UTF-16 byte estimate
          cursor.continue();
        } else {
          resolve(totalBytes);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }
}
