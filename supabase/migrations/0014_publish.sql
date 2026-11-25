-- Channel video kit: what the edited YouTube version needs that tagging does not.

alter table public.matches
  add column event_name text,
  add column round text,
  add column category text check (category in ('men', 'women', 'mixed')),
  add column publish_settings jsonb not null default '{}';

comment on column public.matches.event_name is 'Tournament or championship name, e.g. "Tournois des Vendanges".';
comment on column public.matches.round is 'Free text: Poules, 1/8, Quarts de finale, Demi-finale, Finale…';
comment on column public.matches.category is 'With format, gives the discipline: simple/double × hommes/dames/mixte.';
comment on column public.matches.publish_settings is 'Editor state for the YouTube render (trim, crop, toggles, thumbnail text). Shape: shared/publish/types.ts PublishSettings.';
