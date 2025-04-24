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
  const containerRef = useRef<HTMLDivElement>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [signatureSaved, setSignatureSaved] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Handle resizing and canvas dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        
        // Set dimensions for the canvas
        setDimensions({
          width: offsetWidth,
          height: offsetHeight
        });
      }
    };

    // Initial calculation
    updateDimensions();
    
    // Recalculate on window resize
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Manually fix the canvas scaling when dimensions change
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      
      // Clear any existing content
      sigCanvas.current.clear();
      setIsEmpty(true);
      
      // Set the canvas dimensions to match the container
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      
      // Reset the transformation matrix
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      
      // Apply any necessary scaling
      sigCanvas.current.fromData([]);
    }
  }, [dimensions]);

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
        ref={containerRef}
        className={`border-2 ${disabled ? 'bg-gray-50' : 'bg-white'} border-dashed border-gray-300 rounded-md`}
        style={{ 
          height: '200px',
          position: 'relative',
          pointerEvents: disabled ? 'none' : 'auto' 
        }}
      >
        {dimensions.width > 0 && (
          <SignatureCanvas
            ref={sigCanvas}
            penColor='black'
            canvasProps={{
              width: dimensions.width,
              height: dimensions.height,
              style: {
                width: '100%',
                height: '100%',
                touchAction: 'none'
              }
            }}
            onBegin={handleBegin}
          />
        )}
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