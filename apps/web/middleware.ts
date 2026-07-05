export { auth as middleware } from "@/auth";
export const config = {
  matcher: [
    /*
      * Protect every route except:
      * - Auth.js endpoints
      * - Next static assets
      * - images/files
      */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};