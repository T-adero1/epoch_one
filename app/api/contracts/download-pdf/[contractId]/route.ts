import { PrismaClient } from '@prisma/client';
import { downloadFromS3 } from '@/app/utils/s3';

const prisma = new PrismaClient();

export async function GET(request: Request, { params }: { params: { contractId: string } }) {
  console.log('[DOWNLOAD_API] 🔍 Download request started:', {
    contractId: params.contractId,
    timestamp: new Date().toISOString(),
    url: request.url
  });

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: params.contractId }
    });
    
    console.log('[DOWNLOAD_API] 📋 Contract data from database:', {
      contractId: params.contractId,
      s3FileKey: contract?.s3FileKey,
      s3FileName: contract?.s3FileName,
      foundInDB: !!contract
    });

    if (!contract?.s3FileKey) {
      return new Response('Contract file not found', { status: 404 });
    }

    console.log('[DOWNLOAD_API] 📡 Attempting S3 download:', {
      contractId: params.contractId,
      s3Key: contract.s3FileKey,
    });

    // ✅ ADD: Actually download and return the file
    const buffer = await downloadFromS3(contract.s3FileKey);
    
    console.log('[DOWNLOAD_API] Downloaded successfully, size:', buffer.length);
    
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Content-Length': buffer.length.toString()
      }
    });
    
  } catch (error) {
    console.error('[DOWNLOAD_API] ❌ Error:', error);
    return new Response('Download failed', { status: 500 });
  }
} 