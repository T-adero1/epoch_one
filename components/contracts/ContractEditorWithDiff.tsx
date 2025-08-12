'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, X, ChevronDown, ChevronRight, Plus, Minus, Edit3, Undo2 } from 'lucide-react'
import { ChangeGroup } from '@/app/utils/textDiff'

interface ContractEditorWithDiffProps {
  content: string;
  changeGroups: ChangeGroup[];
  acceptedGroups: string[];
  rejectedGroups: string[];
  onAcceptGroup: (groupId: string) => void;
  onRejectGroup: (groupId: string) => void;
  onContentChange: (content: string) => void;
  showDiff: boolean;
}

function isBlankLine(line: string): boolean {
  return line.trim() === '';
}

function filterBlankLines(lines: string[]): { filteredLines: string[], hasBlankLines: boolean } {
  const filteredLines = lines.filter(line => !isBlankLine(line));
  const hasBlankLines = filteredLines.length !== lines.length;
  return { filteredLines, hasBlankLines };
}

function isSpacingOnlyChange(group: ChangeGroup): boolean {
  const { filteredLines: filteredOriginal } = filterBlankLines(group.originalLines);
  const { filteredLines: filteredNew } = filterBlankLines(group.newLines);
  
  // If both filtered arrays are empty, it's spacing-only
  return filteredOriginal.length === 0 && filteredNew.length === 0;
}

function getGroupSummary(group: ChangeGroup): string {
  const { filteredLines: filteredOriginal, hasBlankLines: hasOriginalBlanks } = filterBlankLines(group.originalLines);
  const { filteredLines: filteredNew, hasBlankLines: hasNewBlanks } = filterBlankLines(group.newLines);
  
  let summary = '';
  
  switch (group.type) {
    case 'addition':
      const addCount = filteredNew.length;
      if (addCount > 0) {
        summary = `Added ${addCount} line${addCount === 1 ? '' : 's'}`;
        if (hasNewBlanks) summary += ' (+ spacing)';
      } else {
        summary = 'Added spacing';
      }
      break;
    case 'deletion':
      const delCount = filteredOriginal.length;
      if (delCount > 0) {
        summary = `Removed ${delCount} line${delCount === 1 ? '' : 's'}`;
        if (hasOriginalBlanks) summary += ' (+ spacing)';
      } else {
        summary = 'Removed spacing';
      }
      break;
    case 'modification':
      const modOrigCount = filteredOriginal.length;
      const modNewCount = filteredNew.length;
      if (modOrigCount > 0 || modNewCount > 0) {
        summary = `Modified ${Math.max(modOrigCount, modNewCount)} line${Math.max(modOrigCount, modNewCount) === 1 ? '' : 's'}`;
        if (hasOriginalBlanks || hasNewBlanks) summary += ' (+ spacing)';
      } else {
        summary = 'Modified spacing';
      }
      break;
    default:
      summary = group.description;
  }
  
  return summary;
}

