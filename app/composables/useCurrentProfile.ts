import type { Database } from '~/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useCurrentProfile() {
  const user = useSupabaseUser()
  const client = useSupabaseClient<Database>()

  const profile = useState<Profile | null>('current-profile', () => null)
  const pending = useState<boolean>('current-profile-pending', () => false)

  async function refresh() {
    if (!user.value) {
      profile.value = null
      return
    }
    pending.value = true
    // No client-side id filter. The RLS policy on `profiles` already restricts
    // the caller to their own row, and the id is not reliably available anyway:
    // during SSR useSupabaseUser() exposes JWT claims, where the user id lives
    // under `sub` rather than `id`. Filtering on `.id` there silently matches
    // nothing and every admin looks like a guest.
    const { data } = await client
      .from('profiles')
      .select('*')
      .limit(1)
      .maybeSingle()
    profile.value = data ?? null
    pending.value = false
  }

  const isAdmin = computed(() => profile.value?.role === 'admin')

  return { profile, isAdmin, pending, refresh }
}
