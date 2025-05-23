import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// List of potential working Walrus testnet aggregators
const TESTNET_AGGREGATORS = [
  "https://aggregator.walrus-testnet.walrus.space",
  "https://walrus-agg-test.bucketprotocol.io",
  "https://walrus-agg-testnet.chainode.tech:9002",
  "https://walrus-agg.testnet.obelisk.sh",
  "https://walrus-aggregator-testnet.cetus.zone",
  "https://walrus-aggregator-testnet.haedal.xyz", 
  "https://walrus-aggregator-testnet.n1stake.com",
  "https://walrus-aggregator-testnet.staking4all.org",
  "https://walrus-aggregator-testnet.suisec.tech",
  "https://walrus-aggregator.thcloud.dev",
  "https://walrus-test-aggregator.thepassivetrust.com",
  "https://walrus-testnet-aggregator-1.zkv.xyz",
  "https://walrus-testnet-aggregator.brightlystake.com",
  "https://walrus-testnet-aggregator.chainbase.online",
  "https://walrus-testnet-aggregator.chainflow.io",
  "https://walrus-testnet-aggregator.crouton.digital",
  "https://walrus-testnet-aggregator.dzdaic.com",
  "https://walrus-testnet-aggregator.everstake.one",
  "https://walrus-testnet-aggregator.luckyresearch.org",
  "https://walrus-testnet-aggregator.natsai.xyz",
  "https://walrus-testnet-aggregator.nodeinfra.com",
  "https://walrus-testnet-aggregator.nodes.guru",
  "https://walrus-testnet-aggregator.redundex.com",
  "https://walrus-testnet-aggregator.rpc101.org",
  "https://walrus-testnet-aggregator.rubynodes.io",
  "https://walrus-testnet-aggregator.stakecraft.com",
  "https://walrus-testnet-aggregator.stakeengine.co.uk",
  "https://walrus-testnet-aggregator.stakely.io",
  "https://walrus-testnet-aggregator.stakeme.pro",
  "https://walrus-testnet-aggregator.stakin-nodes.com",
  "https://walrus-testnet-aggregator.stakingdefenseleague.com",
  "https://walrus-testnet-aggregator.starduststaking.com",
  "https://walrus-testnet-aggregator.talentum.id",
  "https://walrus-testnet-aggregator.trusted-point.com",
  "https://walrus-testnet.blockscope.net",
  "https://walrus-testnet.validators.services.kyve.network/aggregate",
  "https://walrus-testnet.veera.com",
  "https://walrus-tn.juicystake.io:9443",
  "https://walrus.testnet.aggregator.stakepool.dev.br",
  "https://walrusagg.testnet.pops.one",
  "http://cs74th801mmedkqu25ng.bdnodes.net:8443",
  "http://walrus-storage.testnet.nelrann.org:9000",
  "http://walrus-testnet.equinoxdao.xyz:9000",
  "http://walrus-testnet.suicore.com:9000"
];

export async function POST(
  request: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    // Fix for NextJS warning - properly await params.contractId
    const contractId = await params.contractId;
    const body = await request.json();
    const { blobId, allowlistId, documentIdHex } = body;

    // Validate request parameters
    if (!blobId) {
      console.error('[API] Missing required parameter: blobId');
      return NextResponse.json(
        { error: 'Missing required parameter: blobId' },
        { status: 400 }
      );
    }

    console.log(`[API] Download request for contract: ${contractId}`);
    console.log(`[API] Blob ID: ${blobId}`);
    
    // Try each aggregator with the standard URL format
    let responseData = null;
    let successUrl = '';

    // Loop through aggregators
    for (const aggregator of TESTNET_AGGREGATORS) {
      // Skip if we already succeeded
      if (responseData) break;
      
      // Use only the standard format: /v1/blobs/{blob_id}
      const url = `${aggregator}/v1/blobs/${blobId}`;
      
      try {
        console.log(`[API] Attempting download from: ${url}`);
        
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 10000, // 10 second timeout
          headers: {
            'Accept': '*/*'
          }
        });

        console.log(`[API] Response from ${url}:`, {
          status: response.status,
          headers: response.headers,
          dataLength: response.data?.byteLength || 0
        });

        if (response.data && response.data.byteLength > 0) {
          console.log(`[API] SUCCESS! Downloaded ${response.data.byteLength} bytes from ${url}`);
          responseData = response.data;
          successUrl = url;
          break;
        } else {
          console.log(`[API] Empty response from ${url}`);
        }
      } catch (error: any) {
        console.log(`[API] Failed with ${url}: ${error.message}`);
        if (error.response) {
          console.log(`[API] Error response from ${url}:`, {
            status: error.response.status,
            headers: error.response.headers,
            data: error.response.data
          });
        }
      }
    }

    // Check if any URL was successful
    if (!responseData) {
      console.error('[API] All aggregators failed for blob download');
      return NextResponse.json(
        { error: 'Failed to download blob from Walrus - tried multiple aggregators' },
        { status: 404 }
      );
    }

    // Save a debug copy for inspection (optional)
    
    
    // Return the encrypted content for client-side decryption
    console.log(`[API] Successfully downloaded ${responseData.byteLength} bytes from ${successUrl}`);
    console.log(`[API] Returning blob data for client-side decryption`);
    
    return new NextResponse(responseData, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="encrypted-${contractId}.bin"`
      }
    });
  } catch (error) {
    console.error('[API] Fatal error in download handler:', error);
    return NextResponse.json(
      { error: 'Download failed: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