export default function ContractEditorWithDiff({
  content,
  changeGroups,
  acceptedGroups,
  rejectedGroups,
  onAcceptGroup,
  onRejectGroup,
  onContentChange,
  showDiff
}: ContractEditorWithDiffProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  const [actionHistory, setActionHistory] = useState<{ groupId: string; action: 'accept' | 'reject' }[]>([]);

  const handleAcceptGroup = (groupId: string) => {
    setActionHistory(prev => [...prev, { groupId, action: 'accept' }]);
    onAcceptGroup(groupId);
  };

  const handleRejectGroup = (groupId: string) => {
    setActionHistory(prev => [...prev, { groupId, action: 'reject' }]);
    onRejectGroup(groupId);
  };

  const handleGroupClick = (groupId: string, e: React.MouseEvent) => {
    e.preventDefault();
    handleAcceptGroup(groupId);
  };

  const handleGroupRightClick = (groupId: string, e: React.MouseEvent) => {
    e.preventDefault();
    handleRejectGroup(groupId);
  };

  const handleUndoLastAction = () => {
    if (actionHistory.length === 0) return;
    
    const lastAction = actionHistory[actionHistory.length - 1];
    setActionHistory(prev => prev.slice(0, -1));
    
    // Reverse the last action
    if (lastAction.action === 'accept') {
      onRejectGroup(lastAction.groupId);
    } else {
      onAcceptGroup(lastAction.groupId);
    }
  };

    const getGroupStatus = (groupId: string) => {
      if (acceptedGroups.includes(groupId)) return 'accepted';
      if (rejectedGroups.includes(groupId)) return 'rejected';
      return 'pending';
    };

  const getGroupIcon = (type: string) => {
    switch (type) {
      case 'addition': return <Plus className="h-4 w-4 text-green-600" />;
      case 'deletion': return <Minus className="h-4 w-4 text-red-600" />;
      case 'modification': return <Edit3 className="h-4 w-4 text-blue-600" />;
      default: return null;
    }
  };

  const getGroupStyle = (group: ChangeGroup) => {
    const status = getGroupStatus(group.id);
    const isSpacingOnly = isSpacingOnlyChange(group);
    let baseStyle = 'border-l-4 transition-all duration-200 ';
    
    // Spacing-only changes get a more subtle style
    if (isSpacingOnly) {
      baseStyle += 'bg-gray-50 border-gray-300 opacity-75 ';
      return baseStyle;
    }
    
    switch (group.type) {
      case 'addition':
        if (status === 'accepted') {
          baseStyle += 'bg-green-100 border-green-500 ';
        } else if (status === 'rejected') {
          baseStyle += 'bg-gray-100 border-gray-400 opacity-50 ';
        } else {
          baseStyle += 'bg-green-50 border-green-300 hover:bg-green-100 ';
        }
        break;
      case 'deletion':
        if (status === 'accepted') {
          baseStyle += 'bg-red-100 border-red-500 opacity-50 ';
        } else if (status === 'rejected') {
          baseStyle += 'bg-gray-100 border-gray-400 opacity-50 ';
        } else {
          baseStyle += 'bg-red-50 border-red-300 hover:bg-red-100 ';
        }
        break;
      case 'modification':
        if (status === 'accepted') {
          baseStyle += 'bg-blue-100 border-blue-500 ';
        } else if (status === 'rejected') {
          baseStyle += 'bg-gray-100 border-gray-400 opacity-50 ';
        } else {
          baseStyle += 'bg-blue-50 border-blue-300 hover:bg-blue-100 ';
        }
        break;
      default:
        baseStyle += 'hover:bg-gray-50 border-transparent ';
    }
    
    return baseStyle;
  };

  const renderLinesWithoutBlanks = (lines: string[], prefix: string = '', className: string = '') => {
    const { filteredLines, hasBlankLines } = filterBlankLines(lines);
    
    if (filteredLines.length === 0 && hasBlankLines) {
      return (
        <div className={`text-xs text-gray-500 italic ${className}`}>
          {prefix}(Only spacing changes)
        </div>
      );
    }
    
    return (
      <div className="space-y-1">
        {filteredLines.map((line, lineIndex) => (
          <div key={lineIndex} className={`font-mono text-sm ${className}`}>
            {prefix}{line}
          </div>
        ))}
        {hasBlankLines && filteredLines.length > 0 && (
          <div className="text-xs text-gray-500 italic">
            + spacing changes
          </div>
        )}
      </div>
    );
  };

    const renderGroup = (group: ChangeGroup) => {
    const status = getGroupStatus(group.id);
    const isSpacingOnly = isSpacingOnlyChange(group);
    const showControls = group.type !== 'unchanged' && status === 'pending' && !isSpacingOnly;
    const isExpanded = expandedGroups.includes(group.id);
    const isFocused = focusedGroup === group.id;
    
    if (group.type === 'unchanged') {
      // Render unchanged lines normally
      return (
        <div key={group.id} className="group">
          {group.originalLines.map((line, lineIndex) => (
            <div key={`${group.id}-${lineIndex}`} className="flex items-start hover:bg-gray-50">
              <div className="flex-shrink-0 w-12 text-xs text-gray-400 text-right pr-2 py-1 select-none">
                {group.startLineNumber + lineIndex}
              </div>
              <div className="flex-1 py-1 pr-2 font-mono text-sm min-h-[1.5rem]">
                {line || '\u00A0'}
              </div>
            </div>
          ))}
        </div>
      );
    }

    const groupSummary = getGroupSummary(group);

    return (
        <div
          key={group.id}
          className={`group ${getGroupStyle(group)} mb-1`}
          onClick={(e) => showControls && handleGroupClick(group.id, e)}
          onContextMenu={(e) => showControls && handleGroupRightClick(group.id, e)}
          onTouchStart={(e) => {
          if (!showControls) return;
          // Handle long press for mobile reject
          const touchTimer = setTimeout(() => {
            handleRejectGroup(group.id);
          }, 500);
          
          const cleanup = () => {
            clearTimeout(touchTimer);
            (e.target as HTMLElement).removeEventListener('touchend', cleanup);
            (e.target as HTMLElement).removeEventListener('touchcancel', cleanup);
          };
          
          (e.target as HTMLElement).addEventListener('touchend', cleanup);
          (e.target as HTMLElement).addEventListener('touchcancel', cleanup);
        }}
        onFocus={() => setFocusedGroup(group.id)}
        tabIndex={showControls ? 0 : -1}
      >
        {/* Group header - Mobile Optimized */}
        <div className="flex items-center justify-between p-2 sm:p-3 bg-white bg-opacity-50">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Selection checkbox for multi-select */}
            {showControls && (
              <div className="w-4 h-4 bg-purple-500 rounded border-2 border-purple-500 flex items-center justify-center flex-shrink-0">
                <Check className="h-2 w-2 text-white" />
              </div>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedGroups(prev => 
                  prev.includes(group.id) 
                    ? prev.filter(id => id !== group.id)
                    : [...prev, group.id]
                );
              }}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 min-w-0 flex-1"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
              )}
              {getGroupIcon(group.type)}
              <span className="truncate">{groupSummary}</span>
            </button>
            
            {/* Status badges - Mobile Responsive */}
            <div className="flex gap-1 flex-shrink-0">
              {status === 'accepted' && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  <span className="hidden sm:inline">Accepted</span>
                </span>
              )}
              {status === 'rejected' && (
                <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded flex items-center gap-1">
                  <X className="h-3 w-3" />
                  <span className="hidden sm:inline">Rejected</span>
                </span>
              )}
              {isSpacingOnly && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  <span className="hidden sm:inline">Auto-applied</span>
                  <span className="sm:hidden">Auto</span>
                </span>
              )}
            </div>
          </div>
          
          {/* Quick action buttons - Always visible on mobile for pending items */}
          {showControls && status === 'pending' && (
            <div className={`flex gap-1 ${isFocused ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'} transition-opacity duration-200`}>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRejectGroup(group.id);
                }}
                className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-red-600 border-red-200 hover:bg-red-50 touch-target"
                title="Reject"
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAcceptGroup(group.id);
                }}
                className="h-8 w-8 sm:h-7 sm:w-7 p-0 bg-green-600 hover:bg-green-700 text-white touch-target"
                title="Accept"
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Group content */}
        {isExpanded && (
          <div className="border-t border-gray-200 bg-white bg-opacity-30">
            {group.type === 'deletion' && (
              <div className="p-3">
                <div className="text-xs text-red-600 font-medium mb-2">Removed:</div>
                {renderLinesWithoutBlanks(group.originalLines, '- ', 'text-red-800 line-through')}
              </div>
            )}
            
            {group.type === 'addition' && (
              <div className="p-3">
                <div className="text-xs text-green-600 font-medium mb-2">Added:</div>
                {renderLinesWithoutBlanks(group.newLines, '+ ', 'text-green-800')}
              </div>
            )}
            
            {group.type === 'modification' && (
              <div className="p-3 space-y-3">
                {group.originalLines.some(line => !isBlankLine(line)) && (
                  <div>
                    <div className="text-xs text-red-600 font-medium mb-2">Removed:</div>
                    {renderLinesWithoutBlanks(group.originalLines, '- ', 'text-red-800 line-through')}
                  </div>
                )}
                {group.newLines.some(line => !isBlankLine(line)) && (
                  <div>
                    <div className="text-xs text-green-600 font-medium mb-2">Added:</div>
                    {renderLinesWithoutBlanks(group.newLines, '+ ', 'text-green-800')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Collapsed preview with mobile-friendly hints */}
        {!isExpanded && (group.type as string) !== 'unchanged' && ( // ✅ FIX: Cast to string to avoid type comparison error
          <div className="p-2 bg-white bg-opacity-30 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600 flex-1 min-w-0">
                {group.type === 'addition' && (
                  <div>
                    {renderLinesWithoutBlanks(group.newLines.slice(0, 1), '+ ', 'truncate')}
                    {group.newLines.length > 1 && <span className="text-gray-500"> ...</span>}
                  </div>
                )}
                {group.type === 'deletion' && (
                  <div>
                    {renderLinesWithoutBlanks(group.originalLines.slice(0, 1), '- ', 'truncate line-through')}
                    {group.originalLines.length > 1 && <span className="text-gray-500"> ...</span>}
                  </div>
                )}
                {group.type === 'modification' && (
                  <div>
                    {renderLinesWithoutBlanks(
                      (group.newLines.length > 0 ? group.newLines : group.originalLines).slice(0, 1), 
                      '~ ', 
                      'truncate'
                    )}
                    {(group.originalLines.length > 1 || group.newLines.length > 1) && 
                      <span className="text-gray-500"> ...</span>
                    }
                  </div>
                )}
              </div>
              
              {showControls && status === 'pending' && (
                <div className="text-xs text-gray-400 ml-2 flex-shrink-0">
                  <span className="hidden sm:inline">Click to accept • Right-click to reject</span>
                  <span className="sm:hidden">Tap to accept</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!showDiff) {
    return (
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        className="h-full w-full resize-none p-6 font-mono text-sm border-none focus:outline-none"
        placeholder="Write your contract content here..."
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement; // ✅ FIX: Cast to HTMLTextAreaElement
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const newContent = content.substring(0, start) + '\t' + content.substring(end);
            onContentChange(newContent);
            
            // Restore cursor position after the inserted tab
            setTimeout(() => {
              target.selectionStart = target.selectionEnd = start + 1;
            }, 0);
          }
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="min-h-full">
        {changeGroups.map((group, index) => renderGroup(group, index))}
      </div>

      {/* Keyboard shortcuts help - Mobile Optimized */}
      <div className="sticky top-0 bg-blue-50 border-b border-blue-200 px-3 sm:px-4 py-2 text-xs text-blue-700 z-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-center sm:text-left">
            💡 <strong className="hidden sm:inline">Quick actions:</strong>
            <span className="sm:hidden"><strong>Tap</strong> to accept • <strong>Long press</strong> to reject</span>
            <span className="hidden sm:inline">Click to accept • Right-click to reject • ↑↓ to navigate • Enter to accept • Delete to reject</span>
          </span>
          {actionHistory.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleUndoLastAction}
              className="h-6 text-xs border-blue-300 hover:bg-blue-100 w-full sm:w-auto"
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
} 