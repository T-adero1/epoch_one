'use client';
import { useState, useEffect } from 'react';

export default function DraftEditor() {
  const [draft, setDraft] = useState('');
  const [isSaved, setIsSaved] = useState(true);

  // Load draft from localStorage on component mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('documentDraft');
    if (savedDraft) {
      setDraft(savedDraft);
    }
  }, []);

  // Save draft to localStorage when it changes
  useEffect(() => {
    if (draft) {
      const timeoutId = setTimeout(() => {
        localStorage.setItem('documentDraft', draft);
        setIsSaved(true);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [draft]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    setIsSaved(false);
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Document Draft</h3>
        <div className="text-sm text-gray-500">
          {isSaved ? 'All changes saved locally' : 'Saving...'}
        </div>
      </div>
      <textarea
        value={draft}
        onChange={handleChange}
        className="w-full h-64 p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Start writing your document here..."
      />
      <div className="mt-4 flex justify-between">
        <button 
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          onClick={() => {
            if (window.confirm('Are you sure you want to clear the draft?')) {
              setDraft('');
              localStorage.removeItem('documentDraft');
            }
          }}
        >
          Clear Draft
        </button>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Save Document
        </button>
      </div>
    </div>
  );
} 