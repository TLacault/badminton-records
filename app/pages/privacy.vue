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
      <p>Seul le propriétaire de la chaîne se connecte. Avec son autorisation (OAuth Google, en lecture et en envoi uniquement), l'application lit les vidéos de sa propre chaîne (y compris non répertoriées) et, quand il clique sur « Upload to YouTube », y envoie une vidéo montée avec le titre, la description, la visibilité, la réponse « conçue pour les enfants » et la miniature qu'il a choisis. Rien n'est envoyé sans ce clic. Le jeton d'accès est stocké côté serveur uniquement, jamais partagé ni vendu, et n'est utilisé pour aucune autre chaîne ni aucun autre compte.</p>
      <p>Données conservées : identifiants, titres, durées et miniatures des vidéos, et les données de match saisies (joueurs, scores). Les noms des joueurs proviennent de sources publiques (MyFFBaD). Les données lues sur YouTube sont relues chaque jour et ne sont jamais gardées plus de 30 jours sans être rafraîchies. Les vidéos montées restent sur l'ordinateur du propriétaire jusqu'à leur envoi, puis sont supprimées.</p>

      <h2>Services tiers</h2>
      <p>En utilisant ce site, vous acceptez les <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">Conditions d'utilisation de YouTube</a>. Les données traitées via YouTube relèvent des <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Règles de confidentialité de Google</a>. Hébergement : Vercel et Supabase.</p>

      <h2>Révocation et suppression</h2>
      <p>L'accès donné à l'application peut être retiré à tout moment sur <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener">la page des autorisations Google</a> ; les données obtenues via YouTube sont alors supprimées sous 30 jours. Pour faire retirer une vidéo ou vos données (par exemple votre nom de joueur), écrivez à <a :href="`mailto:${contact}`">{{ contact }}</a> : c'est fait sous 7 jours. Même adresse pour toute question sur vos données.</p>
      <p>Voir aussi les <NuxtLink to="/terms">conditions d'utilisation</NuxtLink>.</p>
    </template>

    <template v-else>
      <h1>Privacy policy</h1>
      <p class="meta">Updated: {{ updated }}</p>

      <h2>What this site does</h2>
      <p>Badminton Records publishes match videos from the Badminton Records YouTube channel, with the score and stats of every rally. It uses YouTube API Services.</p>

      <h2>Visitors</h2>
      <p>No accounts, no advertising cookies, no analytics. Only your language (one cookie) and theme (localStorage) choice stay in your browser. Videos play through the YouTube player, which follows Google's rules.</p>

      <h2>Admin and YouTube access</h2>
      <p>Only the channel owner signs in. With their permission (Google OAuth, read and upload only), the app reads videos on their own channel (including unlisted ones) and, when they click "Upload to YouTube", uploads an edited video with the title, description, visibility, made-for-kids answer and thumbnail they chose. Nothing is uploaded without that click. The access token is stored server-side only, never shared or sold, and never used for any other channel or account.</p>
      <p>Data kept: video ids, titles, durations and thumbnails, and the match data entered (players, scores). Player names come from public sources (MyFFBaD). Data read from YouTube is re-read every day and never kept unrefreshed for more than 30 days. Edited videos stay on the owner's computer until they are uploaded, then are deleted.</p>

      <h2>Third-party services</h2>
      <p>By using this site you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">YouTube Terms of Service</a>. Data handled through YouTube falls under the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>. Hosting: Vercel and Supabase.</p>

      <h2>Revoking access and deletion</h2>
      <p>Access granted to the app can be revoked at any time on <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener">Google's permissions page</a>; data obtained through YouTube is then deleted within 30 days. To have a video or your data (such as your player name) removed, write to <a :href="`mailto:${contact}`">{{ contact }}</a>: it is done within 7 days. Same address for any question or complaint about your data.</p>
      <p>See also the <NuxtLink to="/terms">terms of use</NuxtLink>.</p>
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
