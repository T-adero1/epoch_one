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
  AlertTriangle
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

  // Load PDF URL when component mounts
  useEffect(() => {
    if (contract.s3FileKey) {
      loadPdfUrl();
    }
  }, [contract.s3FileKey]);

  const loadPdfUrl = async () => {
    if (!contract.s3FileKey) return;
    
    setIsLoadingPdf(true);
    try {
      const response = await fetch(`/api/contracts/download-pdf/${contract.id}`);
      if (response.ok) {
        const data = await response.json();
        setPdfUrl(data.downloadUrl);
      } else {
        throw new Error('Failed to load PDF');
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
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
      
      toast({
        title: "PDF Updated Successfully",
        description: `${selectedFile.name} has been uploaded.`,
        variant: "success",
      });
      
      if (onFileUpdate) {
        onFileUpdate(selectedFile);
      }
      setSelectedFile(null);
      
      // Reload the PDF URL
      await loadPdfUrl();
      
    } catch (error) {
      console.error('Error uploading PDF:', error);
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
      console.error('AI editing error:', error);
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
    try {
      // Use the dedicated download endpoint
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
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download Failed", 
        description: "Failed to download PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="border rounded-md min-h-[500px] bg-white relative overflow-hidden">
      {/* Header - Mobile Responsive */}
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
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
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

      {/* Main Content Area - Mobile Responsive Height */}
      <div className="relative h-[400px] sm:h-[500px]">
        {/* PDF Viewer */}
        <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
          showAIPanel ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'
        }`}>
          {contract.s3FileKey ? (
            <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
              <div className="w-full max-w-sm mx-auto text-center space-y-4 sm:space-y-6">
                {/* PDF Icon - Responsive sizing */}
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full">
                  <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
                </div>
                
                {/* File Info - Mobile optimized */}
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words px-2">
                    {contract.s3FileName || 'Contract PDF'}
                  </h3>
                  {contract.s3FileSize && (
                    <p className="text-xs sm:text-sm text-gray-600">
                      File size: {(contract.s3FileSize / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                </div>
                
                {/* Description - Mobile friendly */}
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed px-2">
                  <span className="hidden sm:inline">
                    Open the PDF in a new browser tab for optimal viewing and editing capabilities.
                  </span>
                  <span className="sm:hidden">
                    Open PDF in browser to view or replace with a new file.
                  </span>
                </p>
                
                {/* Action Buttons - Mobile stacked, desktop side-by-side */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/contracts/download-pdf/${contract.id}?view=inline`);
                        if (response.ok) {
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                          // Clean up the blob URL after a short delay
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        } else {
                          throw new Error('Failed to load PDF');
                        }
                      } catch (error) {
                        console.error('Error opening PDF:', error);
                        toast({
                          title: "Error",
                          description: "Failed to open PDF. Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 sm:px-6 sm:py-2.5 text-sm font-medium min-h-[44px] touch-manipulation"
                    size="lg"
                  >
                    <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="hidden sm:inline">Open PDF in Browser</span>
                    <span className="sm:hidden">Open PDF</span>
                  </Button>
                  
                  {showReplaceButton && (
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('pdf-file-input')?.click()}
                      className="w-full sm:w-auto px-4 py-3 sm:px-6 sm:py-2.5 text-sm font-medium min-h-[44px] touch-manipulation border-2"
                      size="lg"
                    >
                      <Upload className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="hidden sm:inline">Replace PDF</span>
                      <span className="sm:hidden">Replace</span>
                    </Button>
                  )}
                </div>
                
                {/* Additional mobile help text */}
                <div className="pt-2 sm:hidden">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    PDF will open in your preferred viewer app or browser.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-white p-3 sm:p-6">
              <div className="w-full max-w-sm mx-auto text-center space-y-4">
                <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400" />
                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900">No PDF uploaded</h3>
                  <p className="text-xs sm:text-sm text-gray-600 px-2">Upload a PDF file to get started</p>
                </div>
                <Button
                  onClick={() => document.getElementById('pdf-file-input')?.click()}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-medium min-h-[44px] touch-manipulation"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload PDF
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* AI Panel - Mobile Optimized */}
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