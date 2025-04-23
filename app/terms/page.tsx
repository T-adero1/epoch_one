export default function TermsPage() {
  return (
    <div className="bg-white py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="mt-12 prose prose-blue prose-lg mx-auto">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using EpochOne's services, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
          </p>

          <h2>2. Use License</h2>
          <p>
            Permission is granted to temporarily use EpochOne's services for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.
          </p>

          <h2>3. Blockchain Storage</h2>
          <p>
            Documents signed using our platform are secured using blockchain technology. This means that a cryptographic hash of your document is stored on the blockchain, creating an immutable record of the document's existence and signatures. The actual document content is stored securely on our servers with industry-standard encryption.
          </p>

          <h2>4. User Responsibilities</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
          </p>

          <h2>5. Privacy Policy</h2>
          <p>
            Your use of EpochOne is also governed by our Privacy Policy, which is incorporated into these Terms of Service by reference.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            EpochOne shall not be liable for any direct, indirect, incidental, special, consequential or punitive damages resulting from your use or inability to use the service.
          </p>

          <h2>7. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of Nigeria, without regard to its conflict of law provisions.
          </p>

          <h2>8. Changes to Terms</h2>
          <p>
            EpochOne reserves the right to modify these terms at any time. We will notify users of any changes by updating the date at the top of this page.
          </p>

          <h2>9. Contact Information</h2>
          <p>
            If you have any questions about these Terms, please contact us at support@epochone.com.
          </p>
        </div>
      </div>
    </div>
  );
} 