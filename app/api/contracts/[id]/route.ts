import { NextRequest, NextResponse } from 'next/server';
import { put, del, head } from '@vercel/blob';

// GET function to retrieve a specific contract by ID
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }
    
    // Check if contract exists
    try {
      const blob = await head(`contracts/${id}.json`);
      if (!blob) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      
      // Fetch contract data
      const response = await fetch(blob.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch contract: ${response.statusText}`);
      }
      
      const contract = await response.json();
      return NextResponse.json(contract);
    } catch (error) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving contract:`, error);
    return NextResponse.json(
      { error: 'Failed to retrieve contract' },
      { status: 500 }
    );
  }
}

// PUT function to update a contract
export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }
    
    // Check if contract exists
    try {
      const blob = await head(`contracts/${id}.json`);
      if (!blob) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      
      // Fetch existing contract
      const response = await fetch(blob.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch contract: ${response.statusText}`);
      }
      
      const existingContract = await response.json();
      
      // Parse request body
      const body = await request.json();
      const { title, content, status } = body;
      
      // Update contract with new data
      const updatedContract = {
        ...existingContract,
        title: title || existingContract.title,
        content: content || existingContract.content,
        status: status || existingContract.status,
        updatedAt: new Date().toISOString()
      };
      
      // Store updated contract in Blob storage
      await put(`contracts/${id}.json`, JSON.stringify(updatedContract), {
        access: 'public',
        contentType: 'application/json',
      });
      
      console.log(`Contract ${id} updated`);
      
      return NextResponse.json({
        success: true,
        message: 'Contract updated successfully',
        contract: updatedContract
      });
    } catch (error) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error updating contract:`, error);
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// DELETE function to remove a contract
export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }
    
    // Check if contract exists
    try {
      const blob = await head(`contracts/${id}.json`);
      if (!blob) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      
      // Delete contract from Blob storage
      await del(`contracts/${id}.json`);
      
      console.log(`Contract ${id} deleted`);
      
      return NextResponse.json({
        success: true,
        message: 'Contract deleted successfully'
      });
    } catch (error) {
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Contract not found' },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting contract:`, error);
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    );
  }
} 