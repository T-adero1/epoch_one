import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

<<<<<<< HEAD:middleware.ts
// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // Get the path
  const path = request.nextUrl.pathname;

  // Define public paths that don't require authentication
  const isPublicPath = path === '/' || 
                       path === '/login' || 
                       path === '/terms' || 
                       path === '/privacy' || 
                       path.startsWith('/_next') || 
                       path.startsWith('/api/');

  // For client-side routes, we'll let the client-side auth guard handle it
  if (path.startsWith('/dashboard')) {
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
=======
export function middleware(request: NextRequest) {
  // For API routes that use Walrus client, we want to provide helpful error messages
  // if the environment variables are not set
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Check if required environment variables are set
    const missingEnvVars = [];
    
    if (!process.env.WALRUS_CAPACITY_ID) {
      missingEnvVars.push('WALRUS_CAPACITY_ID');
    }
    
    if (!process.env.WALRUS_AGGREGATOR) {
      missingEnvVars.push('WALRUS_AGGREGATOR');
    }
    
    // If any required env vars are missing, return a helpful error
    if (missingEnvVars.length > 0) {
      console.warn(`[Middleware] API request to ${request.nextUrl.pathname} but missing env variables: ${missingEnvVars.join(', ')}`);
      
      return NextResponse.json(
        {
          error: 'Server misconfiguration',
          details: `Missing required environment variables: ${missingEnvVars.join(', ')}`,
          suggestion: 'Please check your .env file configuration'
        },
        { status: 500 }
      );
    }
  }
  
  return NextResponse.next();
}

// Only run middleware on API routes that might use Walrus
export const config = {
  matcher: [
    '/api/documents/:path*',
    '/api/invite/:path*',
>>>>>>> master:src/middleware.ts
  ],
}; 