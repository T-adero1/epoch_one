import { HiLockClosed, HiShieldCheck, HiDatabase } from 'react-icons/hi';
import { FaLink, FaFingerprint, FaHistory } from 'react-icons/fa';

export default function SecurityPage() {
  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:py-24 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Industry-Leading Blockchain Security
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            EpochOne uses advanced blockchain technology to ensure your documents are permanently sealed, tamper-proof, and legally binding.
          </p>
        </div>
        
        <div className="mt-16">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-gray-50 pt-6 px-6 pb-8 rounded-lg shadow-lg overflow-hidden">
              <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                <FaLink className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-5 text-lg font-medium text-gray-900">Blockchain Immutability</h3>
              <p className="mt-2 text-base text-gray-500">
                Once a document is signed, its hash is stored on the blockchain. This creates a permanent, unchangeable record that proves the document's existence and integrity at that moment in time.
              </p>
            </div>
            
            <div className="bg-gray-50 pt-6 px-6 pb-8 rounded-lg shadow-lg overflow-hidden">
              <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                <HiLockClosed className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-5 text-lg font-medium text-gray-900">Military-Grade Encryption</h3>
              <p className="mt-2 text-base text-gray-500">
                All documents are encrypted using AES-256 encryption, the same standard used by banks and military organizations worldwide. Your data is never stored in plain text.
              </p>
            </div>
            
            <div className="bg-gray-50 pt-6 px-6 pb-8 rounded-lg shadow-lg overflow-hidden">
              <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                <FaFingerprint className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-5 text-lg font-medium text-gray-900">Advanced Identity Verification</h3>
              <p className="mt-2 text-base text-gray-500">
                Our platform verifies signer identities through email, SMS, or biometric verification, ensuring the right people are signing your documents.
              </p>
            </div>
            
            <div className="bg-gray-50 pt-6 px-6 pb-8 rounded-lg shadow-lg overflow-hidden">
              <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                <HiShieldCheck className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-5 text-lg font-medium text-gray-900">Tamper-Evident Seals</h3>
              <p className="mt-2 text-base text-gray-500">
                Any attempt to modify a signed document will break its cryptographic seal, making tampering immediately obvious and providing proof of the original document's integrity.
              </p>
            </div>
            
            <div className="bg-gray-50 pt-6 px-6 pb-8 rounded-lg shadow-lg overflow-hidden">
              <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                <FaHistory className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-5 text-lg font-medium text-gray-900">Detailed Audit Trails</h3>
              <p className="mt-2 text-base text-gray-500">
                Every action taken on a document is recorded with timestamps, IP addresses, and user information, creating a court-admissible audit trail for legal proceedings.
              </p>
            </div>
            
            <div className="bg-gray-50 pt-6 px-6 pb-8 rounded-lg shadow-lg overflow-hidden">
              <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                <HiDatabase className="h-6 w-6 text-white" />
              </div>
              <h3 className="mt-5 text-lg font-medium text-gray-900">Decentralized Storage</h3>
              <p className="mt-2 text-base text-gray-500">
                Document cryptographic proofs are stored across multiple nodes on the blockchain, eliminating single points of failure and ensuring your records survive even if our servers don't.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-16 bg-gray-50 rounded-lg overflow-hidden shadow">
            <div className="px-6 py-8 sm:p-10">
                <div>
                <h3 className="text-xl font-medium text-gray-900">Our Commitment to Security</h3>
                <div className="mt-4 text-gray-500">
                    <p>
                    At EpochOne, security is more than just a priority—it’s built into the core of how our platform works. By using blockchain technology, we ensure every contract and receipt is tamper-proof, time-stamped, and cryptographically verifiable.
                    </p>
                    <p className="mt-4">
                    All documents are stored with strong encryption, and key actions (like signing) are logged immutably on-chain. We follow best practices in secure application development and are continuously improving our protections as we grow.
                    </p>
                </div>
                </div>
            </div>

          <div className="px-6 pt-6 pb-8 bg-gray-100 sm:px-10">
            
            <div className="mt-4 flex items-center">
              <div className="flex-shrink-0">
                <HiShieldCheck className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-3">
                <p className="text-base text-gray-700">
                  <strong>GDPR Compliant</strong> - Your data is handled in accordance with the strictest privacy regulations.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <div className="flex-shrink-0">
                <HiShieldCheck className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-3">
                <p className="text-base text-gray-700">
                  <strong>99.99% Uptime SLA</strong> - Your documents are available when you need them, with redundant systems ensuring reliability.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 