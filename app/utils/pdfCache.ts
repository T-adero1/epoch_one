'use client';

// ✅ ADD: Type definitions for IndexedDB (if not available globally)
type IDBTransactionMode = 'readonly' | 'readwrite' | 'versionchange';

interface CachedPDF {
  contractId: string;
  encryptedData: Uint8Array;
  fileName: string;
  fileSize: number;
  cachedAt: number;
  encryptionMeta: {
    allowlistId: string;
    documentId: string;
    capId: string;
    isEncrypted: boolean;
  };
}

// **UPDATED: Session Key caching interface**
interface CachedSessionKey {
  allowlistId: string; // **UPDATED: Use allowlistId as primary key instead of packageId**
  packageId: string;   // **NEW: Keep packageId as additional info**
  sessionKeyData: string; // Exported session key data
  createdAt: number;
  expiresAt: number;
  userAddress: string;
}

class PDFCache {
  private dbName = 'epoch-pdf-cache';
  private version = 6;
  private pdfStoreName = 'encrypted-pdfs';
  private sessionKeyStoreName = 'session-keys';
  private db: IDBDatabase | null = null;
  private maxDocs = 5;
  private maxAge = 7 * 24 * 60 * 60 * 1000;
  
  // **NEW: Add initialization tracking**
  private initPromise: Promise<void> | null = null;
  private isInitializing = false;
  private initRetryCount = 0;
  private maxInitRetries = 3;

