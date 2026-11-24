# Badminton Records brand kit

`logo.png` (from ChatGPT) is the only hand-made input. `python3 brand/build.py` traces it to vector
and writes everything else (needs `magick`, `potrace`, `fontTools`). `png/` is regenerated, not committed.

| Use | File |
|---|---|
| YouTube profile picture (800×800, shown as a circle) | `png/avatar.png` |
| YouTube banner (2560×1440, logo inside the 1546×423 safe area) | `png/banner.png` |
| Symbol, full colour / one colour | `svg/logo.svg`, `svg/logo-mono-{white,crimson,ink}.svg` |
| Symbol + name, side by side | `svg/lockup-horizontal-{dark,light}[-mono].svg` |
| Symbol + name, stacked | `svg/lockup-stacked-{dark,light}[-mono].svg` |
| Name only | `svg/wordmark-{dark,light}.svg` |
| Favicons / app icons | `png/icon-{16,32,48,180,512}.png` |

`dark` = for dark backgrounds (white + crimson text), `light` = for light ones (ink + crimson).

Palette: ink `#08070a` · crimson `#ba0925` · bright red `#d40f2c` · white. Type: Barlow Condensed
Black/ExtraBold Italic (`fonts/`, SIL OFL), the app's display face. Text in the SVGs is outlined, no font needed.
