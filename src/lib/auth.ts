import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { comparePassword, isHashed, hashPassword } from '@/lib/password'
import { logAction } from '@/lib/audit-log'

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null
        if (!user.active) return null
        if (user.deletedAt) return null

        const valid = await comparePassword(credentials.password, user.password)
        if (!valid) return null

        // If password is still plain-text, hash it in background for migration
        if (!isHashed(user.password)) {
          try {
            const hashed = await hashPassword(user.password)
            await db.user.update({
              where: { id: user.id },
              data: { password: hashed },
            })
          } catch {
            // Non-critical — will be hashed on next login
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchId: user.branchId || undefined,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt' as const,
    maxAge: 8 * 60 * 60, // 8 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as Record<string, unknown>).role
        token.userId = user.id
        token.branchId = (user as Record<string, unknown>).branchId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role
        ;(session.user as Record<string, unknown>).id = token.userId
        ;(session.user as Record<string, unknown>).branchId = token.branchId
      }
      return session
    },
  },
  events: {
    async signIn({ user }) {
      // Log successful login to audit trail
      await logAction({
        action: 'login',
        entity: 'user',
        entityId: user.id,
        details: { summary: `Inicio de sesión: ${user.name || user.email}` },
        userId: user.id,
        userName: user.name || user.email || '',
        userRole: (user as Record<string, unknown>).role as string || 'unknown',
      }).catch(() => {
        // Never break login flow due to audit logging failure
      })
    },
    async signOut({ session, token }) {
      // Log logout to audit trail
      const userId = (token as Record<string, unknown>)?.userId as string || ''
      const userName = (token as Record<string, unknown>)?.name as string || ''
      const userRole = (token as Record<string, unknown>)?.role as string || ''
      await logAction({
        action: 'logout',
        entity: 'user',
        entityId: userId,
        details: { summary: `Cierre de sesión: ${userName}` },
        userId,
        userName,
        userRole,
      }).catch(() => {
        // Never break logout flow due to audit logging failure
      })
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
