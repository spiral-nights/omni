import { Ok, Error, toList } from "../../gleam.mjs";

let customIndexedDb = null;

export function set_custom_indexeddb(idb) {
  customIndexedDb = idb;
}

function getIndexedDb() {
  if (customIndexedDb) return customIndexedDb;
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

function parseValueIfNeeded(val) {
  if (typeof val !== "string") return val;
  try {
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_e) {}
  return val;
}

function stringifyStoredValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val);
  } catch (_e) {
    return String(val);
  }
}

function createRealDbWrapper(idb) {
  return {
    async get(storeName, key, fnOkSome, fnOkNone, fnErr) {
      try {
        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        const result = await new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new globalThis.Error("Get failed"));
        });
        if (result === undefined || result === null) {
          return fnOkNone();
        }
        return fnOkSome(stringifyStoredValue(result));
      } catch (err) {
        return fnErr(String(err && err.message ? err.message : err));
      }
    },

    async put(storeName, keyOrNull, valueStr) {
      try {
        const tx = idb.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const valToStore = parseValueIfNeeded(valueStr);
        if (keyOrNull !== null && keyOrNull !== undefined) {
          store.put(valToStore, keyOrNull);
        } else {
          store.put(valToStore);
        }
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new globalThis.Error("Put transaction failed"));
          tx.onabort = () => reject(tx.error || new globalThis.Error("Put transaction aborted"));
        });
        return new Ok(undefined);
      } catch (err) {
        return new Error(String(err && err.message ? err.message : err));
      }
    },

    async delete(storeName, key) {
      try {
        const tx = idb.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.delete(key);
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new globalThis.Error("Delete failed"));
        });
        return new Ok(undefined);
      } catch (err) {
        return new Error(String(err && err.message ? err.message : err));
      }
    },

    async all(storeName, fnOk, fnErr) {
      try {
        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        const records = await new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new globalThis.Error("All query failed"));
        });
        const mapped = records.map(stringifyStoredValue);
        return fnOk(toList(mapped));
      } catch (err) {
        return fnErr(String(err && err.message ? err.message : err));
      }
    },

    async query_by_index(storeName, indexName, key, fnOk, fnErr) {
      try {
        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);

        // Try numeric key if it parses cleanly as integer, or raw key
        let queryKey = key;
        if (/^-?\d+$/.test(key.trim())) {
          queryKey = parseInt(key.trim(), 10);
        }

        const req = index.getAll(queryKey);
        let records = await new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new globalThis.Error("Index query failed"));
        });

        // If numeric query returned nothing and key is different from original string, try string key
        if ((!records || records.length === 0) && queryKey !== key) {
          const req2 = index.getAll(key);
          records = await new Promise((resolve, reject) => {
            req2.onsuccess = () => resolve(req2.result);
            req2.onerror = () => reject(req2.error || new globalThis.Error("Index query failed"));
          });
        }

        const mapped = (records || []).map(stringifyStoredValue);
        return fnOk(toList(mapped));
      } catch (err) {
        return fnErr(String(err && err.message ? err.message : err));
      }
    },

    async query_by_index_range(storeName, indexName, lower, upper, fnOk, fnErr) {
      try {
        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const range = IDBKeyRange.bound(lower, upper);
        const req = index.getAll(range);
        const records = await new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new globalThis.Error("Index range query failed"));
        });
        const mapped = (records || []).map(stringifyStoredValue);
        return fnOk(toList(mapped));
      } catch (err) {
        return fnErr(String(err && err.message ? err.message : err));
      }
    },

    async query_by_index_tuple_range(storeName, indexName, first, lower, upper, fnOk, fnErr) {
      try {
        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const range = IDBKeyRange.bound([first, lower], [first, upper]);
        const req = index.getAll(range);
        const records = await new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new globalThis.Error("Tuple range query failed"));
        });
        const mapped = (records || []).map(stringifyStoredValue);
        return fnOk(toList(mapped));
      } catch (err) {
        return fnErr(String(err && err.message ? err.message : err));
      }
    },

    async count(storeName) {
      try {
        const tx = idb.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.count();
        const count = await new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new globalThis.Error("Count query failed"));
        });
        return new Ok(count);
      } catch (err) {
        return new Error(String(err && err.message ? err.message : err));
      }
    },

    async clear(storeName) {
      try {
        const tx = idb.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new globalThis.Error("Clear failed"));
        });
        return new Ok(undefined);
      } catch (err) {
        return new Error(String(err && err.message ? err.message : err));
      }
    },

    close() {
      try {
        idb.close();
      } catch (_e) {}
    }
  };
}

