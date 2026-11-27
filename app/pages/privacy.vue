<script setup lang="ts">
// Privacy policy. Required by Google's OAuth consent screen and by the YouTube
// API Services terms (links to YouTube ToS, Google's policy, revoke page).
const { locale } = useI18n()
const fr = computed(() => locale.value === 'fr')

useSeoMeta({ title: () => (fr.value ? 'Confidentialité' : 'Privacy policy') })

const updated = '2026-11-27'
const contact = 'lacault.tim@gmail.com'
</script>

<template>
  <article class="prose-policy mx-auto max-w-3xl py-10 sm:py-16">
    <template v-if="fr">
      <h1>Politique de confidentialité</h1>
      <p class="meta">Mise à jour : {{ updated }}</p>

      <h2>Ce que fait ce site</h2>
      <p>Badminton Records publie les vidéos de matchs de la chaîne YouTube Badminton Records, avec le score et les statistiques de chaque échange. Il utilise les services d'API YouTube.</p>

      <h2>Visiteurs</h2>
      <p>Aucun compte, aucun cookie publicitaire ni outil d'analyse. Seuls la langue (un cookie) et le thème (localStorage) choisis sont gardés dans votre navigateur. Les vidéos sont lues via le lecteur YouTube, soumis aux règles de Google.</p>

      <h2>Administration et accès YouTube</h2>
      <p>Seul le propriétaire de la chaîne se connecte. Avec son autorisation (OAuth Google), l'application lit les vidéos de sa propre chaîne (y compris non répertoriées), y envoie les vidéos montées et met à jour leurs titres, descriptions, miniatures et visibilité. Le jeton d'accès est stocké côté serveur uniquement, jamais partagé ni vendu, et n'est utilisé pour aucune autre chaîne ni aucun autre compte.</p>
      <p>Données conservées : identifiants, titres et miniatures des vidéos, et les données de match saisies (joueurs, scores). Les noms des joueurs proviennent de sources publiques (MyFFBaD).</p>

      <h2>Services tiers</h2>
      <p>En utilisant ce site, vous acceptez les <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">Conditions d'utilisation de YouTube</a>. Les données traitées via YouTube relèvent des <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Règles de confidentialité de Google</a>. Hébergement : Vercel et Supabase.</p>

      <h2>Révocation et suppression</h2>
      <p>L'accès donné à l'application peut être retiré à tout moment sur <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener">la page des autorisations Google</a>. Pour faire retirer une vidéo ou vos données (par exemple votre nom de joueur) : <a :href="`mailto:${contact}`">{{ contact }}</a>.</p>
    </template>

    <template v-else>
      <h1>Privacy policy</h1>
      <p class="meta">Updated: {{ updated }}</p>

      <h2>What this site does</h2>
      <p>Badminton Records publishes match videos from the Badminton Records YouTube channel, with the score and stats of every rally. It uses YouTube API Services.</p>

      <h2>Visitors</h2>
      <p>No accounts, no advertising cookies, no analytics. Only your language (one cookie) and theme (localStorage) choice stay in your browser. Videos play through the YouTube player, which follows Google's rules.</p>

      <h2>Admin and YouTube access</h2>
      <p>Only the channel owner signs in. With their permission (Google OAuth), the app reads videos on their own channel (including unlisted ones), uploads edited videos to it, and updates their titles, descriptions, thumbnails and visibility. The access token is stored server-side only, never shared or sold, and never used for any other channel or account.</p>
      <p>Data kept: video ids, titles and thumbnails, and the match data entered (players, scores). Player names come from public sources (MyFFBaD).</p>

      <h2>Third-party services</h2>
      <p>By using this site you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">YouTube Terms of Service</a>. Data handled through YouTube falls under the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>. Hosting: Vercel and Supabase.</p>

      <h2>Revoking access and deletion</h2>
      <p>Access granted to the app can be revoked at any time on <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener">Google's permissions page</a>. To have a video or your data (such as your player name) removed: <a :href="`mailto:${contact}`">{{ contact }}</a>.</p>
    </template>
  </article>
</template>

<style scoped>
.prose-policy h1 { font-family: var(--font-display); font-weight: 700; text-transform: uppercase; font-size: clamp(2.25rem, 6vw, 3.5rem); line-height: 0.95; }
.prose-policy h2 { margin-top: 2.25rem; font-weight: 600; font-size: 1.25rem; }
.prose-policy p { margin-top: 0.75rem; line-height: 1.7; color: var(--color-ink-muted); max-width: 65ch; }
.prose-policy .meta { font-size: 0.875rem; color: var(--color-ink-subtle); }
.prose-policy a { color: var(--color-accent); text-decoration: underline; text-underline-offset: 3px; }
</style>
