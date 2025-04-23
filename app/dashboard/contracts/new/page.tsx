'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useZkLogin } from '@/contexts/ZkLoginContext';
import { HiOutlineSparkles, HiCheck, HiX, HiDownload, HiClipboard, HiSave, HiArrowLeft, HiUser } from 'react-icons/hi';
import Link from 'next/link';
import { useToast } from '@/hooks/useToast';

const MOCK_AI_GENERATED_CONTRACT = `
NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement (the "Agreement") is entered into as of [DATE], by and between:

[PARTY A NAME], with its principal offices at [PARTY A ADDRESS] ("Disclosing Party"), and
[PARTY B NAME], with its principal offices at [PARTY B ADDRESS] ("Receiving Party").

1. PURPOSE
The Disclosing Party wishes to disclose certain confidential and proprietary information to the Receiving Party for the purpose of [DESCRIBE PURPOSE] (the "Purpose").

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any data or information that is proprietary to the Disclosing Party and not generally known to the public, whether in tangible or intangible form, including, but not limited to: trade secrets, technical information, marketing strategies, business operations, customer lists, financial information, business plans, product development, and any other information marked as confidential.

3. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party shall:
a) Keep all Confidential Information strictly confidential;
b) Not disclose any Confidential Information to any third party without prior written consent of the Disclosing Party;
c) Use the Confidential Information solely for the Purpose and not for any personal or other purpose;
d) Take all reasonable precautions to prevent unauthorized disclosure of the Confidential Information;
e) Notify the Disclosing Party immediately upon discovery of any unauthorized use or disclosure of Confidential Information.

4. TERM AND TERMINATION
This Agreement shall remain in effect for a period of [DURATION] years from the Effective Date. The obligations of confidentiality shall survive the termination of this Agreement for a period of [SURVIVAL PERIOD] years.

5. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of [JURISDICTION].

IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the date first above written.

[PARTY A NAME]
By: _________________________
Name: 
Title: 

[PARTY B NAME]
By: _________________________
Name: 
Title: 
`;