export async function open_db(name, version, on_upgrade, makeUpgrade) {
  const idbFactory = getIndexedDb();
  if (!idbFactory) {
    return new Error("IndexedDB is not available in the current environment");
  }

  return new Promise((resolve) => {
    let req;
    try {
      req = idbFactory.open(name, version);
    } catch (err) {
      resolve(new Error(String(err && err.message ? err.message : err)));
      return;
    }

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const upgradeCtx = makeUpgrade(
        event.oldVersion || 0,
        event.newVersion || version,
        (storeDef) => {
          try {
            const storeName = storeDef.name;
            if (db.objectStoreNames.contains(storeName)) {
              return new Ok(undefined);
            }
            const opts = {};
            if (storeDef.key_path && storeDef.key_path[0]) {
              opts.keyPath = storeDef.key_path[0];
            }
            if (storeDef.auto_increment) {
              opts.autoIncrement = true;
            }
            const store = db.createObjectStore(storeName, opts);
            const indexes = storeDef.indexes ? storeDef.indexes.toArray() : [];
            for (const idx of indexes) {
              store.createIndex(idx.name, idx.key_path, { unique: idx.unique });
            }
            return new Ok(undefined);
          } catch (err) {
            return new Error(String(err && err.message ? err.message : err));
          }
        },
        (storeName) => {
          try {
            if (db.objectStoreNames.contains(storeName)) {
              db.deleteObjectStore(storeName);
            }
            return new Ok(undefined);
          } catch (err) {
            return new Error(String(err && err.message ? err.message : err));
          }
        },
        (storeName, indexDef) => {
          try {
            const tx = req.transaction;
            const store = tx.objectStore(storeName);
            if (!store.indexNames.contains(indexDef.name)) {
              store.createIndex(indexDef.name, indexDef.key_path, {
                unique: indexDef.unique,
              });
            }
            return new Ok(undefined);
          } catch (err) {
            return new Error(String(err && err.message ? err.message : err));
          }
        }
      );
      try {
        on_upgrade(upgradeCtx);
      } catch (err) {
        console.error("Error in on_upgrade handler:", err);
      }
    };

    req.onsuccess = () => {
      resolve(new Ok(createRealDbWrapper(req.result)));
    };

    req.onerror = () => {
      const err = req.error;
      resolve(new Error(String(err && err.message ? err.message : "Failed to open IndexedDB")));
    };

    req.onblocked = () => {
      resolve(new Error("IndexedDB open blocked by other open connections"));
    };
  });
}