  async init(): Promise<void> {
    // **NEW: Prevent concurrent initialization**
    if (this.initPromise) {
      return this.initPromise;
    }

    // **NEW: Check if database is already open and valid**
    if (this.db && !this.db.objectStoreNames.contains('invalid')) {
        try {
          // Test the connection with a simple transaction
          this.db.transaction([this.pdfStoreName], 'readonly');
          return Promise.resolve();
        } catch (error) {
          console.warn('[PDF_CACHE] Database connection invalid, reinitializing', error);
          this.db = null;
        }
    }

    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private async _performInit(): Promise<void> {
      return new Promise((resolve, reject) => {
      this.isInitializing = true;
      
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        this.isInitializing = false;
        this.initPromise = null;
        console.error('[PDF_CACHE] Database initialization failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitializing = false;
        this.initRetryCount = 0;
        
        // **NEW: Add error handlers for connection issues**
        this.db.onerror = (event) => {
          console.error('[PDF_CACHE] Database error:', event);
        };
        
        this.db.onclose = () => {
          console.warn('[PDF_CACHE] Database connection closed');
          this.db = null;
          this.initPromise = null;
        };
        
        console.log('[PDF_CACHE] Database initialized successfully');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        try {
          // Handle encrypted PDF store
          if (db.objectStoreNames.contains(this.pdfStoreName)) {
            db.deleteObjectStore(this.pdfStoreName);
          }
          const pdfStore = db.createObjectStore(this.pdfStoreName, { keyPath: 'contractId' });
          pdfStore.createIndex('cachedAt', 'cachedAt', { unique: false });
          
          // **UPDATED: Create session key store with allowlistId as primary key**
          if (db.objectStoreNames.contains(this.sessionKeyStoreName)) {
            db.deleteObjectStore(this.sessionKeyStoreName);
          }
          const sessionStore = db.createObjectStore(this.sessionKeyStoreName, { keyPath: 'allowlistId' });
          sessionStore.createIndex('expiresAt', 'expiresAt', { unique: false });
          sessionStore.createIndex('userAddress', 'userAddress', { unique: false });
          
          console.log('[PDF_CACHE] Updated cache schema to v6 with allowlistId-based session key caching');
        } catch (error) {
          console.error('[PDF_CACHE] Schema upgrade failed:', error);
          reject(error);
        }
      };
      
      request.onblocked = () => {
        console.warn('[PDF_CACHE] Database upgrade blocked by another connection');
        // Give some time for other connections to close
        setTimeout(() => {
          if (this.initRetryCount < this.maxInitRetries) {
            this.initRetryCount++;
            this.initPromise = null;
            this._performInit().then(resolve).catch(reject);
          } else {
            reject(new Error('Database initialization blocked after multiple retries'));
          }
        }, 1000);
      };
    });
  }

  // **NEW: Helper method to ensure database is ready**
  private async ensureDatabase(): Promise<void> {
    if (!this.db || this.isInitializing) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  // **NEW: Safe transaction wrapper with retry logic**
  private async executeTransaction<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    operation: (stores: IDBObjectStore | IDBObjectStore[]) => Promise<T> | T
  ): Promise<T> {
    await this.ensureDatabase();
    
    try {
      const transaction = this.db!.transaction(storeNames, mode);
      const stores = Array.isArray(storeNames) 
        ? storeNames.map(name => transaction.objectStore(name))
        : transaction.objectStore(storeNames);
      
      return await operation(stores);
    } catch (error) {
      // **NEW: Retry on connection errors**
      if (error instanceof DOMException && 
          (error.name === 'InvalidStateError' || error.name === 'TransactionInactiveError')) {
        console.warn('[PDF_CACHE] Database connection lost, reinitializing...');
        this.db = null;
        this.initPromise = null;
        
        // Retry once
        await this.ensureDatabase();
        const transaction = this.db!.transaction(storeNames, mode);
        const stores = Array.isArray(storeNames) 
          ? storeNames.map(name => transaction.objectStore(name))
          : transaction.objectStore(storeNames);
        
        return await operation(stores);
      }
      
      throw error;
    }
  }

  // **UPDATED: Session Key Management with improved error handling**
  async storeSessionKey(
    allowlistId: string,
    packageId: string,
    sessionKeyData: string,
    ttlMin: number,
    userAddress: string
  ): Promise<void> {
    const now = Date.now();
    const cachedSessionKey: CachedSessionKey = {
      allowlistId,
      packageId,
      sessionKeyData,
      createdAt: now,
      expiresAt: now + (ttlMin * 60 * 1000),
      userAddress
    };

    return this.executeTransaction(this.sessionKeyStoreName, 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = (store as IDBObjectStore).put(cachedSessionKey);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          console.log('[PDF_CACHE] Stored session key for allowlist:', allowlistId, `(expires in ${ttlMin}min)`);
          resolve();
        };
      });
    });
  }

  async getSessionKey(allowlistId: string, userAddress: string): Promise<string | null> {
    return this.executeTransaction(this.sessionKeyStoreName, 'readonly', (store) => {
      return new Promise<string | null>((resolve, reject) => {
        const request = (store as IDBObjectStore).get(allowlistId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result as CachedSessionKey;
          
          if (result && result.userAddress === userAddress) {
            if (Date.now() < result.expiresAt) {
              console.log('[PDF_CACHE] Retrieved valid session key for allowlist:', allowlistId);
              resolve(result.sessionKeyData);
            } else {
              console.log('[PDF_CACHE] Session key expired for allowlist:', allowlistId);
              // Clean up expired key
              this.executeTransaction(this.sessionKeyStoreName, 'readwrite', (deleteStore) => {
                (deleteStore as IDBObjectStore).delete(allowlistId);
              }).catch(console.warn);
              resolve(null);
            }
          } else {
            console.log('[PDF_CACHE] No valid session key found for allowlist:', allowlistId);
            resolve(null);
          }
        };
      });
    });
  }

  // **UPDATED: Encrypted PDF Management (applying same pattern to existing methods)**
  async storeEncryptedPDF(
    contractId: string, 
    encryptedData: Uint8Array, 
    fileName: string,
    encryptionMeta: {
      allowlistId: string;
      documentId: string;
      capId: string;
      isEncrypted: boolean;
    }
  ): Promise<void> {
    const cachedPDF: CachedPDF = {
      contractId,
      encryptedData,
      fileName,
      fileSize: encryptedData.length,
      cachedAt: Date.now(),
      encryptionMeta
    };

    return this.executeTransaction(this.pdfStoreName, 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        this.enforceDocumentLimit(store as IDBObjectStore, () => {
          const request = (store as IDBObjectStore).put(cachedPDF);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            console.log('[PDF_CACHE] Stored encrypted PDF for contract:', contractId, `(${(encryptedData.length / 1024).toFixed(1)} KB)`);
            resolve();
          };
        });
      });
    });
  }

  async getEncryptedPDF(contractId: string): Promise<CachedPDF | null> {
    return this.executeTransaction(this.pdfStoreName, 'readonly', (store) => {
      return new Promise<CachedPDF | null>((resolve, reject) => {
        const request = (store as IDBObjectStore).get(contractId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result;
          
          if (result) {
            const isExpired = Date.now() - result.cachedAt > this.maxAge;
            
            if (isExpired) {
              console.log('[PDF_CACHE] Cached encrypted PDF expired for contract:', contractId);
              this.executeTransaction(this.pdfStoreName, 'readwrite', (deleteStore) => {
                (deleteStore as IDBObjectStore).delete(contractId);
              }).catch(console.warn);
              resolve(null);
            } else {
              console.log('[PDF_CACHE] Retrieved encrypted PDF from cache for contract:', contractId);
              resolve(result);
            }
          } else {
            console.log('[PDF_CACHE] No cached encrypted PDF found for contract:', contractId);
            resolve(null);
          }
        };
      });
    });
  }

  async clearExpiredSessionKeys(): Promise<void> {
    const now = Date.now();
    
    return this.executeTransaction(this.sessionKeyStoreName, 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const index = (store as IDBObjectStore).index('expiresAt');
        const request = index.openCursor(IDBKeyRange.upperBound(now));
        
        let deletedCount = 0;
        
        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            if (deletedCount > 0) {
              console.log(`[PDF_CACHE] Cleaned up ${deletedCount} expired session keys`);
            }
          resolve();
          }
        };
      });
    });
  }

  async hasEncryptedPDF(contractId: string): Promise<boolean> {
    try {
      const cached = await this.getEncryptedPDF(contractId);
      return cached !== null;
    } catch (error) {
      console.warn('[PDF_CACHE] Error checking encrypted PDF:', error);
      return false;
    }
  }

  private enforceDocumentLimit(store: IDBObjectStore, callback: () => void): void {
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      const allDocs = getAllRequest.result as CachedPDF[];
      
      if (allDocs.length >= this.maxDocs) {
        allDocs.sort((a, b) => a.cachedAt - b.cachedAt);
        const docsToRemove = allDocs.slice(0, allDocs.length - this.maxDocs + 1);
        
        console.log(`[PDF_CACHE] Removing ${docsToRemove.length} old encrypted documents to make space`);
        
        let removeCount = 0;
        docsToRemove.forEach(doc => {
          const deleteRequest = store.delete(doc.contractId);
          deleteRequest.onsuccess = () => {
            removeCount++;
            if (removeCount === docsToRemove.length) {
              callback();
            }
          };
        });
      } else {
        callback();
      }
    };
  }

  async getCacheStats(): Promise<{ count: number; totalSize: number; oldestDate: Date | null }> {
    if (!this.db) await this.init();
    
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([this.pdfStoreName], 'readonly');
        const store = transaction.objectStore(this.pdfStoreName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const allDocs = request.result as CachedPDF[];
        const totalSize = allDocs.reduce((sum, doc) => sum + doc.fileSize, 0);
        const oldestDate = allDocs.length > 0 
          ? new Date(Math.min(...allDocs.map(doc => doc.cachedAt)))
          : null;
        
        resolve({
          count: allDocs.length,
          totalSize,
          oldestDate
        });
      };
    });
  }

  async clearExpired(): Promise<void> {
    if (!this.db) await this.init();
    
    const cutoff = Date.now() - this.maxAge;
    
      return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.pdfStoreName], 'readwrite');
      const store = transaction.objectStore(this.pdfStoreName);
      const index = store.index('cachedAt');
        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

        let deletedCount = 0;

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          if (deletedCount > 0) {
            console.log(`[PDF_CACHE] Cleaned up ${deletedCount} expired encrypted documents`);
          }
          resolve();
        }
      };
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.pdfStoreName, this.sessionKeyStoreName], 'readwrite');
      
      const pdfStore = transaction.objectStore(this.pdfStoreName);
      const sessionStore = transaction.objectStore(this.sessionKeyStoreName);
      
      let completedCount = 0;
        const onComplete = () => {
          completedCount++;
          if (completedCount === 2) {
            console.log('[PDF_CACHE] Cleared all cached data');
            resolve();
          }
        };
      
      pdfStore.clear().onsuccess = onComplete;
      sessionStore.clear().onsuccess = onComplete;
    });
  }
}

export const pdfCache = new PDFCache();
