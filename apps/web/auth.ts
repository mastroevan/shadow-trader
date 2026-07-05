import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const allowedEmails = new Set(
  (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();

      if (allowedEmails.size === 0) {
        return true;
      }
      return Boolean(email && allowedEmails.has(email));
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});