import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import { query } from "@/lib/db";
import { DEFAULT_NEIGHBORHOOD } from "@/lib/neighborhood";
import type { DbUser } from "@/lib/types";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/auth/signin"
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email;
      }
      return session;
    }
  }
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return null;
  }

  const upserted = await query<DbUser>(
    `INSERT INTO users (email, display_name, neighborhood)
     VALUES ($1, $2, $3)
     ON CONFLICT (email)
     DO UPDATE SET
       display_name = COALESCE(users.display_name, EXCLUDED.display_name),
       neighborhood = EXCLUDED.neighborhood
     RETURNING *`,
    [email, session.user?.name ?? null, DEFAULT_NEIGHBORHOOD]
  );

  return upserted.rows[0];
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
