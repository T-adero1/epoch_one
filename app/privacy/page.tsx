export default function PrivacyPage() {
  return (
    <div className="bg-white py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="mt-12 prose prose-blue prose-lg mx-auto">
          <h2>1. Information We Collect</h2>
          <p>
            EpochOne collects information you provide directly to us when you create an account, upload documents, or use our services. This may include your name, email address, phone number, and information about the documents you sign or share.
          </p>

          <h2>2. Blockchain Information</h2>
          <p>
            When you sign a document on our platform, a cryptographic hash of the document (not the document itself) is stored on the blockchain. This hash cannot be reversed to reveal the document's contents, but it serves as a timestamp and proof that the document existed in its specific state at the time of signing.
          </p>

          <h2>3. How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services, process transactions, send communications, and comply with legal obligations.
          </p>

          <h2>4. Information Sharing</h2>
          <p>
            We do not sell your personal information. We may share your information with third parties as follows:
          </p>
          <ul>
            <li>With vendors and service providers who need access to such information to carry out work on our behalf</li>
            <li>In response to a request for information if we believe disclosure is in accordance with, or required by, any applicable law or legal process</li>
            <li>If we believe your actions are inconsistent with our user agreements or policies, or to protect the rights, property, and safety of us or others</li>
          </ul>

          <h2>5. Data Security</h2>
          <p>
            We implement reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.
          </p>

          <h2>6. Data Retention</h2>
          <p>
            We store the information we collect about you for as long as is necessary for the purpose(s) for which we collected it or for other legitimate business purposes, including to meet our legal, regulatory, or other compliance obligations.
          </p>

          <h2>7. Your Rights</h2>
          <p>
            Depending on your location, you may have certain rights regarding your personal information, such as the right to access, correct, or delete your data.
          </p>

          <h2>8. Changes to This Policy</h2>
          <p>
            We may change this privacy policy from time to time. If we make changes, we will notify you by revising the date at the top of the policy.
          </p>

          <h2>9. Contact Us</h2>
          <p>
            If you have any questions about this privacy policy, please contact us at privacy@epochone.com.
          </p>
        </div>
      </div>
    </div>
  );
} 