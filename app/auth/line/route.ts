import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const state = randomBytes(16).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("line_oauth_state", state, {
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
