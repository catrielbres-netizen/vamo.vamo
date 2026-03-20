import { UserProfile } from '@/lib/types'

export function requireAdmin(
  profile: UserProfile | null,
  loading: boolean
): 'loading' | 'unauthorized' | 'authorized' {
  if (loading) return 'loading'
  if (!profile) return 'unauthorized'
  if (profile.role !== 'admin') return 'unauthorized'
  return 'authorized'
}
