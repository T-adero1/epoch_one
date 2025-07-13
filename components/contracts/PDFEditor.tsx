'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { 
  Download, 
  Upload, 
  Sparkles, 
  Loader2, 
  Brain, 
  Wand2, 
  FileText, 
  Lightbulb,
  X,
  ChevronLeft,
  RefreshCw,
  AlertTriangle,
  Shield,
  ExternalLink,
  RotateCcw
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface PDFEditorProps {
  contract: {
    id: string;
    title: string;
    s3FileKey?: string | null;
    s3FileName?: string | null;
    s3FileSize?: number | null;
    s3ContentType?: string | null;
    // **UPDATED: Use the correct nested structure**
    isEncrypted?: boolean;
    sealAllowlistId?: string | null;
    sealDocumentId?: string | null;
    sealCapId?: string | null;
    metadata?: {
      walrus?: {
        encryption?: {
          allowlistId?: string;
          documentId?: string;
          capId?: string;
        };
      };
    } | null;
  };
  onFileUpdate?: (newFile: File) => void;
  startWithAI?: boolean;
  showDownloadButton?: boolean;
  showReplaceButton?: boolean;
  showAIButton?: boolean;
}

export default function PDFEditor({ 
  contract, 
  onFileUpdate, 
  startWithAI = false,
  showDownloadButton = true,
  showReplaceButton = true,
  showAIButton = true
}: PDFEditorProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // **NEW: Add state for decrypted PDF**
  const [decryptedPdfBlob, setDecryptedPdfBlob] = useState<Blob | null>(null);
  const [decryptedPdfUrl, setDecryptedPdfUrl] = useState<string | null>(null);
  
  // AI functionality state
  const [showAIPanel, setShowAIPanel] = useState(startWithAI);
  const [aiQuery, setAiQuery] = useState('');
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [aiSuggestions] = useState([
    "Add professional headers and footers",
    "Format the document with better spacing",
    "Add a signature section at the end", 
    "Include page numbers and document info",
    "Convert to a more formal contract layout",
    "Add legal disclaimers and terms"
  ]);

  // **NEW: Add extensive logging on component mount**
  useEffect(() => {
    console.log('[PDFEditor] Component mounted with contract:', {
      contractId: contract.id,
      title: contract.title,
      s3FileKey: contract.s3FileKey,
      s3FileName: contract.s3FileName,
      isEncrypted: contract.isEncrypted,
      sealAllowlistId: contract.sealAllowlistId,
      sealDocumentId: contract.sealDocumentId,
      sealCapId: contract.sealCapId,
      metadata: contract.metadata,
      walrusEncryption: contract.metadata?.walrus?.encryption
    });
  }, [contract]);

  // **UPDATED: Enhanced encryption detection with filename fallback**
  const isContractEncrypted = (): boolean => {
    console.log('[PDFEditor] Checking if contract is encrypted...');
    
    const checks = {
      isEncrypted: !!contract.isEncrypted,
      sealAllowlistId: !!contract.sealAllowlistId,
      metadataAllowlistId: !!contract.metadata?.walrus?.encryption?.allowlistId,
      filenameIndicatesEncrypted: !!(contract.s3FileName?.includes('.encrypted.') || contract.s3FileKey?.includes('.encrypted.'))
    };
    
    const result = !!(
      contract.isEncrypted ||
      contract.sealAllowlistId ||
      contract.metadata?.walrus?.encryption?.allowlistId ||
      // **NEW: Fallback detection by filename**
      contract.s3FileName?.includes('.encrypted.') ||
      contract.s3FileKey?.includes('.encrypted.')
    );
    
    console.log('[PDFEditor] Encryption check results:', {
      checks,
      finalResult: result
    });
    
    return result;
  };

  // **UPDATED: Enhanced decryption success handler with cache integration**
  const handleDecryptionSuccess = async (decryptedBlob: Blob) => {
    console.log('[PDFEditor] PDF decrypted successfully, creating object URL');
    console.log('[PDFEditor] Decrypted blob size:', decryptedBlob.size);
    
    // Clean up previous URL if it exists
    if (decryptedPdfUrl) {
      console.log('[PDFEditor] Cleaning up previous object URL');
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    
    // Create new object URL for the decrypted PDF
    const newUrl = URL.createObjectURL(decryptedBlob);
    console.log('[PDFEditor] Created new object URL:', newUrl);
    
    setDecryptedPdfBlob(decryptedBlob);
    setDecryptedPdfUrl(newUrl);
    
    // **NEW: Cache the decrypted PDF for future use**
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      await pdfCache.storeDecryptedPDF(
        contract.id,
        new Uint8Array(await decryptedBlob.arrayBuffer()),
        contract.s3FileName || 'decrypted-contract.pdf'
      );
      console.log('[PDFEditor] Cached decrypted PDF in IndexDB');
    } catch (cacheError) {
      console.warn('[PDFEditor] Failed to cache decrypted PDF:', cacheError);
    }
    
    console.log('[PDFEditor] State updated with decrypted PDF data');
    
    toast({
      title: "PDF Decrypted Successfully",
      description: "Your encrypted PDF is now ready to view and edit.",
      variant: "success",
    });
  };

  // **NEW: Check IndexDB cache on mount**
  useEffect(() => {
    const checkCacheForDecryptedPDF = async () => {
      if (!isContractEncrypted() || decryptedPdfBlob) return;
      
      console.log('[PDFEditor] Checking IndexDB cache for decrypted PDF...');
      try {
        const { pdfCache } = await import('@/app/utils/pdfCache');
        const cachedPDF = await pdfCache.getDecryptedPDF(contract.id);
        
        if (cachedPDF) {
          console.log('[PDFEditor] Found decrypted PDF in cache!');
          const blob = new Blob([cachedPDF.decryptedData], { type: 'application/pdf' });
          handleDecryptionSuccess(blob);
        } else {
          console.log('[PDFEditor] No decrypted PDF found in cache');
        }
      } catch (error) {
        console.warn('[PDFEditor] Cache check failed:', error);
      }
    };

    checkCacheForDecryptedPDF();
  }, [contract.id]);

  // **NEW: Reset decryption state when contract changes**
  useEffect(() => {
    // Clean up previous decrypted data when contract changes
    if (decryptedPdfUrl) {
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    setDecryptedPdfBlob(null);
    setDecryptedPdfUrl(null);
  }, [contract.id]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (decryptedPdfUrl) {
        console.log('[PDFEditor] Cleaning up decrypted PDF URL on unmount');
        URL.revokeObjectURL(decryptedPdfUrl);
      }
      if (pdfUrl) {
        console.log('[PDFEditor] Cleaning up regular PDF URL on unmount');
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [decryptedPdfUrl, pdfUrl]);

  // Load PDF URL when component mounts (for non-encrypted PDFs)
  useEffect(() => {
    if (contract.s3FileKey && !isContractEncrypted()) {
      console.log('[PDFEditor] Loading PDF URL for non-encrypted contract');
      loadPdfUrl();
    } else {
      console.log('[PDFEditor] Skipping PDF URL load:', {
        hasS3FileKey: !!contract.s3FileKey,
        isEncrypted: isContractEncrypted()
      });
    }
  }, [contract.s3FileKey]);

  const loadPdfUrl = async () => {
    if (!contract.s3FileKey) return;
    
    console.log('[PDFEditor] Loading PDF URL for contract:', contract.id);
    setIsLoadingPdf(true);
    try {
      const response = await fetch(`/api/contracts/download-pdf/${contract.id}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[PDFEditor] PDF URL loaded successfully:', data.downloadUrl);
        setPdfUrl(data.downloadUrl);
      } else {
        throw new Error('Failed to load PDF');
      }
    } catch (error) {
      console.error('[PDFEditor] Error loading PDF:', error);
      toast({
        title: "Error Loading PDF",
        description: "Failed to load the PDF file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('[PDFEditor] File selected:', file.name, file.size, file.type);
      
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF file.",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a PDF file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleReplaceFile = async () => {
    if (!selectedFile) return;
    
    console.log('[PDFEditor] Replacing file:', selectedFile.name);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('contractId', contract.id);
      
      const response = await fetch('/api/contracts/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      console.log('[PDFEditor] File replacement successful:', result);
      
      toast({
        title: "PDF Updated Successfully",
        description: `${selectedFile.name} has been uploaded.`,
        variant: "success",
      });
      
      if (onFileUpdate) {
        onFileUpdate(selectedFile);
      }
      setSelectedFile(null);
      
      // Reload the PDF URL if not encrypted
      if (!isContractEncrypted()) {
        console.log('[PDFEditor] Reloading PDF URL after replacement');
        await loadPdfUrl();
      } else {
        console.log('[PDFEditor] Skipping PDF URL reload for encrypted contract');
      }
      
    } catch (error) {
      console.error('[PDFEditor] Error uploading PDF:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAIEdit = async () => {
    if (!aiQuery.trim()) return;
    
    console.log('[PDFEditor] AI edit requested:', aiQuery);
    setIsAIProcessing(true);
    try {
      // For now, show a message about PDF AI editing
      toast({
        title: "AI PDF Editing",
        description: "AI PDF editing is coming soon! For now, you can download, edit externally, and re-upload.",
      });
      
      setShowAIPanel(false);
      setAiQuery('');
      
    } catch (error) {
      console.error('[PDFEditor] AI editing error:', error);
      toast({
        title: "AI Error",
        description: "AI editing failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const downloadPdf = async () => {
    console.log('[PDFEditor] Download PDF requested');
    try {
      // **NEW: Handle decrypted PDF download**
      if (decryptedPdfBlob) {
        console.log('[PDFEditor] Downloading decrypted PDF blob');
        const link = document.createElement('a');
        link.href = decryptedPdfUrl!;
        link.download = contract.s3FileName?.replace('.encrypted.', '.') || 'decrypted-contract.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // Handle regular PDF download
      console.log('[PDFEditor] Downloading regular PDF from server');
      const response = await fetch(`/api/contracts/download-pdf/${contract.id}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const data = await response.json();
      
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = data.fileName || 'contract.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('[PDFEditor] Error downloading PDF:', error);
      toast({
        title: "Download Failed", 
        description: "Failed to download PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // **NEW: Clear decrypted data to force re-decryption**
  const handleRedecrypt = async () => {
    console.log('[PDFEditor] Clearing decrypted data to force re-decryption');
    
    // Clean up current URLs
    if (decryptedPdfUrl) {
      URL.revokeObjectURL(decryptedPdfUrl);
    }
    
    // Clear state
    setDecryptedPdfBlob(null);
    setDecryptedPdfUrl(null);
    
    // Clear cache
    try {
      const { pdfCache } = await import('@/app/utils/pdfCache');
      await pdfCache.clearDecryptedPDF(contract.id);
      console.log('[PDFEditor] Cleared cached decrypted PDF');
    } catch (error) {
      console.warn('[PDFEditor] Failed to clear cache:', error);
    }
    
    toast({
      title: "Cache Cleared",
      description: "Re-decrypting PDF...",
    });
  };

  // **UPDATED: Enhanced PDF viewer with inline PDF display**
  const renderPDFViewer = () => {
    console.log('[PDFEditor] Rendering PDF viewer...');
    
    const isEncrypted = isContractEncrypted();
    
    console.log('[PDFEditor] Render state:', {
      isEncrypted,
      hasDecryptedBlob: !!decryptedPdfBlob,
      hasDecryptedUrl: !!decryptedPdfUrl,
      hasS3FileKey: !!contract.s3FileKey
    });
    
    // **ENCRYPTED PDF HANDLING**
    if (isEncrypted) {
      console.log('[PDFEditor] Rendering encrypted PDF section');
      
      // **UPDATED: Show inline decrypted PDF viewer WITHOUT header (buttons moved to main header)**
      if (decryptedPdfBlob && decryptedPdfUrl) {
        console.log('[PDFEditor] Rendering inline decrypted PDF viewer');
        return (
          <div className="h-full bg-gray-100">
            <iframe
              src={decryptedPdfUrl}
              className="w-full h-full border-0"
              title="Decrypted PDF Viewer"
              style={{ minHeight: '400px' }}
            />
          </div>
        );
      }
      
      // **NEW: Auto-decryption component**
      return (
        <AutoDecryptionView 
          contract={contract}
          onDecrypted={handleDecryptionSuccess}
        />
      );
    }
    
    // **REGULAR PDF HANDLING** (updated to move buttons to main header)
    if (contract.s3FileKey && !isEncrypted && pdfUrl) {
      console.log('[PDFEditor] Rendering inline regular PDF viewer');
      return (
        <div className="h-full bg-gray-100">
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Viewer"
            style={{ minHeight: '400px' }}
          />
        </div>
      );
    }
    
    // **LOADING STATE** for regular PDFs
    if (contract.s3FileKey && !isEncrypted && isLoadingPdf) {
      return (
        <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
          <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Loading PDF</h3>
              <p className="text-xs sm:text-sm text-blue-600">Preparing document for viewing...</p>
            </div>
          </div>
        </div>
      );
    }
    
    // **NO PDF UPLOADED**
    console.log('[PDFEditor] Rendering no PDF section');
    return (
      <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
        <div className="w-full max-w-sm mx-auto text-center space-y-4">
          <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400" />
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-medium text-gray-900">No PDF uploaded</h3>
            <p className="text-xs sm:text-sm text-gray-600 px-2">Upload a PDF file to get started</p>
          </div>
          <Button
            onClick={() => {
              console.log('[PDFEditor] Upload PDF button clicked');
              document.getElementById('pdf-file-input')?.click();
            }}
            className="w-full sm:w-auto px-6 py-3 text-sm font-medium min-h-[44px] touch-manipulation"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload PDF
          </Button>
        </div>
      </div>
    );
  };

  console.log('[PDFEditor] Component render, current state:', {
    isEncrypted: isContractEncrypted(),
    hasDecryptedBlob: !!decryptedPdfBlob,
    hasDecryptedUrl: !!decryptedPdfUrl,
    showAIPanel
  });

  return (
    <div className="border rounded-md min-h-[500px] bg-white relative overflow-hidden">
      {/* **UPDATED: Enhanced Header with PDF Actions** */}
      <div className="p-3 md:p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
        <div className="text-sm text-gray-500">
          {showAIPanel ? (
            <button
              onClick={() => setShowAIPanel(false)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors group"
            >
              <ChevronLeft className="h-3 w-3 group-hover:translate-x-[-1px] transition-transform flex-shrink-0" />
              <span className="font-normal">PDF Editor</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <FileText className="h-3 w-3 flex-shrink-0 text-red-600" />
              <span className="font-normal">PDF Editor</span>
              {/* **NEW: Show encryption indicator** */}
              {isContractEncrypted() && (
                <div className="flex items-center gap-1 ml-2">
                  <Shield className="h-3 w-3 text-purple-500" />
                  <span className="text-xs text-purple-600">Encrypted</span>
                  
                </div>
              )}
              {/* **NEW: Show regular PDF info** */}
              {!isContractEncrypted() && contract.s3FileName && (
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-gray-600">
                    {contract.s3FileName}
                    {contract.s3FileSize && ` (${(contract.s3FileSize / 1024 / 1024).toFixed(1)} MB)`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* **NEW: PDF Action Buttons (moved from PDF viewer)** */}
          {decryptedPdfBlob && decryptedPdfUrl && (
            <>
              <Button
                onClick={downloadPdf}
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
              <Button
                onClick={() => window.open(decryptedPdfUrl, '_blank')}
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in Tab
              </Button>
              
            </>
          )}
          
          {/* **NEW: Regular PDF Action Buttons** */}
          {!isContractEncrypted() && pdfUrl && (
            <>
              <Button
                onClick={downloadPdf}
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
              <Button
                onClick={() => window.open(pdfUrl, '_blank')}
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in Tab
              </Button>
              {showReplaceButton && (
                <Button
                  onClick={() => document.getElementById('pdf-file-input')?.click()}
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs border-blue-200 hover:bg-blue-100"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Replace
                </Button>
              )}
            </>
          )}
          
          {/* **AI Edit Button** */}
          {showAIButton && !showAIPanel && (
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg blur transition duration-200 opacity-25 group-hover:opacity-50"></div>
              <Button
                variant="outline"
                size="sm"
                className="relative gap-2 w-full sm:w-auto transition-all duration-200 bg-white hover:bg-gray-50"
                onClick={() => setShowAIPanel(true)}
                disabled={isAIProcessing}
              >
                <Sparkles className="h-4 w-4" />
                <span className="sm:inline">Edit with AI</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative h-[400px] sm:h-[500px]">
        {/* PDF Viewer */}
        <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
          showAIPanel ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'
        }`}>
          {renderPDFViewer()}
        </div>

        {/* AI Panel - (existing AI panel code unchanged) */}
        <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
          showAIPanel ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}>
          <div className="h-full bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex flex-col">
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-2">
              <div className="max-w-xl mx-auto space-y-3 sm:space-y-4">
                {/* AI Header */}
                <div className="text-center pt-3 pb-2">
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mb-2">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">AI PDF Assistant</h3>
                  <p className="text-xs text-gray-600 max-w-sm mx-auto leading-tight px-2">
                    Describe how you'd like to improve your PDF contract
                  </p>
                </div>

                {/* AI Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What would you like me to help you with?
                  </label>
                  <Textarea
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="For example: 'Add professional formatting' or 'Include signature fields'..."
                    className="min-h-[70px] sm:min-h-[80px] resize-none border-2 border-purple-200 focus:border-purple-400 focus:ring-purple-400 rounded-lg text-sm"
                    disabled={isAIProcessing}
                  />
                </div>

                {/* Quick Suggestions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Quick Suggestions
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {aiSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setAiQuery(suggestion)}
                        disabled={isAIProcessing}
                        className="text-left p-3 sm:p-2.5 text-xs bg-white border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed Action Buttons Footer */}
            <div className="flex-shrink-0 p-3 sm:p-4 pt-2 border-t border-purple-200 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
              <div className="max-w-xl mx-auto">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="text-xs text-gray-500 text-center sm:text-left">
                    <span className="sm:hidden">AI PDF editing coming soon</span>
                    <span className="hidden sm:inline">AI PDF editing feature in development</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAIPanel(false);
                        setAiQuery('');
                      }}
                      disabled={isAIProcessing}
                      className="border-gray-300 flex-1 sm:flex-none"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAIEdit}
                      disabled={!aiQuery.trim() || isAIProcessing}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white min-w-[100px] flex-1 sm:flex-none"
                    >
                      {isAIProcessing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3 w-3 mr-1" />
                          Try It
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
        id="pdf-file-input"
      />

      {/* File replacement modal */}
      {selectedFile && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-medium mb-4">Replace PDF File</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Selected file:</p>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <FileText className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-gray-500">
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedFile(null)}
                disabled={isUploading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReplaceFile}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  'Replace PDF'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// **NEW: Auto-Decryption View Component** (unchanged)
const AutoDecryptionView = ({ 
  contract, 
  onDecrypted 
}: { 
  contract: any; 
  onDecrypted: (blob: Blob) => void; 
}) => {
  const [decryptionStep, setDecryptionStep] = useState<string>('loading-metadata');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const autoDecrypt = async () => {
      console.log('[AutoDecryptionView] Starting auto-decryption...');
      setDecryptionStep('loading-metadata');
      setError(null);
      setProgress(10);

      try {
        // Load encryption metadata
        console.log('[AutoDecryptionView] Loading encryption metadata...');
        let allowlistId = contract.sealAllowlistId || contract.metadata?.walrus?.encryption?.allowlistId;
        let documentId = contract.sealDocumentId || contract.metadata?.walrus?.encryption?.documentId;
        let capId = contract.sealCapId || contract.metadata?.walrus?.encryption?.capId;

        // If missing, fetch fresh data from database
        if (!allowlistId) {
          console.log('[AutoDecryptionView] Fetching fresh contract data...');
          const response = await fetch(`/api/contracts/${contract.id}`);
          if (response.ok) {
            const freshData = await response.json();
            allowlistId = freshData.sealAllowlistId || freshData.metadata?.walrus?.encryption?.allowlistId;
            documentId = freshData.sealDocumentId || freshData.metadata?.walrus?.encryption?.documentId;
            capId = freshData.sealCapId || freshData.metadata?.walrus?.encryption?.capId;
          }
        }

        if (!allowlistId || !documentId) {
          throw new Error('Encryption metadata not found. The file may still be processing.');
        }

        setProgress(20);
        setDecryptionStep('downloading');

        // Check cache first, then download from AWS if needed
        let encryptedData: ArrayBuffer;
        
        try {
          const { pdfCache } = await import('@/app/utils/pdfCache');
          const cachedPDF = await pdfCache.getEncryptedPDF(contract.id);
          
          if (cachedPDF) {
            console.log('[AutoDecryptionView] Using cached encrypted PDF');
            encryptedData = cachedPDF.encryptedData.buffer;
          } else {
            throw new Error('Not in cache');
          }
        } catch (cacheError) {
          // Fallback to AWS download
          console.log('[AutoDecryptionView] Cache miss, downloading from AWS');
          const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
          
          if (!response.ok) {
            throw new Error('Failed to download encrypted PDF from AWS');
          }

          encryptedData = await response.arrayBuffer();
          
          // Cache the downloaded encrypted data for next time
          try {
            const { pdfCache } = await import('@/app/utils/pdfCache');
            await pdfCache.storeEncryptedPDF(
              contract.id,
              new Uint8Array(encryptedData),
              contract.s3FileName || 'encrypted-contract.pdf',
              {
                allowlistId,
                documentId,
                capId: capId || '',
                isEncrypted: true
              }
            );
            console.log('[AutoDecryptionView] Cached downloaded encrypted PDF');
          } catch (cacheError) {
            console.warn('[AutoDecryptionView] Failed to cache downloaded PDF:', cacheError);
          }
        }

        setProgress(40);
        setDecryptionStep('initializing-seal');

        // Initialize SEAL client
        const { SealClient, getAllowlistedKeyServers, SessionKey } = await import('@mysten/seal');
        const { SuiClient, getFullnodeUrl } = await import('@mysten/sui/client');
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
        const { Transaction } = await import('@mysten/sui/transactions');
        const { fromHEX } = await import('@mysten/sui/utils');
        const { bech32 } = await import('bech32');
        const { genAddressSeed, getZkLoginSignature } = await import('@mysten/sui/zklogin');

        const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
        const sealClient = new SealClient({
          suiClient: suiClient as any,
          serverConfigs: getAllowlistedKeyServers('testnet').map((id) => ({
            objectId: id,
            weight: 1,
          })),
          verifyKeyServers: true
        });

        setProgress(50);
        setDecryptionStep('authorizing');

        // Get ephemeral keypair
        const sessionData = localStorage.getItem("epochone_session");
        if (!sessionData) {
          throw new Error("No session data found in localStorage");
        }
        
        const sessionObj = JSON.parse(sessionData);
        const zkLoginState = sessionObj.zkLoginState || sessionObj.user.zkLoginState;
        
        if (!zkLoginState?.ephemeralKeyPair?.privateKey) {
          throw new Error("No ephemeral key private key found in session data");
        }

        // Decode the private key
        function decodeSuiPrivateKey(suiPrivateKey: string): Uint8Array {
          if (!suiPrivateKey.startsWith('suiprivkey1')) {
            throw new Error('Not a valid Sui bech32 private key format');
          }
          
          const decoded = bech32.decode(suiPrivateKey);
          const privateKeyBytes = Buffer.from(bech32.fromWords(decoded.words));
          const secretKey = privateKeyBytes.slice(1); // Remove the first byte (flag)
          
          if (secretKey.length !== 32) {
            throw new Error(`Expected 32 bytes after removing flag, got ${secretKey.length}`);
          }
          
          return new Uint8Array(secretKey);
        }

        const privateKeyBytes = decodeSuiPrivateKey(zkLoginState.ephemeralKeyPair.privateKey);
        const ephemeralKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
        const ephemeralAddress = ephemeralKeypair.getPublicKey().toSuiAddress();

        // Get user address from session
        const userAddress = sessionObj.user?.address || sessionObj.userAddress;
        if (!userAddress) {
          throw new Error('User address not found');
        }

        setProgress(60);
        setDecryptionStep('creating-session');

        // Create session key
        const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID || 
          '0xb5c84864a69cb0b495caf548fa2bf0d23f6b69b131fa987d6f896d069de64429';
        const TTL_MIN = 30;

        // Format document ID
        const docId = documentId.startsWith('0x') ? documentId.substring(2) : documentId;

        // Authorize ephemeral key with sponsored transaction
        const sponsorResponse = await fetch('/api/auth/sponsor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: userAddress,
            allowlistId,
            ephemeralAddress,
            documentId: docId,
            validityMs: 60 * 60 * 1000 // 1 hour
          })
        });

        if (!sponsorResponse.ok) {
          const errorText = await sponsorResponse.text();
          throw new Error(`Sponsorship failed: ${sponsorResponse.status} ${errorText}`);
        }
        
        const { sponsoredTxBytes } = await sponsorResponse.json();
        
        // Sign the sponsored bytes with ephemeral key
        const { fromB64 } = await import('@mysten/sui/utils');
        const txBlock = Transaction.from(fromB64(sponsoredTxBytes));
        const { signature: userSignature } = await txBlock.sign({
          client: suiClient,
          signer: ephemeralKeypair
        });
        
        // Create zkLogin signature
        const salt = zkLoginState.salt;
        if (!salt) {
          throw new Error("No salt found in zkLoginState!");
        }
        
        const jwt = zkLoginState.jwt;
        const jwtBody = JSON.parse(atob(jwt.split('.')[1]));
        const addressSeed = genAddressSeed(
          BigInt(salt),
          'sub',
          jwtBody.sub,
          jwtBody.aud
        ).toString();
        
        const zkLoginSignature = getZkLoginSignature({
          inputs: {
            ...zkLoginState.zkProofs,
            addressSeed,
          },
          maxEpoch: zkLoginState.maxEpoch,
          userSignature,
        });
        
        // Execute authorization
        const executeResponse = await fetch('/api/auth/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sponsoredTxBytes,
            zkLoginSignature
          })
        });
        
        if (!executeResponse.ok) {
          const errorText = await executeResponse.text();
          throw new Error(`Execution failed: ${executeResponse.status} ${errorText}`);
        }
        
        const { digest } = await executeResponse.json();
        
        // Wait for transaction confirmation
        await suiClient.waitForTransaction({
          digest: digest,
          options: { showEffects: true }
        });

        setProgress(70);
        setDecryptionStep('fetching-keys');

        // Create session key for decryption
        const sessionKey = new SessionKey({
          address: ephemeralAddress,
          packageId: SEAL_PACKAGE_ID,
          ttlMin: TTL_MIN,
          signer: ephemeralKeypair,
          suiClient: suiClient as any
        });
        
        // Sign personal message
        const personalMessage = sessionKey.getPersonalMessage();
        const signature = await ephemeralKeypair.signPersonalMessage(personalMessage);
        await sessionKey.setPersonalMessageSignature(signature.signature);
        
        // Create seal_approve transaction
        const tx = new Transaction();
        tx.setSender(ephemeralAddress);
        
        const rawId = docId.startsWith('0x') ? docId.substring(2) : docId;
        const documentIdBytes = fromHEX(rawId);

        tx.moveCall({
          target: `${SEAL_PACKAGE_ID}::allowlist::seal_approve`,
          arguments: [
            tx.pure.vector('u8', Array.from(documentIdBytes)),
            tx.object(allowlistId),
            tx.object('0x6')
          ]
        });
        
        const txKindBytes = await tx.build({ 
          client: suiClient, 
          onlyTransactionKind: true
        });

        // Fetch keys
        await sealClient.fetchKeys({
          ids: [rawId],
          txBytes: txKindBytes,
          sessionKey,
          threshold: 1
        });

        setProgress(90);
        setDecryptionStep('decrypting');

        // Decrypt the data
        const decryptedData = await sealClient.decrypt({
          data: new Uint8Array(encryptedData),
          sessionKey: sessionKey,
          txBytes: txKindBytes
        });

        setProgress(100);
        setDecryptionStep('complete');

        // Create blob and call success handler
        const decryptedBlob = new Blob([decryptedData], { type: 'application/pdf' });
        onDecrypted(decryptedBlob);

      } catch (err) {
        console.error('[AutoDecryptionView] Auto-decryption failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to decrypt PDF automatically');
        setDecryptionStep('error');
      }
    };

    autoDecrypt();
  }, [contract.id]);

  const getStepMessage = () => {
    switch (decryptionStep) {
      case 'loading-metadata': return 'Loading encryption metadata...';
      case 'downloading': return 'Downloading encrypted PDF...';
      case 'initializing-seal': return 'Initializing SEAL client...';
      case 'authorizing': return 'Authorizing ephemeral key...';
      case 'creating-session': return 'Creating decryption session...';
      case 'fetching-keys': return 'Fetching decryption keys...';
      case 'decrypting': return 'Decrypting PDF data...';
      case 'complete': return 'Decryption complete!';
      case 'error': return 'Decryption failed';
      default: return 'Processing...';
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
        <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full">
            <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Auto-Decryption Failed</h3>
            <p className="text-xs sm:text-sm text-red-600">{error}</p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="text-sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
      <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
        {/* Decryption Icon */}
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-purple-100 rounded-full">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 animate-spin" />
        </div>
        
        {/* File Info */}
        <div className="space-y-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words px-2">
            Auto-Decrypting PDF
          </h3>
          <p className="text-xs sm:text-sm text-purple-600">
            {getStepMessage()}
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="pt-2 text-xs text-gray-500 leading-relaxed">
          Decryption happens entirely on your device - the file never leaves encrypted
        </div>
      </div>
    </div>
  );
}; 