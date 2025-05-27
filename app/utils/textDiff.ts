export interface ChangeGroup {
  type: 'addition' | 'deletion' | 'modification' | 'unchanged';
  originalLines: string[];
  newLines: string[];
  startLineNumber: number;
  endLineNumber: number;
  id: string;
  description: string;
}

export interface GroupedDiffResult {
  changeGroups: ChangeGroup[];
  hasChanges: boolean;
}

function isBlankLine(line: string): boolean {
  return line.trim() === '';
}

function generateChangeDescription(group: ChangeGroup): string {
  const lineCount = Math.max(group.originalLines.length, group.newLines.length);
  const lineText = lineCount === 1 ? 'line' : 'lines';
  
  switch (group.type) {
    case 'addition':
      return `Added ${lineCount} ${lineText}`;
    case 'deletion':
      return `Removed ${lineCount} ${lineText}`;
    case 'modification':
      return `Modified ${lineCount} ${lineText}`;
    default:
      return 'No changes';
  }
}

export function detectGroupedChanges(original: string, modified: string): GroupedDiffResult {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  // First, get basic line-by-line diff
  const basicDiff = getBasicLineDiff(originalLines, modifiedLines);
  
  // Then group consecutive changes
  const changeGroups = groupConsecutiveChanges(basicDiff);
  
  return {
    changeGroups,
    hasChanges: changeGroups.some(group => group.type !== 'unchanged')
  };
}

interface BasicLineChange {
  type: 'addition' | 'deletion' | 'modification' | 'unchanged';
  originalLine: string;
  newLine: string;
  lineNumber: number;
}

