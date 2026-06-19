'use client'

import dynamic from 'next/dynamic'
import { SessionProvider } from 'next-auth/react'

const AppShell = dynamic(
  () => import('@/components/layout/app-shell').then(mod => ({ default: mod.AppShell })),
  { ssr: false }
)

export default function Home() {
  return (
    <SessionProvider refetchOnWindowFocus={true} refetchWhenOffline={false}>
      <AppShell />
    </SessionProvider>
  )
}
