export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  const { profile, isAdmin, refresh } = useCurrentProfile()
  if (!profile.value) await refresh()

  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
