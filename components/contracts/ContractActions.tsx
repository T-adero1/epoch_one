'use client'

import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreVertical, FileDown, Pencil, Trash2, Send, FileText, FileSignature } from 'lucide-react'
import { ContractStatus } from '@prisma/client'
import { generateContractPDF } from '@/app/utils/pdf'
import { useToast } from '@/components/ui/use-toast'
import { generateSigningLink } from '@/app/utils/signatures'
import { useRouter } from 'next/navigation'

interface ContractActionsProps {
  contractId: string
  status: ContractStatus
  contract?: {
    id: string;
    title: string;
    description?: string | null;
    content: string;
    createdAt: Date;
    status: string;
    ownerId: string;
    metadata?: {
      signers?: string[];
    } | null;
  }
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onSend: () => void
}

export default function ContractActions({ 
  contractId,
  status, 
  contract,
  onView, 
  onEdit, 
  onDelete, 
  onSend 
}: ContractActionsProps) {
  const { toast } = useToast();
  const router = useRouter();

  const handleDownloadPDF = async () => {
    try {
      console.log('Download PDF - Contract object:', contract);
      console.log('Download PDF - Contract ID:', contractId);
      
      // Show preparing toast and create a reference to it
      toast({
        title: "Preparing PDF",
        description: "Your contract is being converted to PDF...",
      });
      
      // If contract is not provided, we'll create a minimal one using the contractId
      if (!contract) {
        console.warn('Contract object not provided, attempting to fetch from API...');
        
        try {
          // Fetch contract data from API
          const response = await fetch(`/api/contracts/${contractId}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch contract: ${response.status}`);
          }
          
          const contractData = await response.json();
          console.log('Successfully fetched contract data:', contractData);
          
          // Use the fetched data for PDF generation
          await generateContractFromData(contractData);
        } catch (fetchError) {
          console.error('Error fetching contract data:', fetchError);
          toast({
            title: "Download Failed",
            description: "Could not retrieve contract data. Please try again.",
            variant: "destructive",
          });
          return;
        }
      } else {
        // Check if necessary properties exist
        if (!contract.title || !contract.content) {
          console.error('Contract missing required properties:', {
            hasTitle: Boolean(contract.title),
            hasContent: Boolean(contract.content),
            hasCreatedAt: Boolean(contract.createdAt)
          });
          
          toast({
            title: "Download Failed",
            description: "Contract is missing required information for PDF generation.",
            variant: "destructive",
          });
          return;
        }
        
        try {
          await generateContractPDF(contract);
          
          toast({
            title: "PDF Downloaded",
            description: "Your contract has been downloaded as a PDF file.",
            variant: "success",
          });
        } catch (error) {
          console.error('Error generating PDF:', error);
          toast({
            title: "Download Failed",
            description: "There was a problem generating the PDF. Please try again.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download Failed",
        description: "There was a problem generating the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Helper function to generate PDF from fetched data
  const generateContractFromData = async (contractData: any) => {
    try {
      await generateContractPDF({
        id: contractData.id,
        title: contractData.title,
        description: contractData.description,
        content: contractData.content,
        createdAt: new Date(contractData.createdAt),
        status: contractData.status,
        ownerId: contractData.ownerId,
        metadata: contractData.metadata
      });
      
      toast({
        title: "PDF Downloaded",
        description: "Your contract has been downloaded as a PDF file.",
        variant: "success",
      });
    } catch (error) {
      console.error('Error generating PDF from fetched data:', error);
      
      toast({
        title: "Download Failed",
        description: "There was a problem generating the PDF. Please try again.",
        variant: "destructive",
      });
      
      throw error;
    }
  };

  const handleSignContract = () => {
    router.push(`/sign/${contractId}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onView} className="cursor-pointer">
          <FileText className="mr-2 h-4 w-4" />
          <span>View Details</span>
        </DropdownMenuItem>
        
        {status === ContractStatus.DRAFT && (
          <>
            <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
              <Pencil className="mr-2 h-4 w-4" />
              <span>Edit</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSend} className="cursor-pointer">
              <Send className="mr-2 h-4 w-4" />
              <span>Send for Signature</span>
            </DropdownMenuItem>
          </>
        )}
        
        {(status === ContractStatus.ACTIVE || status === ContractStatus.PENDING) && (
          <DropdownMenuItem onClick={handleSignContract} className="cursor-pointer">
            <FileSignature className="mr-2 h-4 w-4" />
            <span>Sign Contract</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={handleDownloadPDF} className="cursor-pointer">
          <FileDown className="mr-2 h-4 w-4" />
          <span>Download as PDF</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-red-600">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 