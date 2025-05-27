'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save, X,  Plus, Trash2, User, Send, ChevronLeft, Sparkles, ArrowRight, Loader2, Brain, Wand2, FileText, Lightbulb, Check } from 'lucide-react'
import { updateContract, ContractWithRelations } from '@/app/utils/contracts'
import { detectGroupedChanges, applyGroupedChanges, ChangeGroup } from '@/app/utils/textDiff'
import AIChangesReview from './AIChangesReview'
import ContractEditorWithDiff from './ContractEditorWithDiff'


interface ContractEditorProps {
  contract: ContractWithRelations;
  onSave: (updatedContract: ContractWithRelations) => void;
  onCancel: () => void;
}

// Define an interface for the original values
interface OriginalValues {
  content: string;
  title: string;
  description: string;
  signers: string[];
}

// Add this helper function at the top of the component
function isSpacingOnlyChange(group: ChangeGroup): boolean {
  const filteredOriginal = group.originalLines.filter(line => line.trim() !== '');
  const filteredNew = group.newLines.filter(line => line.trim() !== '');
  return filteredOriginal.length === 0 && filteredNew.length === 0;
}

export default function ContractEditor({ contract, onSave, onCancel }: ContractEditorProps) {
  const [content, setContent] = useState(contract.content || '')
  const [title, setTitle] = useState(contract.title || '')
  const [description, setDescription] = useState(contract.description || '')
  const [signers, setSigners] = useState<string[]>([])
  
  // Track original values to detect changes with proper typing
  const [originalValues, setOriginalValues] = useState<OriginalValues>({
    content: contract.content || '',
    title: contract.title || '',
    description: contract.description || '',
    signers: contract.metadata?.signers || []
  })
  
  // State to track if any changes have been made
  const [hasChanges, setHasChanges] = useState(false)
  
  // AI functionality state
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [aiSuggestions] = useState([
    "Make this contract more professional and formal",
    "Add a confidentiality clause",
    "Include payment terms and conditions", 
    "Add termination and cancellation clauses",
    "Simplify the language for easier understanding",
    "Add liability and insurance provisions"
  ])
  const [aiSuggestion, setAiSuggestion] = useState<string>('')
  const [detectedChangeGroups, setDetectedChangeGroups] = useState<ChangeGroup[]>([])
  const [acceptedGroups, setAcceptedGroups] = useState<string[]>([])
  const [rejectedGroups, setRejectedGroups] = useState<string[]>([])
  const [showDiffMode, setShowDiffMode] = useState(false)
  
  // Initialize values when contract changes
  useEffect(() => {
    setContent(contract.content || '')
    setTitle(contract.title || '')
    setDescription(contract.description || '')
    
    // Initialize signers from contract metadata
    const contractSigners = contract.metadata?.signers || []
    setSigners(contractSigners.length ? [...contractSigners] : [''])
    
    setOriginalValues({
      content: contract.content || '',
      title: contract.title || '',
      description: contract.description || '',
      signers: contractSigners
    })
    
    setHasChanges(false)
  }, [contract])
  
  // Check for changes whenever form values change
  useEffect(() => {
    const contentChanged = content !== originalValues.content
    const titleChanged = title !== originalValues.title
    const descriptionChanged = description !== originalValues.description
    
    // Check if signers have changed
    let signersChanged = false
    const filteredSigners = signers.filter(s => s.trim() !== '')
    
    if (filteredSigners.length !== originalValues.signers.length) {
      signersChanged = true
    } else {
      for (let i = 0; i < filteredSigners.length; i++) {
        if (filteredSigners[i] !== originalValues.signers[i]) {
          signersChanged = true
          break
        }
      }
    }
    
    setHasChanges(contentChanged || titleChanged || descriptionChanged || signersChanged)
  }, [content, title, description, signers, originalValues])
  
  const handleAddSigner = () => {
    setSigners([...signers, ''])
  }
  
  const handleRemoveSigner = (index: number) => {
    const newSigners = [...signers]
    newSigners.splice(index, 1)
    setSigners(newSigners.length ? newSigners : [''])
  }
  
  const handleSignerChange = (index: number, value: string) => {
    const newSigners = [...signers]
    newSigners[index] = value.toLowerCase()
    setSigners(newSigners)
  }

  const handleSave = async () => {
    try {
      // Filter out empty signers and convert to lowercase
      const filteredSigners = signers.filter(s => s.trim() !== '').map(s => s.toLowerCase())
      
      const updatedContract = await updateContract(contract.id, {
        title,
        description,
        content,
        metadata: {
          ...contract.metadata,
          signers: filteredSigners
        }
      })
      
      // Update original values after successful save
      setOriginalValues({
        content,
        title,
        description,
        signers: filteredSigners
      })
      
      setHasChanges(false)
      onSave(updatedContract)
    } catch (error) {
      console.error('Error updating contract:', error)
    }
  }

  const handleAIEdit = async () => {
    if (!aiQuery.trim()) return
    
    setIsAIProcessing(true)
    try {
      const response = await fetch('/api/ai/edit-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentContent: content,
          query: aiQuery,
          contractTitle: title,
          contractDescription: description
        })
      })
      
      if (!response.ok) {
        throw new Error('AI editing failed')
      }
      
      const data = await response.json()
      setAiSuggestion(data.editedContent)
      
      // Detect grouped changes
      const diffResult = detectGroupedChanges(content, data.editedContent)
      setDetectedChangeGroups(diffResult.changeGroups)
      
      // Automatically accept spacing-only changes
      const spacingOnlyGroups = diffResult.changeGroups
        .filter(group => group.type !== 'unchanged' && isSpacingOnlyChange(group))
        .map(group => group.id);
      
      setAcceptedGroups(spacingOnlyGroups)
      setRejectedGroups([])
      setShowDiffMode(true)
      setShowAIPanel(false)
      setAiQuery('')
      
    } catch (error) {
      console.error('AI editing error:', error)
    } finally {
      setIsAIProcessing(false)
    }
  }

  const handleAcceptGroup = (groupId: string) => {
    setAcceptedGroups(prev => [...prev, groupId])
    setRejectedGroups(prev => prev.filter(id => id !== groupId))
  }

  const handleRejectGroup = (groupId: string) => {
    setRejectedGroups(prev => [...prev, groupId])
    setAcceptedGroups(prev => prev.filter(id => id !== groupId))
  }

  const handleAcceptAllChanges = () => {
    const changeableIds = detectedChangeGroups
      .filter(group => group.type !== 'unchanged')
      .map(group => group.id)
    setAcceptedGroups(changeableIds)
    setRejectedGroups([])
  }

  const handleRejectAllChanges = () => {
    const changeableIds = detectedChangeGroups
      .filter(group => group.type !== 'unchanged')
      .map(group => group.id)
    setRejectedGroups(changeableIds)
    setAcceptedGroups([])
  }

  const handleApplyChanges = () => {
    const updatedContent = applyGroupedChanges(content, detectedChangeGroups, acceptedGroups)
    setContent(updatedContent)
    setShowDiffMode(false)
    setDetectedChangeGroups([])
    setAcceptedGroups([])
    setRejectedGroups([])
    setAiSuggestion('')
  }

  const handleDiscardChanges = () => {
    setShowDiffMode(false)
    setDetectedChangeGroups([])
    setAcceptedGroups([])
    setRejectedGroups([])
    setAiSuggestion('')
  }

  // Update the pending changes count to exclude spacing-only changes
  const pendingChangesCount = detectedChangeGroups.filter(group => 
    group.type !== 'unchanged' && 
    !acceptedGroups.includes(group.id) && 
    !rejectedGroups.includes(group.id) &&
    !isSpacingOnlyChange(group)
  ).length

  return (
    <Card className="w-full h-full border-none shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-xl font-semibold">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-semibold border-none p-0 h-auto focus-visible:ring-0"
                  placeholder="Contract Title"
                />
              </CardTitle>
              <CardDescription>
                <Input
                  value={description || ''}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-sm text-gray-500 border-none p-0 h-auto focus-visible:ring-0"
                  placeholder="Contract Description"
                />
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="edit">
          <TabsList className="mb-4">
            <TabsTrigger value="edit">Edit Content</TabsTrigger>
            <TabsTrigger value="signers">Signers</TabsTrigger>
            
          </TabsList>
          <TabsContent value="edit" className="min-h-[500px] relative">
            <div className="border rounded-md min-h-[500px] bg-white relative overflow-hidden">
              {/* Header - Mobile Responsive */}
              <div className="p-3 md:p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
                <div className="text-sm text-gray-500">
                  {showDiffMode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm">AI Suggestions</span>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {acceptedGroups.length} accepted
                      </span>
                      {pendingChangesCount > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                          {pendingChangesCount} pending
                        </span>
                      )}
                    </div>
                  ) : (
                    'Contract Editor'
                  )}
                </div>
                
                {!showDiffMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full sm:w-auto"
                    onClick={() => setShowAIPanel(!showAIPanel)}
                    disabled={isAIProcessing}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="sm:inline">Edit with AI</span>
                  </Button>
                )}
              </div>

              {/* Main Content Area - Mobile Responsive Height */}
              <div className={`relative ${showDiffMode ? 'h-[350px] sm:h-[420px]' : 'h-[400px] sm:h-[500px]'}`}>
                {/* Contract Editor with Diff Overlay */}
                <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                  showAIPanel && !showDiffMode
                    ? '-translate-x-full opacity-0' 
                    : 'translate-x-0 opacity-100'
                }`}>
                  <ContractEditorWithDiff
                    content={content}
                    changeGroups={detectedChangeGroups}
                    acceptedGroups={acceptedGroups}
                    rejectedGroups={rejectedGroups}
                    onAcceptGroup={handleAcceptGroup}
                    onRejectGroup={handleRejectGroup}
                    onContentChange={setContent}
                    showDiff={showDiffMode}
                  />
                </div>

                {/* AI Panel - Mobile Optimized */}
                {!showDiffMode && (
                  <div className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                    showAIPanel 
                      ? 'translate-x-0 opacity-100' 
                      : 'translate-x-full opacity-0'
                  }`}>
                    <div className="h-full bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex flex-col">
                      {/* Compact Fixed AI Header - Mobile Optimized */}
                      <div className="flex-shrink-0 text-center p-3 pb-2">
                        <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mb-2">
                          <Brain className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-800 mb-1">AI Assistant</h3>
                        <p className="text-xs text-gray-600 max-w-sm mx-auto leading-tight px-2">
                          Describe how you'd like to improve your contract
                        </p>
                      </div>

                      {/* Scrollable Content Area - Mobile Optimized */}
                      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-2">
                        <div className="max-w-xl mx-auto space-y-3 sm:space-y-4">
                          {/* AI Input - Mobile Optimized */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              What would you like me to help you with?
                            </label>
                            <Textarea
                              value={aiQuery}
                              onChange={(e) => setAiQuery(e.target.value)}
                              placeholder="For example: 'Add a confidentiality clause' or 'Make the language more formal'..."
                              className="min-h-[70px] sm:min-h-[80px] resize-none border-2 border-purple-200 focus:border-purple-400 focus:ring-purple-400 rounded-lg text-sm"
                              disabled={isAIProcessing}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                  e.preventDefault()
                                  handleAIEdit()
                                }
                              }}
                            />
                          </div>

                          {/* Quick Suggestions - Mobile Grid */}
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
                                  className="text-left p-3 sm:p-2.5 text-xs bg-white border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Fixed Action Buttons Footer - Mobile Optimized */}
                      <div className="flex-shrink-0 p-3 sm:p-4 pt-2 border-t border-purple-200 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
                        <div className="max-w-xl mx-auto">
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
                            <div className="text-xs text-gray-500 text-center sm:text-left">
                              <span className="hidden sm:inline">Press Ctrl+Enter to submit</span>
                              <span className="sm:hidden">Tap Enhance to continue</span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowAIPanel(false)
                                  setAiQuery('')
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
                                    <span className="hidden sm:inline">Processing...</span>
                                    <span className="sm:hidden">...</span>
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3 mr-1" />
                                    Enhance
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Diff Mode Action Bar - Mobile Optimized */}
              {showDiffMode && (
                <div className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-3 sm:p-4">
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 lg:gap-0">
                    {/* Left side - Bulk actions - Mobile Stack */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      <span className="text-sm font-medium text-gray-700 text-center sm:text-left">Quick Actions:</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAcceptAllChanges}
                          className="text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300 flex-1 sm:flex-none"
                          disabled={pendingChangesCount === 0}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Accept All</span>
                          <span className="sm:hidden">Accept</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRejectAllChanges}
                          className="text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300 flex-1 sm:flex-none"
                          disabled={pendingChangesCount === 0}
                        >
                          <X className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Reject All</span>
                          <span className="sm:hidden">Reject</span>
                        </Button>
                      </div>
                    </div>
                    
                    {/* Right side - Primary actions - Mobile Stack */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDiscardChanges}
                        className="border-gray-300 hover:bg-gray-50 flex-1 sm:flex-none"
                      >
                        <X className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">Discard All Changes</span>
                        <span className="sm:hidden">Discard</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApplyChanges}
                        disabled={acceptedGroups.length === 0}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md min-w-[100px] sm:min-w-[140px] flex-1 sm:flex-none"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">Apply {acceptedGroups.length} Change{acceptedGroups.length !== 1 ? 's' : ''}</span>
                        <span className="sm:hidden">Apply ({acceptedGroups.length})</span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Progress indicator - Mobile Optimized */}
                  {(acceptedGroups.length > 0 || pendingChangesCount > 0) && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
                        <span className="text-center sm:text-left">
                          Progress: {acceptedGroups.length} accepted, {pendingChangesCount} pending
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <div className="w-full sm:w-32 bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${(acceptedGroups.length / (acceptedGroups.length + pendingChangesCount)) * 100}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium whitespace-nowrap">
                            {Math.round((acceptedGroups.length / (acceptedGroups.length + pendingChangesCount)) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="signers" className="min-h-[500px]">
            <div className="border rounded-md p-6 min-h-[500px] bg-white">
              <h3 className="text-lg font-medium mb-4">Contract Signers</h3>
              <p className="text-sm text-gray-500 mb-6">
                Add email addresses of people who need to sign this contract.
              </p>
              
              <div className="space-y-4">
                {signers.map((signer, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-full">
                      <User className="h-4 w-4 text-blue-500" />
                    </div>
                    <Input
                      value={signer}
                      onChange={(e) => handleSignerChange(index, e.target.value)}
                      placeholder="Enter signer email"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSigner(index)}
                      disabled={signers.length === 1 && !signer.trim()}
                      className={signers.length === 1 && !signer.trim() ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                ))}
                
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    onClick={handleAddSigner}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Signer
                  </Button>
                  
                  {contract.status === 'DRAFT' && (
                    <Button 
                      onClick={async () => {
                        // First save any changes
                        if (hasChanges) {
                          await handleSave();
                        }
                        
                        // Then update status to PENDING
                        const updatedContract = await updateContract(contract.id, {
                          status: 'PENDING'
                        });
                        
                        onSave(updatedContract);
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={signers.filter(s => s.trim() !== '').length === 0}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send for Signatures
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between pt-4 border-t">
        <div className="text-sm text-gray-500">
          {hasChanges ? 'Unsaved changes' : 'No changes'}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges}
            className={!hasChanges ? 'opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
} 