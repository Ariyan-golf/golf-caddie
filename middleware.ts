import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api/stripe/webhook|api/cron|_next/static|_next/image|favicon.ico|lp\\.html|pay|pay/success|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
