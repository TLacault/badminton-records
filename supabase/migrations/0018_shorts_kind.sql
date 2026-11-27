-- The vertical video is a Short: `edit` becomes `shorts`, in the kind and in the render maps.

alter table public.matches drop constraint matches_video_kind_check;
update public.matches set video_kind = 'shorts' where video_kind = 'edit';
alter table public.matches
  add constraint matches_video_kind_check check (video_kind in ('raw', 'match', 'highlights', 'shorts'));
update public.matches
  set edit_maps = (edit_maps - 'edit') || jsonb_build_object('shorts', edit_maps -> 'edit')
  where edit_maps ? 'edit';
