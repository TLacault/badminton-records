#!/usr/bin/env python3
"""Badminton Records brand kit: traces logo.png into SVGs and writes every export.

Run from anywhere: python3 brand/build.py   (needs magick, potrace, fontTools)
Outputs land in brand/svg/ and brand/png/. logo.png is the only hand-made input.
"""
import re, subprocess, tempfile
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent
SVG, PNG = ROOT / "svg", ROOT / "png"
INK, CRIMSON, BRIGHT, WHITE = "#08070a", "#ba0925", "#d40f2c", "#ffffff"
# trace palette: what the AI-rendered shading collapses to (flat esport look)
LAYERS = {"7a0a1e": "#7a0a1e", "c8183a": CRIMSON, "c4c4ca": "#c8c7cd", "f6f6f8": WHITE}
UP = 4  # upscale before tracing, smoother curves


def sh(*a):
    subprocess.run([str(x) for x in a], check=True)


def trace(pbm: Path) -> tuple[str, str]:
    """potrace one bitmap -> (viewBox, <g> markup with fill #000)."""
    out = pbm.with_suffix(".svg")
    sh("potrace", pbm, "-s", "-t", 40, "-a", 1.1, "-O", 0.4, "-o", out)
    s = out.read_text()
    return re.search(r'viewBox="([^"]+)"', s)[1], re.search(r"(<g transform=.*?</g>)", s, re.S)[1]


def trace_mark(tmp: Path):
    src = tmp / "src.png"
    sh("magick", ROOT / "logo.png", "-trim", "+repage", "-bordercolor", "none", "-border", 8, src)
    sh("magick", "-size", "1x1", "xc:#0a0708", *[f"xc:#{c}" for c in LAYERS], "+append", tmp / "pal.png")
    sh("magick", src, "-background", "#0a0708", "-alpha", "remove", "-statistic", "median", 5,
       "-filter", "Lanczos", "-resize", f"{UP*100}%", "-statistic", "median", 13,
       "+dither", "-remap", tmp / "pal.png", tmp / "q.png")
    sh("magick", src, "-alpha", "extract", "-filter", "Lanczos", "-resize", f"{UP*100}%",
       "-blur", "0x3", "-threshold", "50%", "-negate", tmp / "sil.pbm")
    for c in LAYERS:
        sh("magick", tmp / "q.png", "-fill", "white", "+opaque", f"#{c}", "-fill", "black",
           "-opaque", f"#{c}", "-morphology", "Open", "Disk:2", tmp / f"{c}.pbm")
    # mono stencil = silhouette minus the ink outlines
    sh("magick", tmp / "q.png", "-fill", "white", "-opaque", "#0a0708", "-fill", "black", "+opaque", "white",
       "-morphology", "Open", "Disk:2", tmp / "mono.pbm")

    vb, sil = trace(tmp / "sil.pbm")
    colour = [sil.replace('fill="#000000"', f'fill="{INK}"', 1)]
    for c, fill in LAYERS.items():
        colour.append(trace(tmp / f"{c}.pbm")[1].replace('fill="#000000"', f'fill="{fill}"', 1))
    mono = re.sub(r'\s*fill="#000000"', "", trace(tmp / "mono.pbm")[1], count=1)
    w, h = (float(x) for x in vb.split()[2:])
    return w, h, "\n".join(colour), mono


def text_path(font: TTFont, text: str, tracking: float) -> tuple[str, float]:
    """Glyph outlines of `text` in font units, baseline y=0, y down. Returns (d, advance width)."""
    gs, cmap, x, d = font.getGlyphSet(), font.getBestCmap(), 0.0, []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        d.append(pen.getCommands())
        x += gs[g].width + tracking
    return " ".join(d), x - tracking


def wordmark(font, top_fill, bottom_fill):
    """BADMINTON over RECORDS, RECORDS scaled up so both lines share one width.
    Returns (markup, width, height) in units where BADMINTON's cap height = 100."""
    cap = font["OS/2"].sCapHeight
    d1, w1 = text_path(font, "BADMINTON", 20)
    d2, w2 = text_path(font, "RECORDS", 20)
    s1 = 100 / cap
    s2 = s1 * w1 / w2
    gap = 22
    h2 = cap * s2
    g = (f'<path transform="translate(0 100) scale({s1:.5f})" fill="{top_fill}" d="{d1}"/>'
         f'<path transform="translate(0 {100 + gap + h2:.2f}) scale({s2:.5f})" fill="{bottom_fill}" d="{d2}"/>')
    return g, w1 * s1, 100 + gap + h2


