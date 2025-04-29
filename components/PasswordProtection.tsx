'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cn } from "@/lib/utils"

const PASSWORD = process.env.NEXT_PUBLIC_SITE_PASSWORD
const PASSWORD_KEY = 'epochone_authenticated'

// Clear any existing authentication on page load


// Custom DialogContent without close button
function CustomDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function PasswordProtection({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const authenticated = localStorage.getItem(PASSWORD_KEY) === 'true'
    setIsAuthenticated(authenticated)
    if (!authenticated) {
      setShowDialog(true)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === PASSWORD) {
      localStorage.setItem(PASSWORD_KEY, 'true')
      setIsAuthenticated(true)
      setShowDialog(false)
      setError('')
    } else {
      setError('Incorrect password')
    }
  }

  if (!isAuthenticated) {
    return (
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <CustomDialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Enter Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className={error ? 'border-red-500' : ''}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full">
              Submit
            </Button>
          </form>
        </CustomDialogContent>
      </Dialog>
    )
  }

  return <>{children}</>
} 