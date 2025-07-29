import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/app/utils/s3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const contractId = formData.get('contractId') as string;
    const replaceExisting = formData.get('replaceExisting') === 'true';
    
    // New encryption-related fields
    const encryptedBytes = formData.get('encryptedBytes') as string; // base64 encoded
    const allowlistId = formData.get('allowlistId') as string;
    const documentId = formData.get('documentId') as string;
    const capId = formData.get('capId') as string;
    const isEncrypted = formData.get('isEncrypted') === 'true';
    
    // Get authorized wallet addresses
    const authorizedUsersStr = formData.get('authorizedUsers') as string;
    const authorizedUsers = authorizedUsersStr ? JSON.parse(authorizedUsersStr) : [];

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    let uploadResult;

    if (replaceExisting) {
      console.log('[API] Replacing existing PDF file', {
        contractId,
        isEncrypted
      });
    } else {
      console.log('[API] Uploading new PDF file', {
        contractId,
        isEncrypted  
      });
    }
    
    if (isEncrypted) {
      // Handle encrypted PDF upload
      if (!encryptedBytes || !allowlistId || !documentId) {
        return NextResponse.json(
          { error: 'Missing encryption data' },
          { status: 400 }
        );
      }

      // Convert base64 encrypted bytes back to binary
      const encryptedBuffer = Buffer.from(encryptedBytes, 'base64');
      
      // Create a File-like object for the encrypted data
      const encryptedFile = new File([encryptedBuffer], `${contractId}.encrypted.pdf`, {
        type: 'application/octet-stream'
      });

      // Upload encrypted file to S3
      uploadResult = await uploadToS3(encryptedFile, contractId);

      const updatedContract = await prisma.contract.update({
        where: { id: contractId },
        data: {
          s3FileKey: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          s3FileName: uploadResult.fileName,
          s3FileSize: uploadResult.fileSize,
          s3ContentType: uploadResult.contentType,
          s3UploadedAt: uploadResult.uploadedAt,
          sealAllowlistId: allowlistId,
          sealDocumentId: documentId,
          sealCapId: capId,
          isEncrypted: true,
          originalFileName: file?.name || `${contractId}.pdf`,
          authorizedUsers: authorizedUsers,
        },
        include: {
          signatures: true
        },
      });

      return NextResponse.json({
        success: true,
        contract: updatedContract,
        uploadInfo: uploadResult,
        encryption: {
          allowlistId,
          documentId,
          capId,
          authorizedUsers
        }
      });
      
    } else {
      // Handle regular PDF upload
      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file type
      if (file.type !== 'application/pdf') {
        return NextResponse.json(
          { error: 'Only PDF files are allowed' },
          { status: 400 }
        );
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        return NextResponse.json(
          { error: 'File size must be less than 10MB' },
          { status: 400 }
        );
      }

      // Upload to S3
      uploadResult = await uploadToS3(file, contractId);

      // Update contract in database
      const updatedContract = await prisma.contract.update({
        where: { id: contractId },
        data: {
          s3FileKey: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          s3FileName: uploadResult.fileName,
          s3FileSize: uploadResult.fileSize,
          s3ContentType: uploadResult.contentType,
          s3UploadedAt: uploadResult.uploadedAt,
          isEncrypted: false,
        },
        include: {
          signatures: true // Only include signatures, no user data
        },
      });

      return NextResponse.json({
        success: true,
        contract: updatedContract,
        uploadInfo: uploadResult,
      });
    }

  } catch (error) {
    console.error('Error uploading PDF:', error);
    return NextResponse.json(
      { error: 'Failed to upload PDF' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}