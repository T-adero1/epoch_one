import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/app/utils/s3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const contractId = formData.get('contractId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
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
    const uploadResult = await uploadToS3(file, contractId);

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
      },
      include: {
        owner: true,
        signatures: {
          include: {
            user: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      uploadInfo: uploadResult,
    });

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