function createInMemoryDbWrapper(schemas) {
  // storeName -> { schema, data: Map<key, { raw: string, parsed: any }> }
  const stores = new Map();

  for (const [name, schema] of schemas.entries()) {
    stores.set(name, { schema, data: new Map() });
  }

  function getStore(name) {
    let s = stores.get(name);
    if (!s) {
      s = { schema: { name, key_path: null, indexes: [] }, data: new Map() };
      stores.set(name, s);
    }
    return s;
  }

  return {
    async get(storeName, key, fnOkSome, fnOkNone, _fnErr) {
      const store = getStore(storeName);
      const record = store.data.get(String(key));
      if (!record) return fnOkNone();
      return fnOkSome(record.raw);
    },

    async put(storeName, keyOrNull, valueStr) {
      const store = getStore(storeName);
      const parsed = parseValueIfNeeded(valueStr);
      let key = keyOrNull;
      if (key === null || key === undefined) {
        if (store.schema.key_path && parsed && typeof parsed === "object" && store.schema.key_path in parsed) {
          key = String(parsed[store.schema.key_path]);
        } else {
          key = String(store.data.size + 1);
        }
      }
      store.data.set(String(key), { raw: valueStr, parsed });
      return new Ok(undefined);
    },

    async delete(storeName, key) {
      const store = getStore(storeName);
      store.data.delete(String(key));
      return new Ok(undefined);
    },

    async all(storeName, fnOk, _fnErr) {
      const store = getStore(storeName);
      const items = Array.from(store.data.values()).map(r => r.raw);
      return fnOk(toList(items));
    },

    async query_by_index(storeName, indexName, key, fnOk, _fnErr) {
      const store = getStore(storeName);
      const indexDef = (store.schema.indexes || []).find(i => i.name === indexName);
      const keyPath = indexDef ? indexDef.key_path : indexName;

      const results = [];
      for (const record of store.data.values()) {
        if (record.parsed && typeof record.parsed === "object") {
          const val = record.parsed[keyPath];
          if (String(val) === String(key)) {
            results.push(record.raw);
          }
        }
      }
      return fnOk(toList(results));
    },

    async query_by_index_range(storeName, indexName, lower, upper, fnOk, _fnErr) {
      const store = getStore(storeName);
      const indexDef = (store.schema.indexes || []).find(i => i.name === indexName);
      const keyPath = indexDef ? indexDef.key_path : indexName;
      const results = [];
      for (const record of store.data.values()) {
        if (record.parsed && typeof record.parsed === "object") {
          const val = record.parsed[keyPath];
          if (typeof val === "number" && val >= lower && val <= upper) {
            results.push(record.raw);
          }
        }
      }
      return fnOk(toList(results));
    },

    async query_by_index_tuple_range(storeName, indexName, first, lower, upper, fnOk, _fnErr) {
      const store = getStore(storeName);
      const indexDef = (store.schema.indexes || []).find(i => i.name === indexName);
      const keyPath = indexDef ? indexDef.key_path : indexName;
      const results = [];
      for (const record of store.data.values()) {
        if (record.parsed && typeof record.parsed === "object") {
          const val = record.parsed[keyPath];
          if (Array.isArray(val) && val[0] === first && val[1] >= lower && val[1] <= upper) {
            results.push(record.raw);
          }
        }
      }
      return fnOk(toList(results));
    },

    async count(storeName) {
      const store = getStore(storeName);
      return new Ok(store.data.size);
    },

    async clear(storeName) {
      const store = getStore(storeName);
      store.data.clear();
      return new Ok(undefined);
    },

    close() {
      stores.clear();
    }
  };
}

export async function open_in_memory(on_upgrade, makeUpgrade) {
  const schemas = new Map();
  const upgradeCtx = makeUpgrade(
    0,
    1,
    (storeDef) => {
      const keyPath = storeDef.key_path && storeDef.key_path[0] ? storeDef.key_path[0] : null;
      const indexes = storeDef.indexes ? storeDef.indexes.toArray() : [];
      schemas.set(storeDef.name, {
        name: storeDef.name,
        key_path: keyPath,
        auto_increment: storeDef.auto_increment,
        indexes
      });
      return new Ok(undefined);
    },
    (storeName) => {
      schemas.delete(storeName);
      return new Ok(undefined);
    },
    (storeName, indexDef) => {
      const schema = schemas.get(storeName);
      if (schema) {
        if (!schema.indexes.some((idx) => idx.name === indexDef.name)) {
          schema.indexes.push(indexDef);
        }
      }
      return new Ok(undefined);
    }
  );
  try {
    on_upgrade(upgradeCtx);
  } catch (err) {
    console.error("Error in on_upgrade handler:", err);
  }

  return new Ok(createInMemoryDbWrapper(schemas));
}

export function ffi_get(db, store, key, fnOkSome, fnOkNone, fnErr) {
  return db.get(store, key, fnOkSome, fnOkNone, fnErr);
}

export function ffi_put(db, store, keyOption, value) {
  const key = keyOption && keyOption[0] !== undefined ? keyOption[0] : null;
  return db.put(store, key, value);
}

export function ffi_delete(db, store, key) {
  return db.delete(store, key);
}

export function ffi_all(db, store, fnOk, fnErr) {
  return db.all(store, fnOk, fnErr);
}

export function ffi_query_by_index(db, store, indexName, key, fnOk, fnErr) {
  return db.query_by_index(store, indexName, key, fnOk, fnErr);
}

export function ffi_count(db, store) {
  return db.count(store);
}

export function ffi_clear(db, store) {
  return db.clear(store);
}

export function ffi_close(db) {
  db.close();
}


export function ffi_query_by_index_range(db, store, indexName, lower, upper, fnOk, fnErr) {
  return db.query_by_index_range(store, indexName, lower, upper, fnOk, fnErr);
}


export function ffi_query_by_index_tuple_range(db, store, indexName, first, lower, upper, fnOk, fnErr) {
  return db.query_by_index_tuple_range(store, indexName, first, lower, upper, fnOk, fnErr);
}
