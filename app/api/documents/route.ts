import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

// Simple in-memory mock data for documents
export const MOCK_DOCUMENTS = [
  {
    id: 'doc_001',
    title: 'Business Proposal',
    content: 'This is a sample business proposal document.',
    status: 'active',
    createdAt: '2023-10-15T08:30:00Z',
    updatedAt: '2023-10-16T14:45:00Z',
  },
  {
    id: 'doc_002',
    title: 'Meeting Minutes',
    content: 'Minutes from the quarterly board meeting.',
    status: 'draft',
    createdAt: '2023-10-10T10:00:00Z',
    updatedAt: '2023-10-10T11:30:00Z',
  },
  {
    id: 'doc_003',
    title: 'Employee Handbook',
    content: 'Company policies and procedures for all employees.',
    status: 'active',
    createdAt: '2023-09-05T09:15:00Z',
    updatedAt: '2023-09-20T16:20:00Z',
  },
  {
    id: 'doc_004',
    title: 'Project Timeline',
    content: 'Timeline and milestones for the new product launch.',
    status: 'archived',
    createdAt: '2023-08-12T13:45:00Z',
    updatedAt: '2023-08-30T17:10:00Z',
  },
  {
    id: 'doc_005',
    title: 'Financial Report',
    content: 'Annual financial report for the fiscal year 2023.',
    status: 'active',
    createdAt: '2023-11-01T08:00:00Z',
    updatedAt: '2023-11-02T15:30:00Z',
  }
];

// In-memory storage for new documents
export let documents = [...MOCK_DOCUMENTS];

export async function GET(): Promise<Response> {
  try {
    // Return all documents
    return NextResponse.json({ data: documents }, { status: 200 });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "Failed to fetch documents"
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate required fields
    if (!body.title) {
      return NextResponse.json(
        { 
          error: "Validation error", 
          message: "Document title is required"
        }, 
        { status: 400 }
      );
    }
    
    // Create new document
    const newDocument = {
      id: 'doc_' + nanoid(8),
      title: body.title,
      content: body.content || '',
      status: body.status || 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Add to in-memory storage
    documents.push(newDocument);
    
    return NextResponse.json({ 
      message: "Document created successfully",
      document: newDocument
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating document:', error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "Failed to create document"
      }, 
      { status: 500 }
    );
  }
} 