def svg_doc(w, h, body, bg=None):
    rect = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" '
            f'width="{w:.0f}" height="{h:.0f}">{rect}{body}</svg>\n')


def main():
    SVG.mkdir(exist_ok=True); PNG.mkdir(exist_ok=True)
    font = TTFont(ROOT / "fonts/BarlowCondensed-BlackItalic.ttf")
    tagfont = TTFont(ROOT / "fonts/BarlowCondensed-ExtraBoldItalic.ttf")
    with tempfile.TemporaryDirectory() as t:
        mw, mh, colour, mono = trace_mark(Path(t))

    def mark(x, y, size, mono_fill=None):
        k = size / mh
        body = f'<g fill="{mono_fill}">{mono}</g>' if mono_fill else colour
        return f'<g transform="translate({x:.1f} {y:.1f}) scale({k:.5f})">{body}</g>'

    S = 1000  # mark height in lockups
    files = {}
    # --- symbol
    files["logo"] = svg_doc(mw, mh, colour)
    files["logo-mono-white"] = svg_doc(mw, mh, f'<g fill="{WHITE}">{mono}</g>')
    files["logo-mono-crimson"] = svg_doc(mw, mh, f'<g fill="{CRIMSON}">{mono}</g>')
    files["logo-mono-ink"] = svg_doc(mw, mh, f'<g fill="{INK}">{mono}</g>')

    # --- lockups: (on dark: white + crimson) and (on light: ink + crimson)
    for tone, top, mono_fill in (("dark", WHITE, WHITE), ("light", INK, INK)):
        wm, ww, wh = wordmark(font, top, CRIMSON)
        # horizontal: text block = 62% of mark height, vertically centred
        k = 0.62 * S / wh
        mwid = S * mw / mh
        gx = 0.06 * S
        tx, ty = mwid + gx, (S - wh * k) / 2
        txt = f'<g transform="translate({tx:.1f} {ty:.1f}) scale({k:.4f}) skewX(0)">{wm}</g>'
        W = tx + ww * k + 10
        files[f"lockup-horizontal-{tone}"] = svg_doc(W, S, mark(0, 0, S) + txt)
        files[f"lockup-horizontal-{tone}-mono"] = svg_doc(
            W, S, mark(0, 0, S, mono_fill) + txt.replace(CRIMSON, mono_fill))
        # stacked: mark on top, text block 1.25x mark width below
        k2 = 1.1 * mwid / ww
        pad = 0.06 * S
        Wt = ww * k2 + 2 * pad
        Hs = S + 0.1 * S + wh * k2 + pad
        mx = (Wt - mwid) / 2
        txt2 = f'<g transform="translate({pad:.1f} {S * 1.1:.1f}) scale({k2:.4f})">{wm}</g>'
        files[f"lockup-stacked-{tone}"] = svg_doc(Wt, Hs, mark(mx, 0, S) + txt2)
        files[f"lockup-stacked-{tone}-mono"] = svg_doc(
            Wt, Hs, mark(mx, 0, S, mono_fill) + txt2.replace(CRIMSON, mono_fill))

    # --- wordmark alone (for the intro, overlays)
    for tone, top in (("dark", WHITE), ("light", INK)):
        wm, ww, wh = wordmark(font, top, CRIMSON)
        files[f"wordmark-{tone}"] = svg_doc(ww + 4, wh + 4, f'<g transform="translate(2 2)">{wm}</g>')

    # --- YouTube avatar 800x800 (shown as a circle): mark on crimson-lit ink
    av = (f'<defs><radialGradient id="g" cx="50%" cy="45%" r="60%">'
          f'<stop offset="0" stop-color="#3a0812"/><stop offset="1" stop-color="{INK}"/></radialGradient></defs>'
          f'<rect width="800" height="800" fill="url(#g)"/>' + mark((800 - 560 * mw / mh) / 2, 120, 560))
    files["avatar"] = svg_doc(800, 800, av)

    # --- YouTube banner 2560x1440; safe area for all devices = centred 1546x423
    files["banner"] = svg_doc(2560, 1440, banner(font, tagfont, mark, mw, mh))

    for name, s in files.items():
        (SVG / f"{name}.svg").write_text(s)
    # PNG exports (transparent unless the SVG paints a background)
    sizes = {"logo": 1024, "logo-mono-white": 1024, "logo-mono-crimson": 1024, "logo-mono-ink": 1024,
             "avatar": 800, "banner": 2560}
    for name in files:
        w = sizes.get(name, 2000)
        sh("magick", "-background", "none", "-density", 300, SVG / f"{name}.svg",
           "-resize", f"{w}x", PNG / f"{name}.png")
    for px in (16, 32, 48, 180, 512):  # favicons / app icons from the symbol
        sh("magick", "-background", "none", "-density", 300, SVG / "logo.svg", "-resize", f"{px}x{px}",
           "-gravity", "center", "-extent", f"{px}x{px}", PNG / f"icon-{px}.png")
    print(f"wrote {len(files)} svg + png exports to {ROOT}")