function getBasicLineDiff(originalLines: string[], modifiedLines: string[]): BasicLineChange[] {
  const changes: BasicLineChange[] = [];
  const dp: number[][] = [];
  
  // Create LCS (Longest Common Subsequence) table
  for (let i = 0; i <= originalLines.length; i++) {
    dp[i] = new Array(modifiedLines.length + 1).fill(0);
  }
  
  for (let i = 1; i <= originalLines.length; i++) {
    for (let j = 1; j <= modifiedLines.length; j++) {
      if (originalLines[i - 1] === modifiedLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find the actual changes
  let i = originalLines.length;
  let j = modifiedLines.length;
  let lineNumber = Math.max(originalLines.length, modifiedLines.length);
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalLines[i - 1] === modifiedLines[j - 1]) {
      // Lines are the same
      changes.unshift({
        type: 'unchanged',
        originalLine: originalLines[i - 1],
        newLine: modifiedLines[j - 1],
        lineNumber: lineNumber--
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Addition
      changes.unshift({
        type: 'addition',
        originalLine: '',
        newLine: modifiedLines[j - 1],
        lineNumber: lineNumber--
      });
      j--;
    } else if (i > 0) {
      // Deletion
      changes.unshift({
        type: 'deletion',
        originalLine: originalLines[i - 1],
        newLine: '',
        lineNumber: lineNumber--
      });
      i--;
    }
  }
  
  return changes;
}

function groupConsecutiveChanges(basicChanges: BasicLineChange[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  let currentGroup: BasicLineChange[] = [];
  let currentType: string | null = null;
  
  for (let i = 0; i < basicChanges.length; i++) {
    const change = basicChanges[i];
    
    if (change.type === 'unchanged') {
      // Finalize current group if it exists
      if (currentGroup.length > 0) {
        groups.push(createChangeGroup(currentGroup, currentType!));
        currentGroup = [];
        currentType = null;
      }
      
      // Add unchanged line as its own group
      groups.push(createChangeGroup([change], 'unchanged'));
    } else {
      // Check if we should continue the current group or start a new one
      const shouldContinueGroup = shouldGroupWithPrevious(change, currentType, currentGroup);
      
      if (shouldContinueGroup && currentGroup.length > 0) {
        currentGroup.push(change);
      } else {
        // Finalize previous group
        if (currentGroup.length > 0) {
          groups.push(createChangeGroup(currentGroup, currentType!));
        }
        
        // Start new group
        currentGroup = [change];
        currentType = change.type;
      }
    }
  }
  
  // Finalize last group
  if (currentGroup.length > 0) {
    groups.push(createChangeGroup(currentGroup, currentType!));
  }
  
  return groups;
}

function shouldGroupWithPrevious(
  change: BasicLineChange, 
  currentType: string | null, 
  currentGroup: BasicLineChange[]
): boolean {
  if (!currentType || currentGroup.length === 0) {
    return false;
  }
  
  // Group consecutive changes of the same type
  if (change.type === currentType) {
    return true;
  }
  
  // Group mixed changes if they're close together and involve blank lines
  const lastChange = currentGroup[currentGroup.length - 1];
  const isCurrentBlank = isBlankLine(change.originalLine) || isBlankLine(change.newLine);
  const isLastBlank = isBlankLine(lastChange.originalLine) || isBlankLine(lastChange.newLine);
  
  if (isCurrentBlank || isLastBlank) {
    return true;
  }
  
  // Group modifications with adjacent additions/deletions
  if (
    (currentType === 'modification' && (change.type === 'addition' || change.type === 'deletion')) ||
    ((currentType === 'addition' || currentType === 'deletion') && change.type === 'modification')
  ) {
    return true;
  }
  
  return false;
}

function createChangeGroup(changes: BasicLineChange[], type: string): ChangeGroup {
  const originalLines = changes.map(c => c.originalLine).filter(line => line !== '');
  const newLines = changes.map(c => c.newLine).filter(line => line !== '');
  const startLineNumber = changes[0].lineNumber;
  const endLineNumber = changes[changes.length - 1].lineNumber;
  
  // Determine the actual group type based on the changes
  let groupType: 'addition' | 'deletion' | 'modification' | 'unchanged';
  
  if (type === 'unchanged') {
    groupType = 'unchanged';
  } else if (originalLines.length === 0) {
    groupType = 'addition';
  } else if (newLines.length === 0) {
    groupType = 'deletion';
  } else {
    groupType = 'modification';
  }
  
  const group: ChangeGroup = {
    type: groupType,
    originalLines: changes.map(c => c.originalLine),
    newLines: changes.map(c => c.newLine),
    startLineNumber,
    endLineNumber,
    id: `group-${startLineNumber}-${endLineNumber}-${Date.now()}`,
    description: ''
  };
  
  group.description = generateChangeDescription(group);
  
  return group;
}

export function applyGroupedChanges(
  originalText: string, 
  changeGroups: ChangeGroup[], 
  acceptedGroupIds: string[]
): string {
  const result: string[] = [];
  
  for (const group of changeGroups) {
    if (group.type === 'unchanged') {
      result.push(...group.originalLines);
    } else if (acceptedGroupIds.includes(group.id)) {
      // Apply accepted changes
      switch (group.type) {
        case 'addition':
          result.push(...group.newLines);
          break;
        case 'modification':
          result.push(...group.newLines);
          break;
        case 'deletion':
          // Don't add anything (lines are deleted)
          break;
      }
    } else {
      // Keep original for rejected/pending changes
      if (group.type !== 'addition') {
        result.push(...group.originalLines);
      }
    }
  }
  
  return result.join('\n');
}

// Legacy exports for backward compatibility
export interface LineChange {
  type: 'addition' | 'deletion' | 'modification' | 'unchanged';
  originalLine: string;
  newLine: string;
  lineNumber: number;
  id: string;
}

export interface LineDiffResult {
  changes: LineChange[];
  hasChanges: boolean;
}

export function detectLineChanges(original: string, modified: string): LineDiffResult {
  const groupedResult = detectGroupedChanges(original, modified);
  const changes: LineChange[] = [];
  
  // Convert grouped changes back to individual line changes for backward compatibility
  for (const group of groupedResult.changeGroups) {
    const maxLines = Math.max(group.originalLines.length, group.newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      changes.push({
        type: group.type,
        originalLine: group.originalLines[i] || '',
        newLine: group.newLines[i] || '',
        lineNumber: group.startLineNumber + i,
        id: `${group.id}-line-${i}`
      });
    }
  }
  
  return {
    changes,
    hasChanges: groupedResult.hasChanges
  };
}

export function applyLineChanges(originalText: string, changes: LineChange[], acceptedChangeIds: string[]): string {
  // Group the line changes back into groups and apply
  const groupIds = new Set<string>();
  const acceptedGroupIds: string[] = [];
  
  for (const changeId of acceptedChangeIds) {
    const groupId = changeId.split('-line-')[0];
    if (!groupIds.has(groupId)) {
      groupIds.add(groupId);
      acceptedGroupIds.push(groupId);
    }
  }
  
  // This is a simplified approach - in practice, you'd want to reconstruct the groups properly
  const result: string[] = [];
  
  for (const change of changes) {
    const groupId = change.id.split('-line-')[0];
    
    if (change.type === 'unchanged') {
      result.push(change.originalLine);
    } else if (acceptedGroupIds.includes(groupId)) {
      switch (change.type) {
        case 'addition':
          if (change.newLine) result.push(change.newLine);
          break;
        case 'modification':
          if (change.newLine) result.push(change.newLine);
          break;
        case 'deletion':
          // Don't add anything
          break;
      }
    } else {
      if (change.type !== 'addition' && change.originalLine) {
        result.push(change.originalLine);
      }
    }
  }
  
  return result.join('\n');
} 