export default function NewContractPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, userAddress } = useZkLogin();
  const [contractTitle, setContractTitle] = useState('');
  const [contractContent, setContractContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [showAiOptions, setShowAiOptions] = useState(false);
  const { toast } = useToast();
  
  // AI prompt options
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAIConfirmation, setShowAIConfirmation] = useState(false);
  
  // Check if coming from AI generation
  const isFromAI = searchParams.get('ai') === 'true';
  
  // Redirect to login page if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);
  
  // Load saved draft from localStorage on mount
  useEffect(() => {
    const savedTitle = localStorage.getItem('contractTitle');
    const savedDraft = localStorage.getItem('contractDraft');
    
    if (savedTitle) {
      setContractTitle(savedTitle);
    }
    
    if (savedDraft) {
      setContractContent(savedDraft);
    } else if (isFromAI) {
      // If coming from AI generation, load mock AI contract
      setContractTitle('Non-Disclosure Agreement');
      setContractContent(MOCK_AI_GENERATED_CONTRACT);
    }
  }, [isFromAI]);
  
  // Auto-save draft to localStorage
  useEffect(() => {
    if (contractContent.trim() || contractTitle.trim()) {
      const timeoutId = setTimeout(() => {
        localStorage.setItem('contractTitle', contractTitle);
        localStorage.setItem('contractDraft', contractContent);
        setSavedLocally(true);
        
        // Reset the "saved" indicator after 3 seconds
        setTimeout(() => {
          setSavedLocally(false);
        }, 3000);
      }, 1500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [contractContent, contractTitle]);
  
  const handleSaveContract = async () => {
    if (!contractTitle.trim() || !contractContent.trim()) {
      alert('Please provide both a title and content for the contract.');
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Create the contract via API
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: contractTitle,
          content: contractContent,
          status: 'draft',
          creatorAddress: userAddress,
        }),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        const errorMessage = responseData.error || 'Failed to create contract';
        console.error(`Contract creation failed (${response.status}):`, errorMessage);
        throw new Error(errorMessage);
      }
      
      console.log('Contract created successfully:', responseData);
      console.log('Created contract will be displayed on dashboard with ID:', responseData.contract.id);
      
      // Success notification
      toast({
        title: 'Contract created',
        description: 'Your contract has been created successfully.',
        status: 'success',
        duration: 5000,
      });
      
      // Clear localStorage after successful save
      localStorage.removeItem('contractTitle');
      localStorage.removeItem('contractDraft');
      
      // After successful save, redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Error saving contract:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save contract. Please try again.',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      alert('Please provide a prompt for the AI.');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      // Here you would make an API call to an AI service
      // For now, we'll just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // After successful generation, show confirmation
      setShowAIConfirmation(true);
      setContractContent(MOCK_AI_GENERATED_CONTRACT);
      setContractTitle('AI-Generated Contract');
      
      // Hide AI options
      setShowAiOptions(false);
    } catch (error) {
      console.error('Error generating with AI:', error);
      alert('Failed to generate contract with AI. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading</h2>
          <p className="text-gray-600">Please wait while we verify your session...</p>
        </div>
      </div>
    );
  }
  
  // Show nothing if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }
  
  return (
    <div className="bg-gray-50 min-h-screen pb-12">
      <div className="container mx-auto px-4">
        <Link 
          href="/dashboard" 
          className="inline-flex items-center px-4 py-2 mt-4 text-gray-600 hover:text-gray-900 bg-white rounded-lg shadow-sm"
        >
          <HiArrowLeft className="h-5 w-5 mr-1" />
          Back to Dashboard
        </Link>
      </div>
      
      {/* AI Generation Confirmation */}
      {showAIConfirmation && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 container mx-auto mt-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <HiOutlineSparkles className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800">
                Contract successfully generated with AI. Review and make any necessary changes before saving.
              </p>
            </div>
            <div className="ml-auto">
              <button onClick={() => setShowAIConfirmation(false)} className="text-green-600">
                <HiX className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contract Editor */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6">
                <label htmlFor="contractTitle" className="block text-sm font-medium text-gray-700 mb-1">
                  Contract Title
                </label>
                <input
                  type="text"
                  id="contractTitle"
                  value={contractTitle}
                  onChange={(e) => setContractTitle(e.target.value)}
                  className="block w-full shadow-sm sm:text-sm focus:ring-blue-500 focus:border-blue-500 border-gray-300 rounded-md"
                  placeholder="Enter contract title"
                />
              </div>
              
              <div className="border-t border-gray-200 px-6 py-4">
                <textarea
                  value={contractContent}
                  onChange={(e) => setContractContent(e.target.value)}
                  className="w-full h-96 p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Start writing or paste your contract here..."
                />
              </div>
            </div>
          </div>
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* AI Assistant */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:px-6 bg-gradient-to-r from-purple-500 to-indigo-600">
                <div className="flex items-center">
                  <HiOutlineSparkles className="h-5 w-5 text-yellow-300 mr-2" />
                  <h3 className="text-lg leading-6 font-medium text-white">
                    AI Assistant
                  </h3>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-purple-100">
                  Let AI help with your contract
                </p>
              </div>
              
              <div className="p-5 space-y-4">
                {!showAiOptions ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowAiOptions(true)}
                      className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <HiOutlineSparkles className="h-5 w-5 text-indigo-200 mr-2" />
                      Generate with AI
                    </button>
                    
                    <button
                      className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <HiClipboard className="h-5 w-5 text-gray-500 mr-2" />
                      Summarize Contract
                    </button>
                    
                    <button
                      className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <HiClipboard className="h-5 w-5 text-gray-500 mr-2" />
                      Simplify Language
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="aiPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                        Describe what you want in your contract
                      </label>
                      <textarea
                        id="aiPrompt"
                        name="aiPrompt"
                        rows={6}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        placeholder="Example: Create a non-disclosure agreement for a software development project between two companies..."
                      />
                    </div>
                    
                    <div className="flex space-x-3">
                      <button
                        onClick={() => setShowAiOptions(false)}
                        className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleGenerateWithAI}
                        disabled={isGenerating || !aiPrompt.trim()}
                        className="flex-1 flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                      >
                        {isGenerating ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                          </>
                        ) : (
                          'Generate'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:px-6 bg-gray-50">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Quick Actions
                </h3>
              </div>
              <div className="p-5 space-y-3">
                <button
                  onClick={handleSaveContract}
                  disabled={isSaving || !contractTitle.trim() || !contractContent.trim()}
                  className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <HiSave className="h-5 w-5 mr-2" />
                      Save Contract
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear all content?')) {
                      setContractTitle('');
                      setContractContent('');
                      localStorage.removeItem('contractTitle');
                      localStorage.removeItem('contractDraft');
                    }
                  }}
                  className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                >
                  <HiX className="h-5 w-5 text-gray-500 mr-2" />
                  Clear Draft
                </button>
                
                <button
                  onClick={() => {
                    const element = document.createElement('a');
                    const file = new Blob([contractContent], {type: 'text/plain'});
                    element.href = URL.createObjectURL(file);
                    element.download = `${contractTitle || 'contract-draft'}.txt`;
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                  }}
                  className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                  disabled={!contractContent.trim()}
                >
                  <HiDownload className="h-5 w-5 text-gray-500 mr-2" />
                  Download as Text
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 