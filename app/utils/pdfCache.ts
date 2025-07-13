'use client';

interface CachedPDF {
  contractId: string;
  encryptedData: Uint8Array; // **CHANGED: Store encrypted data only**
  fileName: string;
  fileSize: number;
  cachedAt: number;
  // **NEW: Store encryption metadata for decryption**
  encryptionMeta: {
    allowlistId: string;
    documentId: string;
    capId: string;
    isEncrypted: boolean;
  };
}

class PDFCache {
  private dbName = 'epoch-pdf-cache';
  private version = 2; // **UPDATED: Increment version for schema change**
  private storeName = 'encrypted-pdfs';
  private db: IDBDatabase | null = null;
  private maxDocs = 5; // **INCREASED: Allow more encrypted docs since they're smaller**
  private maxAge = 7 * 24 * 60 * 60 * 1000; // **INCREASED: 7 days for encrypted docs**

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Clear old store if exists (due to schema change)
        if (db.objectStoreNames.contains(this.storeName)) {
          db.deleteObjectStore(this.storeName);
        }
        
        const store = db.createObjectStore(this.storeName, { keyPath: 'contractId' });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
        console.log('[PDF_CACHE] Updated cache schema for encrypted storage');
      };
    });
  }

  // **NEW: Store encrypted PDF with encryption metadata**
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
    if (!this.db) await this.init();
    
    const cachedPDF: CachedPDF = {
      contractId,
      encryptedData, // **SECURITY: Only encrypted data is stored**
      fileName,
      fileSize: encryptedData.length,
      cachedAt: Date.now(),
      encryptionMeta
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Enforce document limit
      this.enforceDocumentLimit(store, () => {
        const request = store.put(cachedPDF);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          console.log('[PDF_CACHE] Stored encrypted PDF for contract:', contractId, `(${(encryptedData.length / 1024).toFixed(1)} KB)`);
          resolve();
        };
      });
    });
  }

  // **ENHANCED: Get encrypted PDF with metadata**
  async getEncryptedPDF(contractId: string): Promise<CachedPDF | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(contractId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        
        if (result) {
          // Check if document is expired
          const isExpired = Date.now() - result.cachedAt > this.maxAge;
          
          if (isExpired) {
            console.log('[PDF_CACHE] Cached encrypted PDF expired for contract:', contractId);
            // Remove expired document
            const deleteTransaction = this.db!.transaction([this.storeName], 'readwrite');
            const deleteStore = deleteTransaction.objectStore(this.storeName);
            deleteStore.delete(contractId);
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
  }

  // **NEW: Check if encrypted PDF exists in cache**
  async hasEncryptedPDF(contractId: string): Promise<boolean> {
    const cached = await this.getEncryptedPDF(contractId);
    return cached !== null;
  }

  private enforceDocumentLimit(store: IDBObjectStore, callback: () => void): void {
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      const allDocs = getAllRequest.result as CachedPDF[];
      
      if (allDocs.length >= this.maxDocs) {
        // Sort by cachedAt (oldest first) and remove oldest documents
        allDocs.sort((a, b) => a.cachedAt - b.cachedAt);
        const docsToRemove = allDocs.slice(0, allDocs.length - this.maxDocs + 1);
        
        console.log(`[PDF_CACHE] Removing ${docsToRemove.length} old encrypted documents to make space`);
        
        // Remove old documents
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
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
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
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
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
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[PDF_CACHE] Cleared all cached encrypted documents');
        resolve();
      };
    });
  }
}

export const pdfCache = new PDFCache();
