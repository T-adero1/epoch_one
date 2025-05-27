'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, X, ChevronDown, ChevronRight, Plus, Minus, Edit3 } from 'lucide-react'
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

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
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

  const renderGroup = (group: ChangeGroup, index: number) => {
    const status = getGroupStatus(group.id);
    const isSpacingOnly = isSpacingOnlyChange(group);
    const showControls = group.type !== 'unchanged' && status === 'pending' && !isSpacingOnly;
    const isExpanded = expandedGroups.includes(group.id);
    
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
      <div key={group.id} className={`group ${getGroupStyle(group)} mb-1`}>
        {/* Group header */}
        <div className="flex items-center justify-between p-2 bg-white bg-opacity-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleExpanded(group.id)}
              className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {getGroupIcon(group.type)}
              {groupSummary}
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
            {isSpacingOnly && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                Auto-applied
              </span>
            )}
          </div>
          
          {showControls && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRejectGroup(group.id)}
                className="h-6 w-6 p-0 text-red-600 border-red-200 hover:bg-red-50"
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                onClick={() => onAcceptGroup(group.id)}
                className="h-6 w-6 p-0 bg-green-600 hover:bg-green-700 text-white"
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
        
        {/* Collapsed preview */}
        {!isExpanded && group.type !== 'unchanged' && (
          <div className="p-2 bg-white bg-opacity-30 border-t border-gray-200">
            <div className="text-xs text-gray-600">
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
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="min-h-full">
        {changeGroups.map((group, index) => renderGroup(group, index))}
      </div>
    </div>
  );
} 