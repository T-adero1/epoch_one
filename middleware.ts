import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  // Check if the user is authenticated by looking for the session token
  const sessionCookie = request.cookies.get('epochone_session');
  const isAuthenticated = !!sessionCookie;

  // If the path is not public and the user is not authenticated, redirect to the login page
  if (!isPublicPath && !isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Continue with the request if authenticated or accessing a public path
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