'use client';

interface CachedPDF {
  contractId: string;
  originalData: Uint8Array; // **CHANGED: Store original unencrypted data**
  fileName: string;
  fileSize: number;
  cachedAt: number;
  metadata?: any;
}

class PDFCache {
  private dbName = 'epoch-pdf-cache';
  private version = 1;
  private storeName = 'encrypted-pdfs';
  private db: IDBDatabase | null = null;
  private maxDocs = 3; // **NEW: Limit to 3 documents**
  private maxAge = 3 * 24 * 60 * 60 * 1000; // **NEW: 3 days instead of 7**

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
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'contractId' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
    });
  }

  async storePDF(contractId: string, originalData: Uint8Array, fileName: string, metadata?: any): Promise<void> {
    if (!this.db) await this.init();
    
    const cachedPDF: CachedPDF = {
      contractId,
      originalData, // **CHANGED: Store original unencrypted data**
      fileName,
      fileSize: originalData.length,
      cachedAt: Date.now(),
      metadata
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // First, enforce document limit
      this.enforceDocumentLimit(store, () => {
        const request = store.put(cachedPDF);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          console.log('[PDF_CACHE] Stored original PDF for contract:', contractId);
          resolve();
        };
      });
    });
  }

  // **NEW: Enforce 3-document limit**
  private enforceDocumentLimit(store: IDBObjectStore, callback: () => void): void {
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      const allDocs = getAllRequest.result as CachedPDF[];
      
      if (allDocs.length >= this.maxDocs) {
        // Sort by cachedAt (oldest first) and remove oldest documents
        allDocs.sort((a, b) => a.cachedAt - b.cachedAt);
        const docsToRemove = allDocs.slice(0, allDocs.length - this.maxDocs + 1);
        
        console.log(`[PDF_CACHE] Removing ${docsToRemove.length} old documents to make space`);
        
        // Remove old documents
        let removeCount = 0;
        docsToRemove.forEach(doc => {
          const deleteRequest = store.delete(doc.contractId);
          deleteRequest.onsuccess = () => {
            removeCount++;
            if (removeCount === docsToRemove.length) {
              callback(); // Proceed with storing new document
            }
          };
        });
      } else {
        callback(); // Proceed with storing new document
      }
    };
  }

  async getPDF(contractId: string): Promise<CachedPDF | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(contractId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        
        if (result) {
          // **NEW: Check if document is expired**
          const isExpired = Date.now() - result.cachedAt > this.maxAge;
          
          if (isExpired) {
            console.log('[PDF_CACHE] Cached PDF expired for contract:', contractId);
            // Remove expired document
            const deleteTransaction = this.db!.transaction([this.storeName], 'readwrite');
            const deleteStore = deleteTransaction.objectStore(this.storeName);
            deleteStore.delete(contractId);
            resolve(null);
          } else {
            console.log('[PDF_CACHE] Retrieved PDF from cache for contract:', contractId);
            resolve(result);
          }
        } else {
          console.log('[PDF_CACHE] No cached PDF found for contract:', contractId);
          resolve(null);
        }
      };
    });
  }

  // **NEW: Get cache statistics**
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
            console.log(`[PDF_CACHE] Cleaned up ${deletedCount} expired documents`);
          }
          resolve();
        }
      };
    });
  }

  // **NEW: Clear all cached documents**
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[PDF_CACHE] Cleared all cached documents');
        resolve();
      };
    });
  }
}

export const pdfCache = new PDFCache();
