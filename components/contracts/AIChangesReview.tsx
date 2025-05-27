'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, X, Plus, Minus, Edit3, ChevronDown, ChevronRight } from 'lucide-react'
import { TextChange } from '@/app/utils/textDiff'

interface AIChangesReviewProps {
  changes: TextChange[];
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  acceptedChanges: string[];
  rejectedChanges: string[];
}

export default function AIChangesReview({
  changes,
  onAcceptChange,
  onRejectChange,
  onAcceptAll,
  onRejectAll,
  acceptedChanges,
  rejectedChanges
}: AIChangesReviewProps) {
  const [expandedChanges, setExpandedChanges] = useState<string[]>([])

  const toggleExpanded = (changeId: string) => {
    setExpandedChanges(prev => 
      prev.includes(changeId) 
        ? prev.filter(id => id !== changeId)
        : [...prev, changeId]
    )
  }

  const getChangeIcon = (type: string) => {
    switch (type) {
      case 'addition': return <Plus className="h-4 w-4 text-green-600" />
      case 'deletion': return <Minus className="h-4 w-4 text-red-600" />
      case 'modification': return <Edit3 className="h-4 w-4 text-blue-600" />
      default: return null
    }
  }

  const getChangeColor = (type: string) => {
    switch (type) {
      case 'addition': return 'border-green-200 bg-green-50'
      case 'deletion': return 'border-red-200 bg-red-50'
      case 'modification': return 'border-blue-200 bg-blue-50'
      default: return 'border-gray-200 bg-gray-50'
    }
  }

  const getChangeStatus = (changeId: string) => {
    if (acceptedChanges.includes(changeId)) return 'accepted'
    if (rejectedChanges.includes(changeId)) return 'rejected'
    return 'pending'
  }

  const pendingChanges = changes.filter(change => 
    !acceptedChanges.includes(change.id) && !rejectedChanges.includes(change.id)
  )

  return (
    <div className="space-y-4">
      {/* Header with bulk actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">
          AI Suggestions ({changes.length} changes)
        </div>
        {pendingChanges.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRejectAll}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <X className="h-3 w-3 mr-1" />
              Reject All
            </Button>
            <Button
              size="sm"
              onClick={onAcceptAll}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Check className="h-3 w-3 mr-1" />
              Accept All
            </Button>
          </div>
        )}
      </div>

      {/* Changes list */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {changes.map((change) => {
          const status = getChangeStatus(change.id)
          const isExpanded = expandedChanges.includes(change.id)
          
          return (
            <Card key={change.id} className={`p-3 ${getChangeColor(change.type)} transition-all`}>
              <div className="flex items-start gap-3">
                {/* Change type icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getChangeIcon(change.type)}
                </div>

                {/* Change content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => toggleExpanded(change.id)}
                      className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {change.type.charAt(0).toUpperCase() + change.type.slice(1)}
                    </button>
                    {status === 'accepted' && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                        Accepted
                      </span>
                    )}
                    {status === 'rejected' && (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                        Rejected
                      </span>
                    )}
                  </div>

                  {/* Preview of change */}
                  <div className="text-sm">
                    {change.type === 'deletion' && (
                      <div className="bg-red-100 border border-red-200 rounded p-2 mb-2">
                        <span className="text-red-800 line-through">"{change.originalText}"</span>
                      </div>
                    )}
                    {change.type === 'addition' && (
                      <div className="bg-green-100 border border-green-200 rounded p-2 mb-2">
                        <span className="text-green-800">+ "{change.newText}"</span>
                      </div>
                    )}
                    {change.type === 'modification' && (
                      <div className="space-y-1">
                        <div className="bg-red-100 border border-red-200 rounded p-2">
                          <span className="text-red-800 line-through">- "{change.originalText}"</span>
                        </div>
                        <div className="bg-green-100 border border-green-200 rounded p-2">
                          <span className="text-green-800">+ "{change.newText}"</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                      <div>Position: {change.startIndex}-{change.endIndex}</div>
                      <div>Change ID: {change.id}</div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {status === 'pending' && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRejectChange(change.id)}
                      className="h-7 w-7 p-0 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAcceptChange(change.id)}
                      className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {changes.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Edit3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No changes detected</p>
        </div>
      )}
    </div>
  )
} 