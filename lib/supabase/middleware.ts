import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      supabaseResponse = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options)
      );
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieMethods,
      global: {
        // Supabase Auth への通信が無応答のとき middleware が実行時間上限に達し
        // 504 MIDDLEWARE_INVOCATION_TIMEOUT となるのを防ぐため、3秒でアボートする。
        fetch: (input, init) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          return fetch(input, { ...init, signal: controller.signal }).finally(() =>
            clearTimeout(timeout)
          );
        },
      },
    }
  );

  let user = null;
  try {
    // getUser は未ログイン時にもセッション不在を示す error を返すため、error の有無だけで
    // 判定するとフェイルオープンが常時発動し、未ログイン時のリダイレクトが働かなくなる。
    // 通信失敗（タイムアウト/障害）は name が "AuthRetryableFetchError" の error として返るため、
    // これのみをフェイルオープンの対象とする。
    const {
      data: { user: fetchedUser },
      error,
    } = await supabase.auth.getUser();
    if (error?.name === "AuthRetryableFetchError") {
      // フェイルオープン（通信失敗 経路）: user 取得に失敗しているため、リダイレクト判定は
      // 一切行わずログイン済みユーザーの誤リダイレクトを防ぎ、そのまま素通しする。
      console.error("[middleware] supabase.auth.getUser() returned error:", error);
      return supabaseResponse;
    }
    // それ以外（未ログイン等）は user を null のままリダイレクト判定へ進める。
    user = fetchedUser;
  } catch (error) {
    // フェイルオープン: Supabase Auth が無応答（タイムアウト/障害）のとき、
    // user を取得できないままリダイレクト判定に進むと、ログイン済みユーザーを
    // /login や /try へ誤って飛ばしてしまう。それを防ぐため、判定は一切行わず
    // そのまま supabaseResponse を返して素通しする。
    console.error("[middleware] supabase.auth.getUser() failed:", error);
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;
  // 未ログインでも見られる公開ページ
  const publicPaths = ["/login", "/register", "/auth/callback", "/auth/line", "/lp.html"];
  // ログイン状態に関わらず両対応するページ（middlewareでリダイレクトしない）
  // /compe/join: コンペ参加ランディング。未ログインでもコードを表示しログインへ誘導するため公開。
  const openPaths = ["/pay", "/round/start", "/event/tobashikko/ranking", "/compe/join", "/terms", "/privacy", "/try"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  const isOpen = openPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic && !isOpen) {
    const url = request.nextUrl.clone();
    // 入口（ルート）は計測画面 /try へ。それ以外の保護ページは従来どおり /login へ。
    url.pathname = pathname === "/" ? "/try" : "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublic && !pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
