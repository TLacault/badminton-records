<script setup lang="ts">
// Terms of use. The YouTube API Services policy (III.A.1) asks the client's own
// terms to link YouTube's and to state that using it means agreeing to them.
const { locale } = useI18n()
const fr = computed(() => locale.value === 'fr')

useSeoMeta({ title: () => (fr.value ? "Conditions d'utilisation" : 'Terms of use') })

const updated = '2026-11-27'
const contact = 'lacault.tim@gmail.com'
</script>

<template>
  <article class="prose-policy mx-auto max-w-3xl py-10 sm:py-16">
    <template v-if="fr">
      <h1>Conditions d'utilisation</h1>
      <p class="meta">Mise à jour : {{ updated }}</p>

      <h2>Le service</h2>
      <p>Badminton Records présente les matchs de la chaîne YouTube Badminton Records avec le score et les statistiques de chaque échange. Le site utilise les services d'API YouTube.</p>

      <h2>YouTube</h2>
      <p>En utilisant ce site, vous acceptez d'être lié par les <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">Conditions d'utilisation de YouTube</a>. Les vidéos sont lues par le lecteur YouTube et relèvent des <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Règles de confidentialité de Google</a>.</p>

      <h2>Espace d'administration</h2>
      <p>L'administration est réservée au propriétaire de la chaîne. Elle sert à annoter ses propres matchs, à monter ses vidéos et à les envoyer sur sa propre chaîne YouTube, uniquement à sa demande.</p>

      <h2>Contenus</h2>
      <p>Les vidéos et les données de match appartiennent au propriétaire de la chaîne. Le site est fourni tel quel, sans garantie de disponibilité.</p>

      <h2>Contact</h2>
      <p><a :href="`mailto:${contact}`">{{ contact }}</a>. Voir aussi la <NuxtLink to="/privacy">politique de confidentialité</NuxtLink>.</p>
    </template>

    <template v-else>
      <h1>Terms of use</h1>
      <p class="meta">Updated: {{ updated }}</p>

      <h2>The service</h2>
      <p>Badminton Records shows the matches of the Badminton Records YouTube channel with the score and stats of every rally. The site uses YouTube API Services.</p>

      <h2>YouTube</h2>
      <p>By using this site, you agree to be bound by the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">YouTube Terms of Service</a>. Videos play through the YouTube player and fall under the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>.</p>

      <h2>Admin area</h2>
      <p>The admin area is for the channel owner only. It is used to annotate their own matches, edit their videos and upload them to their own YouTube channel, only when they ask for it.</p>

      <h2>Content</h2>
      <p>The videos and match data belong to the channel owner. The site is provided as is, with no guarantee of availability.</p>

      <h2>Contact</h2>
      <p><a :href="`mailto:${contact}`">{{ contact }}</a>. See also the <NuxtLink to="/privacy">privacy policy</NuxtLink>.</p>
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
