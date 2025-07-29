import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, GetObjectCommand as GetObjectCommandType } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

interface UploadResult {
  key: string;
  bucket: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: Date;
  url?: string;
}

export async function uploadToS3(file: File, contractId: string): Promise<UploadResult> {
  try {
    // Generate unique file key
    const timestamp = Date.now();
    const key = `contracts/${contractId}/${timestamp}-${file.name}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload command
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        contractId,
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    return {
      key,
      bucket: BUCKET_NAME,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      uploadedAt: new Date(),
      url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('No file content received from S3');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error('S3 download error:', error);
    throw new Error(`Failed to download file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deleteFromS3(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getS3ViewUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: 'inline', // View in browser instead of download
    });

    // Generate signed URL that expires in 1 hour (3600 seconds) by default
    const signedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn 
    });

    return signedUrl;
  } catch (error) {
    console.error('S3 signed URL generation error:', error);
    throw new Error(`Failed to generate S3 view URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function getS3Url(key: string): string {
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
} 