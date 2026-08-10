-- Whether the upload is there in 4K, which the card pins on the thumbnail.
--
-- Stored rather than asked for: YouTube's Data API answers `hd` or `sd` and
-- nothing finer, and the resolution of the actual streams sits behind
-- fileDetails, which needs the owner's OAuth rather than the API key the
-- importer uses. So this is ours to state.
--
-- Default true, because every session so far was filmed on the same rig at 4K
-- 60fps and the landing page says as much. An upload that is not gets unticked
-- by hand in the match form.
alter table public.matches
  add column is_4k boolean not null default true;

comment on column public.matches.is_4k is
  'Upload is available in 4K. Shown as a pin on the video card.';
