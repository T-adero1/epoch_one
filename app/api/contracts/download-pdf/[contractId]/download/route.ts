import { NextRequest, NextResponse } from 'next/server';
import { getS3DownloadUrl } from '@/app/utils/s3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const { contractId } = await params;

    // Find contract with S3 file info
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        s3FileKey: true,
        s3FileName: true,
        s3ContentType: true,
        ownerId: true,
      },
    });

    if (!contract || !contract.s3FileKey) {
      return NextResponse.json(
        { error: 'Contract or file not found' },
        { status: 404 }
      );
    }

    // Generate signed URL for downloading (attachment)
    const downloadUrl = await getS3DownloadUrl(contract.s3FileKey, contract.s3FileName);

    return NextResponse.json({
      downloadUrl,
      fileName: contract.s3FileName,
      contentType: contract.s3ContentType,
    });

  } catch (error) {
    console.error('Error generating download URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 