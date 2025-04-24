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
import { MoreVertical, Copy, Pencil, Trash2, Send, FileText } from 'lucide-react'
import { ContractStatus } from '@prisma/client'

interface ContractActionsProps {
  contractId: string
  status: ContractStatus
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onSend: () => void
}

export default function ContractActions({ 
  status, 
  onView, 
  onEdit, 
  onDelete, 
  onSend 
}: ContractActionsProps) {
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
        
        <DropdownMenuItem className="cursor-pointer">
          <Copy className="mr-2 h-4 w-4" />
          <span>Duplicate</span>
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