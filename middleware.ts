import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // Get the path
  const path = request.nextUrl.pathname;

  // Define exempted paths that don't require password verification
  const isPasswordExemptPath = 
    path === '/api/verify-password' ||
    path.startsWith('/_next') || 
    path.includes('favicon') ||
    path.includes('.svg') ||
    path.includes('.png') ||
    path.includes('.jpg') ||
    path.includes('.ico');

  // Check for site password cookie
  const hasSitePassword = request.cookies.has('site-password-verified');
  
  // Only perform the password check if the request isn't for an exempt path
  if (!hasSitePassword && !isPasswordExemptPath) {
    // Instead of redirecting, we'll let the client component handle showing the password modal
    // This way we avoid redirect loops
    return NextResponse.next();
  }

  // Define public paths that don't require authentication
  const isPublicPath = path === '/' || 
                       path === '/login' || 
                       path.startsWith('/_next') || 
                       path.startsWith('/api/');

  // For client-side routes, we'll let the client-side auth guard handle it
  if (path.startsWith('/dashboard') || path.startsWith('/sign')) {
    return NextResponse.next();
  }

  // If the path is not public, redirect to the login page
  if (!isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Continue with the request if accessing a public path
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * 1. /_next (Next.js internals)
     * 2. /static (static files)
     * 3. /favicon.ico, /robots.txt (SEO)
     */
    '/((?!_next|static|favicon.ico|robots.txt).*)',
  ],
}; 