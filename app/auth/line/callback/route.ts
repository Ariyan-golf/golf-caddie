import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("line_oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/login?error=invalid_state`);
  }
  cookieStore.delete("line_oauth_state");

  // Exchange code for LINE access token
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/auth/line/callback`,
      client_id: process.env.LINE_CHANNEL_ID!,
      client_secret: process.env.LINE_CHANNEL_SECRET!,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=line_auth_failed`);
  }

  const { access_token } = await tokenRes.json();

  // Get LINE profile
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!profileRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=line_auth_failed`);
  }

  const { userId: lineUserId, displayName } = (await profileRes.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  };

  // Admin client (bypasses RLS)
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Deterministic, non-guessable password derived from LINE user ID + channel secret.
  // This makes password login impossible without LINE auth while keeping the hash stable.
  const syntheticPassword = createHmac(
    "sha256",
    process.env.LINE_CHANNEL_SECRET!
  )
    .update(lineUserId)
    .digest("hex");
  const email = `${lineUserId}@line.local`;

  // Check if this LINE user already has a Supabase account
  const { data: existingProfile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("line_id", lineUserId)
    .single();

  if (!existingProfile) {
    // First-time login: create Supabase user
    const { data: created, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password: syntheticPassword,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });

    let userId = created?.user?.id;

    if (createError) {
      // Interrupted previous attempt — find the existing user by email
      const { data: listData } = await adminSupabase.auth.admin.listUsers({
        perPage: 1000,
      });
      const match = listData.users.find((u) => u.email === email);
      if (!match) {
        return NextResponse.redirect(`${origin}/login?error=auth_failed`);
      }
      userId = match.id;
    }

    if (userId) {
      await adminSupabase
        .from("profiles")
        .update({ line_id: lineUserId, display_name: displayName })
        .eq("id", userId);
    }
  }

  // Sign in with synthetic credentials to set SSR session cookies
  const response = NextResponse.redirect(`${origin}/`);

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options)
      );
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  );

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: syntheticPassword,
  });

  if (signInError) {
    return NextResponse.redirect(`${origin}/login?error=signin_failed`);
  }

  return response;
}
