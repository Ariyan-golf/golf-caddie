import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin } = url;
  const state = randomBytes(16).toString("hex");

  // 同一オリジン内へのパス遷移のみ許可（オープンリダイレクト対策）
  const redirectToParam = url.searchParams.get("redirect_to") ?? "";
  const redirectTo = redirectToParam.startsWith("/") ? redirectToParam : "/";

  const cookieStore = await cookies();
  cookieStore.set("line_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("line_oauth_redirect", redirectTo, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_CHANNEL_ID!,
    redirect_uri: `${origin}/auth/line/callback`,
    state,
    scope: "profile openid",
  });

  return NextResponse.redirect(
    `https://access.line.me/oauth2/v2.1/authorize?${params}`
  );
}
