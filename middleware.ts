import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api/stripe/webhook|api/cron|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|lp\\.html|opening\\.html|characters/|pay|pay/success|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