def banner(font, tagfont, mark, mw, mh):
    W, H = 2560, 1440
    # angular crimson slashes on both edges, esport style
    slashes = []
    for i, (x, w, op) in enumerate([(-700, 420, .95), (-250, 60, .6), (-150, 22, .45), (-80, 110, .22)]):
        pts = f"{x},{H} {x + w},{H} {x + w + 760},0 {x + 760},0"
        slashes.append(f'<polygon points="{pts}" fill="{CRIMSON}" opacity="{op}"/>')
    left = "".join(slashes)
    right = f'<g transform="translate({W} {H}) rotate(180)">{left}</g>'
    # centre lockup in the safe area (1546x423 around the middle)
    wm, ww, wh = wordmark(font, WHITE, CRIMSON)
    mhgt = 330
    mwid = mhgt * mw / mh
    k = 0.66 * mhgt / wh
    tw = ww * k
    total = mwid + 40 + tw
    x0 = (W - total) / 2
    y0 = H / 2 - mhgt / 2 - 20
    lock = mark(x0, y0, mhgt) + f'<g transform="translate({x0 + mwid + 40:.1f} {y0 + (mhgt - wh * k) / 2:.1f}) scale({k:.4f})">{wm}</g>'
    # tagline pill under the lockup
    tag = "MATCHES · SCORED · REPLAYED"  # placeholder copy, Tim decides
    cap = tagfont["OS/2"].sCapHeight
    d, tw2 = text_path(tagfont, tag, 60)
    ts = 30 / cap
    pw, ph = tw2 * ts + 70, 58
    px, py = (W - pw) / 2, y0 + mhgt + 28
    pill = (f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph}" rx="{ph / 2}" fill="{CRIMSON}"/>'
            f'<path transform="translate({px + 35:.1f} {py + ph / 2 + 15:.1f}) scale({ts:.5f})" fill="{WHITE}" d="{d}"/>')
    bg = (f'<defs><radialGradient id="b" cx="50%" cy="50%" r="55%">'
          f'<stop offset="0" stop-color="#2a0710"/><stop offset="1" stop-color="{INK}"/></radialGradient>'
          f'<linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="{INK}" stop-opacity="0"/>'
          f'<stop offset=".5" stop-color="{INK}" stop-opacity=".85"/><stop offset="1" stop-color="{INK}" stop-opacity="0"/></linearGradient></defs>'
          f'<rect width="{W}" height="{H}" fill="url(#b)"/>')
    # big ghosted mark behind, fills the TV-only area
    ghost = f'<g opacity=".07">{mark(W / 2 - 700 * mw / mh, H / 2 - 700, 1400, WHITE)}</g>'
    return bg + left + right + ghost + f'<rect x="560" y="0" width="1440" height="{H}" fill="url(#f)" opacity=".6"/>' + lock + pill


if __name__ == "__main__":
    main()
