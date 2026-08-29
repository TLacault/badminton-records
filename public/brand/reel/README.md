# Reel bookends

Drop `intro.mp4` and `outro.mp4` here and the reel maker picks them up on its
own — there is no upload, because there is only ever one of each and they
belong to the channel rather than to any single reel.

Anything ffmpeg can read will do. They are letterboxed into the reel's own
frame rather than cropped, so an intro cut for a different aspect ratio is
padded with black instead of losing its edges, and a silent one is given a
silent audio track so the joins still work.

Each is a checkbox in the reel's **Look** panel, and the checkbox is disabled
while the file is missing.
