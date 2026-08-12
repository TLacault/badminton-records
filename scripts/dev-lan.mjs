// `nuxt dev --host` binds the app to every interface so a phone on the same
// wifi can load it, but that is only half the job: NUXT_PUBLIC_SUPABASE_URL is
// public runtime config, so its value is inlined into the client payload as
// `window.__NUXT__.config.public.supabase.url`. With the .env default of
// http://127.0.0.1:54321 the phone dutifully calls its *own* loopback and
// every auth and data request fails, while the page itself loads fine — which
// makes it look like --host is broken when it is not.
//
// So: find this machine's LAN address, point the Supabase URL at it (the local
// Kong already listens on 0.0.0.0:54321), and hand off to `nuxt dev --host`.
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

// Docker's bridges are as non-internal as wlan0 as far as node is concerned,
// and this project runs Supabase in Docker, so there are always several to
// step over. Match on name rather than on the 172.16/12 range: a bridge can be
// configured onto any subnet, but it keeps the conventional name.
const VIRTUAL = /^(docker|br-|veth|virbr|tun|tap|vmnet)/

const lanAddress = Object.entries(networkInterfaces())
  .filter(([name]) => !VIRTUAL.test(name))
  .flatMap(([, addresses]) => addresses ?? [])
  .find(address => address.family === 'IPv4' && !address.internal)
  ?.address

if (!lanAddress) {
  console.error('dev:lan: no LAN address found — is this machine on a network?')
  process.exit(1)
}

const supabaseUrl = `http://${lanAddress}:54321`
console.log(`dev:lan: serving on http://${lanAddress}:3000, Supabase at ${supabaseUrl}`)

const nuxt = spawn('nuxt', ['dev', '--host', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NUXT_PUBLIC_SUPABASE_URL: supabaseUrl },
})

nuxt.on('exit', code => process.exit(code ?? 0))
