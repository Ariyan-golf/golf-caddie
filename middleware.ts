import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 除外リストの各項目は前方一致で判定される（例: "try" は /try も /try-foo も除外）。
    // 今後 try で始まる別パスを新設した場合、その新パスも middleware を通過しなくなる点に注意。
    "/((?!api/stripe/webhook|api/cron|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|lp\\.html|opening\\.html|characters/|try|pay|pay/success|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
