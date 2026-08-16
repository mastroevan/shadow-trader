export { auth as middleware } from "@/auth";

export const config = {
  // Exclude all /api routes: the backend proxy (app/api/backend/[...path])
  // enforces its own session check and returns a JSON 401 that the client
  // relies on, and NextAuth's own /api/auth routes must stay reachable.
  // Also exclude the login page and static assets.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};