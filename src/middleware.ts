import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: [
    '/',
    // Protect all routes except login, api/auth, and public API endpoints
    '/((?!login|api/auth|api/settings|api/exchange-rates|api/currencies).*)',
  ],
}
