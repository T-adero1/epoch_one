import { NextRequest, NextResponse } from 'next/server';
import { getS3ViewUrl, downloadFromS3 } from '@/app/utils/s3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    const { contractId } = await params;
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view'); // 'inline' or 'download'

    // Find contract with S3 file info
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        s3FileKey: true,
        s3FileName: true,
        s3ContentType: true,
        ownerGoogleIdHash: true, // Fixed: was ownerId, now ownerGoogleIdHash
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (!contract.s3FileKey) {
      return NextResponse.json(
        { error: 'No PDF file found for this contract' },
        { status: 404 }
      );
    }

    if (view === 'inline') {
      // Return the PDF file directly for inline viewing
      const fileBuffer = await downloadFromS3(contract.s3FileKey);
      
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contract.s3ContentType || 'application/pdf',
          'Content-Disposition': 'inline', // Display in browser
          'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
        },
      });
    } else {
      // Return signed URL for download (existing behavior)
      const viewUrl = await getS3ViewUrl(contract.s3FileKey);

      return NextResponse.json({
        downloadUrl: viewUrl,
        fileName: contract.s3FileName,
        contentType: contract.s3ContentType,
      });
    }

  } catch (error) {
    console.error('Error handling PDF request:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF request' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 