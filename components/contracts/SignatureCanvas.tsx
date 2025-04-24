'use client'

import { useRef, useState, useEffect } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { Button } from '@/components/ui/button'
import { Undo2, FileSignature } from 'lucide-react'

interface SignatureProps {
  onSave: (signatureData: string) => void
  disabled?: boolean
}

export default function SignatureDrawingCanvas({ onSave, disabled = false }: SignatureProps) {
  const sigCanvas = useRef<SignatureCanvas>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [signatureSaved, setSignatureSaved] = useState(false)

  // Disable the signature pad when the disabled prop is true
  useEffect(() => {
    if (disabled && sigCanvas.current) {
      // Clear the canvas when disabled
      sigCanvas.current.clear()
      setIsEmpty(true)
    }
  }, [disabled])

  const clear = () => {
    sigCanvas.current?.clear()
    setIsEmpty(true)
    setSignatureSaved(false)
  }
  
  const handleSave = () => {
    if (sigCanvas.current && !isEmpty) {
      const signatureData = sigCanvas.current.toDataURL('image/png')
      onSave(signatureData)
      setSignatureSaved(true)
    }
  }
  
  const handleBegin = () => {
    if (!disabled) {
      setIsEmpty(false)
      setSignatureSaved(false)
    }
  }

  return (
    <div className="border rounded-md p-4 bg-white">
      <div className="text-center mb-4">
        <h3 className="text-lg font-medium">Your Signature</h3>
        <p className="text-sm text-gray-500">Sign inside the box below</p>
      </div>
      
      <div 
        className={`border-2 ${disabled ? 'bg-gray-50' : 'bg-white'} border-dashed border-gray-300 rounded-md`}
        style={disabled ? { pointerEvents: 'none' } : {}}
      >
        <SignatureCanvas
          ref={sigCanvas}
          penColor='black'
          canvasProps={{
            width: 500,
            height: 200,
            className: 'signature-canvas w-full'
          }}
          onBegin={handleBegin}
        />
      </div>
      
      {disabled && (
        <div className="mt-2 text-sm text-gray-500 text-center">
          Signature pad is disabled
        </div>
      )}
      
      <div className="flex justify-between mt-4">
        <Button 
          variant="outline" 
          onClick={clear}
          disabled={isEmpty || disabled || signatureSaved}
        >
          <Undo2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
        
        <Button 
          onClick={handleSave}
          disabled={isEmpty || signatureSaved || disabled}
        >
          <FileSignature className="h-4 w-4 mr-2" />
          Save Signature
        </Button>
      </div>
      
      {signatureSaved && (
        <div className="mt-4 p-2 bg-green-50 text-green-700 rounded-md text-sm text-center">
          Signature saved successfully!
        </div>
      )}
    </div>
  )
} 