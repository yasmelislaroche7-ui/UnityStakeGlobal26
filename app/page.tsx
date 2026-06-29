'use client'

import dynamic from 'next/dynamic'

const MiniKitProvider = dynamic(
  () => import('@/components/minikit-provider').then(m => ({ default: m.MiniKitProvider })),
  { ssr: false },
)

const UsgApp = dynamic(
  () => import('@/components/usg-app'),
  { ssr: false },
)

export default function Page() {
  return (
    <MiniKitProvider>
      <UsgApp />
    </MiniKitProvider>
  )
}
