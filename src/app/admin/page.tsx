'use client'

import { useUser } from '@/firebase'

export default function AdminPage() {
  const { user, profile, loading } = useUser()

  return (
    <pre style={{ padding: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {JSON.stringify({ loading, uid: user?.uid, profile }, null, 2)}
    </pre>
  )
}
