import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "./lib/iam/config";

const isPublicRoute = createRouteMatcher([
  "/",
  "/status(.*)",
  "/dashboard/status(.*)",
  "/dashboard/system(.*)",
  "/dashboard/insights(.*)",
  "/dashboard/policies(.*)",
  "/dashboard/logs(.*)",
  "/sign-in(.*)",
  "/api/slack(.*)",
  "/api/policies(.*)",
  "/v1/gateway(.*)",
  "/api/v1(.*)",
  "/api/metrics(.*)",
  "/healthz",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  // Sign-up is strictly disabled: X4G4T is an authentication consumer, not an IDP.
  // Any attempt to access /sign-up is immediately redirected to /sign-in.
  if (pathname.startsWith("/sign-up")) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const authObj = auth();

  // Only redirect to /dashboard if accessing exactly /sign-in (never sub-routes like /sign-in/factor-two) and fully authenticated
  if (authObj.userId && authObj.sessionId && pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Enforce authentication on all protected routes (e.g. /dashboard)
  if (!isPublicRoute(req)) {
    await authObj.protect({
      unauthenticatedUrl: `${req.nextUrl.origin}/sign-in`,
    });
  }

  return NextResponse.next();
}, {
  jwtKey: process.env.CLERK_JWT_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

export default async function middleware(req: any, event: any) {
  if (!isClerkConfigured()) {
    return NextResponse.next();
  }

  // Fast-path for anonymous visitors to public routes: avoid unnecessary encryption overhead
  const hasSessionCookie = req.cookies.has("__session") || req.cookies.has("__client_uat");
  if (isPublicRoute(req) && !hasSessionCookie) {
    return NextResponse.next();
  }

  try {
    return await clerkHandler(req, event);
  } catch (err: any) {
    console.warn("[Clerk Middleware Session Error, clearing stale cookies]:", err?.message);
    // If Clerk cannot decrypt legacy or mismatched cookies, clear them and redirect cleanly
    const isProtected = !isPublicRoute(req);
    const targetUrl = new URL(isProtected ? "/sign-in" : req.nextUrl.pathname, req.url);
    const response = isProtected ? NextResponse.redirect(targetUrl) : NextResponse.next();
    response.cookies.delete("__session");
    response.cookies.delete("__client_uat");
    response.cookies.delete("__clerk_db_jwt");
    return response;
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
