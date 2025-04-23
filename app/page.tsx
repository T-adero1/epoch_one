'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/contexts/ZkLoginContext';
import Link from 'next/link';
import { FaFileSignature, FaShieldAlt, FaCheckCircle } from 'react-icons/fa';
import { HiLockClosed } from 'react-icons/hi';

export default function Home() {
  const { isAuthenticated, isLoading } = useZkLogin();
  const router = useRouter();

  // Redirect to dashboard if the user is already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading</h2>
          <p className="text-gray-600">Please wait...</p>
        </div>
      </div>
    );
  }

  // Only render the home page if the user is not authenticated
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 pt-20 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
              <h1 className="text-4xl tracking-tight font-extrabold text-white sm:text-5xl md:text-6xl">
                Secure documents
                <span className="block text-blue-200">for your business</span>
              </h1>
              <p className="mt-3 text-base text-blue-100 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                Organize and secure your business documents with advanced cryptography and digital verification.
              </p>
              <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
                <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-blue-700 bg-white hover:bg-blue-50 focus:outline-none"
                  >
                    Get Started for Free
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-800 bg-opacity-60 hover:bg-opacity-70 focus:outline-none"
                  >
                    Explore How It Works
                  </Link>
                </div>
              </div>
            </div>
            <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
              <div className="relative mx-auto w-full rounded-lg shadow-lg lg:max-w-md">
                <div className="relative block w-full bg-white rounded-lg overflow-hidden">
                  <div className="p-8">
                    <div className="flex justify-center">
                      <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <FaFileSignature className="h-10 w-10" />
                      </div>
                    </div>
                    <div className="text-center mt-4">
                      <h3 className="text-lg font-medium text-gray-900">Your documents are secure</h3>
                      <p className="mt-2 text-sm text-gray-500">
                        Every document is cryptographically sealed and digitally verified.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">How It Works</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Three simple steps to manage your documents
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Our platform makes document management fast, secure, and efficient.
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                    <span className="text-lg font-bold">1</span>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Upload a document</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Upload your document or create one using our templates. Organize with tags and folders.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                    <span className="text-lg font-bold">2</span>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Share with team members</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Invite team members via email or SMS. They can access from any device, anywhere.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                    <span className="text-lg font-bold">3</span>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Securely stored with encryption</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Once uploaded, the document is encrypted and securely stored with access controls.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
                Unbreakable security for your most important documents
              </h2>
              <p className="mt-3 max-w-3xl text-lg text-gray-500">
                Your documents are protected with advanced encryption. Our platform provides complete protection for your sensitive information.
              </p>
              <div className="mt-8">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">Tamper-proof documents</h3>
                    <p className="mt-2 text-base text-gray-500">
                      Documents are protected against unauthorized changes, ensuring complete trust.
                    </p>
                  </div>
                </div>
                <div className="flex items-center mt-6">
                  <div className="flex-shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">Advanced encryption</h3>
                    <p className="mt-2 text-base text-gray-500">
                      Each document is protected using advanced encryption technology.
                    </p>
                  </div>
                </div>
                <div className="flex items-center mt-6">
                  <div className="flex-shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">Access control</h3>
                    <p className="mt-2 text-base text-gray-500">
                      Granular permissions system with detailed access logs for compliance.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-10 lg:mt-0 flex justify-center">
              <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
                <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-blue-100">
                  <HiLockClosed className="h-10 w-10 text-blue-600" />
                </div>
                <div className="mt-4 text-center">
                  <h3 className="text-xl font-medium text-gray-900">Enterprise-Grade Security</h3>
                  <p className="mt-2 text-gray-500">
                    Every document receives a unique cryptographic signature and is protected with end-to-end encryption.
                  </p>
                  <div className="mt-4 p-3 bg-gray-100 rounded text-sm font-mono text-gray-700 truncate">
                    0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
                  </div>
                  <div className="mt-6">
                    <Link
                      href="/security"
                      className="inline-flex items-center text-blue-600 hover:text-blue-500"
                    >
                      <span>Learn more about our security</span>
                      <svg className="ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-700">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            <span className="block">Ready to get started?</span>
            <span className="block text-blue-200">Sign up today for a free trial.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
              >
                Get started
              </Link>
            </div>
            <div className="ml-3 inline-flex rounded-md shadow">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-800 hover:bg-blue-900"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white">
        <div className="max-w-7xl mx-auto py-12 px-4 overflow-hidden sm:px-6 lg:px-8">
          <nav className="flex flex-wrap justify-center">
            <div className="px-5 py-2">
              <Link href="/terms" className="text-base text-gray-500 hover:text-gray-900">
                Terms of Service
              </Link>
            </div>
            <div className="px-5 py-2">
              <Link href="/privacy" className="text-base text-gray-500 hover:text-gray-900">
                Privacy Policy
              </Link>
            </div>
            <div className="px-5 py-2">
              <Link href="/security" className="text-base text-gray-500 hover:text-gray-900">
                Security
              </Link>
            </div>
            <div className="px-5 py-2">
              <Link href="/contact" className="text-base text-gray-500 hover:text-gray-900">
                Contact
              </Link>
            </div>
          </nav>
          <p className="mt-8 text-center text-base text-gray-500">
            &copy; {new Date().getFullYear()} EpochOne Technologies. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
