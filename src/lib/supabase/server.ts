import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Returns the signed-in user or redirects to /login.
 * getClaims() verifies the login token's signature on the server (no round trip to
 * Supabase on projects using signing keys), so every page and action is faster.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return { supabase, user: { id: claims!.sub as string, email: (claims!.email as string | undefined) ?? null } };
}
