import { NextRequest, NextResponse } from 'next/server';

// Reference to the documents array from the parent route
// In a real app, you'd use a database or a proper state management solution
// This is just for demonstration purposes
import { MOCK_DOCUMENTS } from '../route';

// Making documents accessible from this file
let documents = [...MOCK_DOCUMENTS];

// Get documents from parent route if it has been updated
try {
  // This is a hacky way to share state between route files
  // In a real app, you'd use a database
  const parentModule = require('../route');
  if (parentModule.documents) {
    documents = parentModule.documents;
  }
} catch (error) {
  console.error('Error accessing documents from parent route:', error);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  try {
    const { id } = params;
    
    // Find document by ID
    const document = documents.find(doc => doc.id === id);
    
    if (!document) {
      return NextResponse.json(
        { 
          error: "Not found", 
          message: `Document with ID ${id} not found`
        }, 
        { status: 404 }
      );
    }
    
    return NextResponse.json({ document }, { status: 200 });
    
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "Failed to fetch document"
      }, 
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  try {
    const { id } = params;
    const body = await request.json();
    
    // Find document index
    const index = documents.findIndex(doc => doc.id === id);
    
    if (index === -1) {
      return NextResponse.json(
        { 
          error: "Not found", 
          message: `Document with ID ${id} not found`
        }, 
        { status: 404 }
      );
    }
    
    // Update document
    const updatedDocument = {
      ...documents[index],
      title: body.title || documents[index].title,
      content: body.content || documents[index].content,
      status: body.status || documents[index].status,
      updatedAt: new Date().toISOString()
    };
    
    // Replace in array
    documents[index] = updatedDocument;
    
    // Update parent module's documents array
    try {
      const parentModule = require('../route');
      parentModule.documents = documents;
    } catch (error) {
      console.error('Error updating documents in parent route:', error);
    }
    
    return NextResponse.json({ 
      message: "Document updated successfully",
      document: updatedDocument
    }, { status: 200 });
    
  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "Failed to update document"
      }, 
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  try {
    const { id } = params;
    
    // Find document index
    const index = documents.findIndex(doc => doc.id === id);
    
    if (index === -1) {
      return NextResponse.json(
        { 
          error: "Not found", 
          message: `Document with ID ${id} not found`
        }, 
        { status: 404 }
      );
    }
    
    // Remove from array
    const deletedDocument = documents[index];
    documents.splice(index, 1);
    
    // Update parent module's documents array
    try {
      const parentModule = require('../route');
      parentModule.documents = documents;
    } catch (error) {
      console.error('Error updating documents in parent route:', error);
    }
    
    return NextResponse.json({ 
      message: "Document deleted successfully",
      document: deletedDocument
    }, { status: 200 });
    
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "Failed to delete document"
      }, 
      { status: 500 }
    );
  }
}