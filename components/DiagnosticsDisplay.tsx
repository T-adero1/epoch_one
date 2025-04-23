'use client';

import { useState } from 'react';

type DiagnosticsProps = {
  error: any;
  diagnostics?: {
    time: string;
    environment: string;
    vercel: boolean;
    steps: string[];
    errors: string[];
    [key: string]: any;
  };
};

export default function DiagnosticsDisplay({ error, diagnostics }: DiagnosticsProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (!error && !diagnostics) {
    return null;
  }
  
  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 mt-4 rounded shadow">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-red-800">
              {error ? `Error: ${error.message || 'Unknown error'}` : 'API Diagnostics Available'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-red-800 font-medium hover:underline"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      {expanded && diagnostics && (
        <div className="mt-3 text-sm space-y-2 bg-white p-3 rounded">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="font-medium">Time:</p>
              <p>{diagnostics.time}</p>
            </div>
            <div>
              <p className="font-medium">Environment:</p>
              <p>{diagnostics.environment} (Vercel: {diagnostics.vercel ? 'Yes' : 'No'})</p>
            </div>
          </div>
          
          {diagnostics.envVars && (
            <div>
              <p className="font-medium">Environment Variables:</p>
              <ul className="list-disc pl-5">
                {Object.entries(diagnostics.envVars).map(([key, value]) => (
                  <li key={key}>{key}: {value ? 'Set' : 'Not Set'}</li>
                ))}
              </ul>
            </div>
          )}
          
          {diagnostics.errors && diagnostics.errors.length > 0 && (
            <div>
              <p className="font-medium">Errors:</p>
              <ul className="list-disc pl-5 text-red-600">
                {diagnostics.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          {diagnostics.steps && diagnostics.steps.length > 0 && (
            <div>
              <p className="font-medium">Steps:</p>
              <ol className="list-decimal pl-5">
                {diagnostics.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          
          {diagnostics.errorDetails && (
            <div>
              <p className="font-medium">Error Details:</p>
              <pre className="bg-gray-100 p-2 rounded overflow-auto text-xs">
                {JSON.stringify(diagnostics.errorDetails, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 