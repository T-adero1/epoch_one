'use client'

import { useState, useEffect } from 'react'
import { useZkLogin } from '@/app/contexts/ZkLoginContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, AlertCircle } from 'lucide-react'
import Image from 'next/image'

interface ZkLoginModalProps {
  isOpen: boolean
  onClose: () => void
  targetEmail?: string | null
  redirectUrl?: string
}

export function ZkLoginModal({ isOpen, onClose, targetEmail, redirectUrl }: ZkLoginModalProps) {
  const { startLogin, isAuthenticated, user } = useZkLogin()
  const [error, setError] = useState<string | null>(null)

  // Handle successful authentication
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      // If we're authenticated and the modal is open, close it
      onClose()
      
      // If there's a target email and it doesn't match the authenticated user
      if (targetEmail && user?.email && targetEmail.toLowerCase() !== user.email.toLowerCase()) {
        setError(`You must sign in with ${targetEmail} to access this page`)
      }
    }
  }, [isAuthenticated, isOpen, onClose, targetEmail, user?.email])

  const handleLogin = () => {
    setError(null)
    startLogin()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal>
      <DialogContent className="sm:max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle className="text-center">Sign in to continue</DialogTitle>
          <DialogDescription className="text-center">
            {targetEmail ? (
              <>
                Please sign in with <span className="font-bold">{targetEmail}</span> to view and sign this contract
              </>
            ) : (
              'Please sign in to continue to the secured page'
            )}
          </DialogDescription>
        </DialogHeader>
        
        {error && (
          <div className="bg-red-50 p-3 rounded-md flex items-start gap-2 text-red-700 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        <div className="flex justify-center py-6">
          <Button onClick={handleLogin} size="lg" className="w-full">
            <Mail className="mr-2 h-4 w-4" />
            Sign in with Google
          </Button>
        </div>
        
        <div className="text-center text-sm text-gray-500">
          Your email will be used to verify your identity. We don't store your password.
        </div>
      </DialogContent>
    </Dialog>
  )
} 