import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AM_ONLY_ROLE, AM_ONLY_PAGES, AM_ONLY_APIS } from '@/lib/config'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Individual Account Managers only get the AM and Weekly Report pages
  const path = request.nextUrl.pathname
  const isPage = path.startsWith('/dashboard')
  const isApi  = path.startsWith('/api')
  if (user && (isPage || isApi)) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    // Fail closed: a missing profile is treated like an Account Manager (most restricted)
    if (!profile || profile.role === AM_ONLY_ROLE) {
      const under = (base: string) => path === base || path.startsWith(base + '/')
      if (isApi && !AM_ONLY_APIS.some(under)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (isPage && !AM_ONLY_PAGES.some(under)) {
        const url = request.nextUrl.clone()
        url.pathname = AM_ONLY_PAGES[0]
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
