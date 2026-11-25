#!/usr/bin/env python3
"""Badminton Records brand kit: traces logo.png into SVGs and writes every export.

Run from anywhere: python3 brand/build.py   (needs magick, potrace, fontTools)
Outputs land in brand/svg/ and brand/png/. Hand-made by Tim, never overwritten:
logo.png (= png/logo.png), png/logo-mono-crimson.png, png/avatar.png, png/banner.png.
"""
import re
import subprocess
import tempfile
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent
SVG, PNG = ROOT / "svg", ROOT / "png"
INK, CRIMSON, WHITE = "#08070a", "#cb2543", "#ffffff"  # CRIMSON = the logo's own red
# trace palette = the logo's flat colours (its shading collapses onto these)
LAYERS = {"6a182a": "#6a182a", "cb2543": CRIMSON, "e5e5e8": "#e5e5e8"}
HAND = {"logo", "logo-mono-crimson"}  # PNGs Tim made; build only writes their SVG
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
    # one-colour version: traced from Tim's png/logo-mono-crimson.png (shape = its opaque pixels)
    sh("magick", PNG / "logo-mono-crimson.png", "-trim", "+repage", "-bordercolor", "none", "-border", 8,
       "-alpha", "extract", "-filter", "Lanczos", "-resize", f"{UP*100}%", "-blur", "0x2",
       "-threshold", "50%", "-negate", tmp / "mono.pbm")

    vb, sil = trace(tmp / "sil.pbm")
    colour = [sil.replace('fill="#000000"', f'fill="{INK}"', 1)]
    for c, fill in LAYERS.items():
        colour.append(trace(tmp / f"{c}.pbm")[1].replace('fill="#000000"', f'fill="{fill}"', 1))
    mvb, mono = trace(tmp / "mono.pbm")
    mono = re.sub(r'\s*fill="#000000"', "", mono, count=1)
    w, h = (float(x) for x in vb.split()[2:])
    return (w, h, "\n".join(colour)), (*(float(x) for x in mvb.split()[2:]), mono)


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
    with tempfile.TemporaryDirectory() as t:
        (mw, mh, colour), (nw, nh, mono) = trace_mark(Path(t))

    def mark(x, y, size, mono_fill=None):
        # mono is traced from its own file: fit it to the colour mark's box
        if mono_fill:
            k = min(size / nh, size * mw / mh / nw)
            return f'<g transform="translate({x:.1f} {y:.1f}) scale({k:.5f})" fill="{mono_fill}">{mono}</g>'
        return f'<g transform="translate({x:.1f} {y:.1f}) scale({size / mh:.5f})">{colour}</g>'

    S = 1000  # mark height in lockups
    files = {}
    # --- symbol
    files["logo"] = svg_doc(mw, mh, colour)
    for name, fill in (("white", WHITE), ("crimson", CRIMSON), ("ink", INK)):
        files[f"logo-mono-{name}"] = svg_doc(nw, nh, f'<g fill="{fill}">{mono}</g>')

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

    for name, s in files.items():
        (SVG / f"{name}.svg").write_text(s)
    # PNG exports (transparent unless the SVG paints a background)
    for name in files.keys() - HAND:
        w = 1024 if name.startswith("logo") else 2000
        sh("magick", "-background", "none", "-density", 300, SVG / f"{name}.svg",
           "-resize", f"{w}x", PNG / f"{name}.png")
    for px in (16, 32, 48, 180, 512):  # favicons / app icons from the symbol
        sh("magick", "-background", "none", "-density", 300, SVG / "logo.svg", "-resize", f"{px}x{px}",
           "-gravity", "center", "-extent", f"{px}x{px}", PNG / f"icon-{px}.png")
    print(f"wrote {len(files)} svg + png exports to {ROOT}")


if __name__ == "__main__":
    main()
