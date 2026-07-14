/* IndexedDB wrapper — all app data lives on the device. */
const DB = (() => {
  const NAME = 'project-review-db';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('reviews')) {
          const s = db.createObjectStore('reviews', { keyPath: 'id' });
          s.createIndex('projectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function store(name, mode) {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  return {
    async put(name, value) {
      return reqToPromise((await store(name, 'readwrite')).put(value));
    },
    async get(name, key) {
      return reqToPromise((await store(name, 'readonly')).get(key));
    },
    async getAll(name) {
      return reqToPromise((await store(name, 'readonly')).getAll());
    },
    async delete(name, key) {
      return reqToPromise((await store(name, 'readwrite')).delete(key));
    },
    async byIndex(name, indexName, value) {
      const s = await store(name, 'readonly');
      return reqToPromise(s.index(indexName).getAll(value));
    },

    /* App settings stored under a single record. */
    async getSettings() {
      const rec = await this.get('settings', 'app');
      return Object.assign(
        { reviewer: '', company: '', aiEnabled: false, apiKey: '' },
        rec ? rec.value : {}
      );
    },
    async saveSettings(value) {
      return this.put('settings', { key: 'app', value });
    },
  };
})();
