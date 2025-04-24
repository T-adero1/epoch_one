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
import { Save, X,  Plus, Trash2, User, Send } from 'lucide-react'
import { updateContract, ContractWithRelations } from '@/app/utils/contracts'


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
    newSigners[index] = value
    setSigners(newSigners)
  }

  const handleSave = async () => {
    try {
      // Filter out empty signers
      const filteredSigners = signers.filter(s => s.trim() !== '')
      
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

  return (
    <Card className="w-full h-full border-none shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
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
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="edit">
          <TabsList className="mb-4">
            <TabsTrigger value="edit">Edit Content</TabsTrigger>
            <TabsTrigger value="signers">Signers</TabsTrigger>
            
          </TabsList>
          <TabsContent value="edit" className="min-h-[500px]">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[500px] resize-none p-4 font-mono text-sm"
              placeholder="Write your contract content here..."
            />
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
                
                <div className="flex items-center gap-28 mt-4">
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
      <CardFooter className="flex justify-between pt-4">
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
            className={!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
} 