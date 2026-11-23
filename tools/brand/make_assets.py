#!/usr/bin/env python3
"""Generate Citestar's GitHub assets: README banners, social preview, avatar.

The look matches the landing page: an astronomer's photographic plate with
emulsion grain, the cited works circled and joined into a constellation.

Text is converted to SVG paths (with GPOS kerning), so the banners render with
the real typefaces on any machine without loading fonts. PNGs are rasterized
from the same SVGs with rsvg-convert.

Requirements: Python 3.10+, fontTools, rsvg-convert (librsvg).
Fonts (SIL Open Font License) are downloaded from github.com/google/fonts into
the cache directory on first run.

Usage: python3 tools/brand/make_assets.py [--out docs/assets] [--fonts DIR]
"""

from __future__ import annotations

import argparse
import math
import random
import shutil
import subprocess
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GOOGLE_FONTS = "https://github.com/google/fonts/raw/main/ofl"
FONT_FILES = {
    "BodoniModa[opsz,wght].ttf": "bodonimoda/BodoniModa%5Bopsz%2Cwght%5D.ttf",
    "BodoniModa-Italic[opsz,wght].ttf": "bodonimoda/BodoniModa-Italic%5Bopsz%2Cwght%5D.ttf",
    "IBMPlexMono-Regular.ttf": "ibmplexmono/IBMPlexMono-Regular.ttf",
}

THEMES = {
    "light": {
        "paper": "#e5e8e2",
        "ink": "#14171b",
        "soft": "#4b525a",
        "rule": "#c2c7bf",
        "accent": "#a91f37",
        "star": "#181b20",
        "glow_a": ("#a91f37", 0.10),
        "glow_b": ("#365484", 0.10),
        "grain": (0, 0.20),
    },
    "dark": {
        "paper": "#0c0f15",
        "ink": "#ece8de",
        "soft": "#949ba7",
        "rule": "#262d3a",
        "accent": "#ff6f82",
        "star": "#f3eee1",
        "glow_a": ("#ff6f82", 0.11),
        "glow_b": ("#5c80d2", 0.15),
        "grain": (1, 0.10),
    },
}

# The works of the illustration, as on the landing page: (x, y) in 0..1 within
# the constellation box, label side, catalog number. Listening order.
WORKS = [
    (0.10, 0.27, "r", "Q12411055"),
    (0.34, 0.70, "r", "Q172850"),
    (0.60, 0.14, "r", "arXiv:1706.03762"),
    (0.88, 0.48, "l", "Q114819"),
    (0.66, 0.86, "l", "Q187745"),
]

GLINT = (
    "M0 -10 C0.8 -2.2 2.2 -0.8 10 0 C2.2 0.8 0.8 2.2 0 10 "
    "C-0.8 2.2 -2.2 0.8 -10 0 C-2.2 -0.8 -0.8 -2.2 0 -10Z"
)


# ---------------------------------------------------------------- fonts


def ensure_fonts(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, remote in FONT_FILES.items():
        target = directory / name
        if not target.exists():
            with urllib.request.urlopen(f"{GOOGLE_FONTS}/{remote}") as response:
                target.write_bytes(response.read())


class Face:
    """A static font instance that turns a string into kerned SVG paths."""

    def __init__(self, path: Path, axes: dict[str, float] | None = None) -> None:
        font = TTFont(path)
        if axes:
            font = instancer.instantiateVariableFont(font, axes)
        self.font = font
        self.upem = font["head"].unitsPerEm
        self.cmap = font.getBestCmap()
        self.hmtx = font["hmtx"]
        self.glyphs = font.getGlyphSet()
        self.kerning = self._read_kerning()
        self._paths: dict[str, str] = {}

    def _read_kerning(self):
        """Pair adjustments of the 'kern' feature (GPOS PairPos formats 1 and 2)."""
        pairs: dict[tuple[str, str], int] = {}
        classes: list = []
        if "GPOS" not in self.font:
            return pairs, classes
        gpos = self.font["GPOS"].table
        indices = {
            i
            for record in gpos.FeatureList.FeatureRecord
            if record.FeatureTag == "kern"
            for i in record.Feature.LookupListIndex
        }
        for index in sorted(indices):
            lookup = gpos.LookupList.Lookup[index]
            for sub in lookup.SubTable:
                if lookup.LookupType == 9:
                    sub = sub.ExtSubTable
                if getattr(sub, "LookupType", 2) != 2:
                    continue
                if sub.Format == 1:
                    for first, pair_set in zip(sub.Coverage.glyphs, sub.PairSet):
                        for record in pair_set.PairValueRecord:
                            value = getattr(record.Value1, "XAdvance", 0) if record.Value1 else 0
                            if value and (first, record.SecondGlyph) not in pairs:
                                pairs[(first, record.SecondGlyph)] = value
                elif sub.Format == 2:
                    classes.append(sub)
        return pairs, classes

    def _kern(self, left: str, right: str) -> int:
        pairs, classes = self.kerning
        if (left, right) in pairs:
            return pairs[(left, right)]
        for sub in classes:
            if left not in sub.Coverage.glyphs:
                continue
            c1 = sub.ClassDef1.classDefs.get(left, 0)
            c2 = sub.ClassDef2.classDefs.get(right, 0)
            value = sub.Class1Record[c1].Class2Record[c2].Value1
            if value is not None and getattr(value, "XAdvance", 0):
                return value.XAdvance
        return 0

    def _glyph_path(self, name: str) -> str:
        if name not in self._paths:
            pen = SVGPathPen(self.glyphs)
            self.glyphs[name].draw(pen)
            self._paths[name] = pen.getCommands()
        return self._paths[name]

    def layout(self, text: str, tracking: float = 0.0) -> tuple[list[tuple[str, float]], float]:
        """Glyph names with x offsets in font units, and the total advance."""
        names = [self.cmap.get(ord(ch), ".notdef") for ch in text]
        placed, x = [], 0.0
        for i, name in enumerate(names):
            placed.append((name, x))
            x += self.hmtx[name][0] + tracking * self.upem
            if i + 1 < len(names):
                x += self._kern(name, names[i + 1])
        return placed, x - (tracking * self.upem if names else 0)

    def width(self, text: str, size: float, tracking: float = 0.0) -> float:
        return self.layout(text, tracking)[1] * size / self.upem

    def svg(self, text: str, x: float, y: float, size: float, fill: str, tracking: float = 0.0) -> str:
        placed, _ = self.layout(text, tracking)
        scale = size / self.upem
        parts = [
            f'<path transform="translate({gx:.1f} 0)" d="{self._glyph_path(name)}"/>'
            for name, gx in placed
            if self._glyph_path(name)
        ]
        return (
            f'<g fill="{fill}" transform="translate({x:.2f} {y:.2f}) scale({scale:.6f} {-scale:.6f})">'
            + "".join(parts)
            + "</g>"
        )


@dataclass
class Faces:
    display: Face  # Bodoni at its largest optical size, for the wordmark
    text: Face  # Bodoni at a mid optical size: sturdier hairlines for the tagline
    italic: Face
    mono: Face


def load_faces(directory: Path) -> Faces:
    return Faces(
        display=Face(directory / "BodoniModa[opsz,wght].ttf", {"wght": 500, "opsz": 96}),
        text=Face(directory / "BodoniModa[opsz,wght].ttf", {"wght": 500, "opsz": 28}),
        italic=Face(directory / "BodoniModa-Italic[opsz,wght].ttf", {"wght": 500, "opsz": 28}),
        mono=Face(directory / "IBMPlexMono-Regular.ttf"),
    )


# ---------------------------------------------------------------- drawing


def defs(theme: dict, w: int, h: int) -> str:
    grain_level, _ = theme["grain"]
    c = grain_level
    (ga, oa), (gb, ob) = theme["glow_a"], theme["glow_b"]
    return f"""<defs>
  <filter id="grain" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 1.1 -0.2"/>
  </filter>
  <radialGradient id="glow-a" cx="{w * 0.8:.0f}" cy="{h * 0.15:.0f}" r="{w * 0.45:.0f}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="{ga}" stop-opacity="{oa}"/><stop offset="1" stop-color="{ga}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glow-b" cx="{w * 0.12:.0f}" cy="{h * 0.85:.0f}" r="{w * 0.4:.0f}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="{gb}" stop-opacity="{ob}"/><stop offset="1" stop-color="{gb}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="halo">
    <stop offset="0" stop-color="{theme['star']}" stop-opacity="1"/>
    <stop offset="0.35" stop-color="{theme['star']}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="{theme['star']}" stop-opacity="0"/>
  </radialGradient>
  <path id="glint" d="{GLINT}"/>
</defs>"""


def ground(theme: dict, w: int, h: int) -> str:
    return (
        f'<rect width="{w}" height="{h}" fill="{theme["paper"]}"/>'
        f'<rect width="{w}" height="{h}" fill="url(#glow-a)"/>'
        f'<rect width="{w}" height="{h}" fill="url(#glow-b)"/>'
    )


def grain(theme: dict, w: int, h: int, strength: float = 1.0) -> str:
    _, opacity = theme["grain"]
    opacity = round(opacity * strength, 3)
    return f'<rect width="{w}" height="{h}" filter="url(#grain)" opacity="{opacity}"/>'


def star_field(rng: random.Random, box: tuple[float, float, float, float], count: int, size: float) -> str:
    """Field stars; brightness follows a steep power law, so most are faint."""
    x0, y0, x1, y1 = box
    stars = []
    for _ in range(count):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        m = rng.random() ** 9
        r = (0.45 + m * 1.7) * size * 2.2
        o = 0.3 + min(0.7, m * 3)
        stars.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="url(#halo)" opacity="{o:.2f}"/>')
    return "".join(stars)


def registration(theme: dict, w: int, h: int, inset: float, arm: float = 14) -> str:
    s = theme["soft"]
    lines = []
    for cx, cy, dx, dy in ((inset, inset, 1, 1), (w - inset, inset, -1, 1), (inset, h - inset, 1, -1), (w - inset, h - inset, -1, -1)):
        lines.append(f'<path d="M{cx} {cy + dy * arm} V{cy} H{cx + dx * arm}" fill="none" stroke="{s}" stroke-width="1" opacity="0.6"/>')
    return "".join(lines)


def constellation(theme: dict, faces: Faces, box: tuple[float, float, float, float], scale: float, active: int = 0) -> str:
    x0, y0, x1, y1 = box
    pts = [(x0 + x * (x1 - x0), y0 + y * (y1 - y0), side, qid) for x, y, side, qid in WORKS]
    accent, soft = theme["accent"], theme["soft"]
    out = []
    path = " ".join(f"{x:.1f},{y:.1f}" for x, y, _, _ in pts)
    out.append(f'<polyline points="{path}" fill="none" stroke="{accent}" stroke-width="{0.9 * scale:.2f}" opacity="0.55"/>')
    for i, (x, y, side, qid) in enumerate(pts):
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{5.2 * scale:.2f}" fill="url(#halo)"/>')
        rot = (-14, 9, -6, 18, -20)[i]
        width = 2.2 if i == active else 1.2
        out.append(
            f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{17 * scale:.1f}" ry="{14.5 * scale:.1f}" '
            f'transform="rotate({rot} {x:.1f} {y:.1f})" fill="none" stroke="{accent}" '
            f'stroke-width="{width * scale:.2f}" opacity="{1 if i == active else 0.75}"/>'
        )
        size = 11.5 * scale
        label_w = faces.mono.width(qid, size, 0.04)
        gap = 27 * scale
        lx = x + gap if side == "r" else x - gap - label_w
        out.append(faces.mono.svg(qid, lx, y + size * 0.35, size, accent if i == active else soft, 0.04))
        if i == active:
            out.append(
                f'<use href="#glint" transform="translate({x - 26 * scale:.1f} {y - 25 * scale:.1f}) '
                f'scale({0.62 * scale:.3f})" fill="{accent}"/>'
            )
    return "".join(out)


# Tagline per language: first line, then the second line as (italic accent, rest).
COPY = {
    "en": {
        "line1": "Every work they mention,",
        "accent": "right where",
        "rest": "they mention it.",
        "banner_label": "Pre-alpha · open source · Apache-2.0 · runs on your device",
        "social_label": "Open source · runs on your device · github.com/citestar",
        "title": "Citestar: every work they mention, right where they mention it.",
    },
    "it": {
        "line1": "Ogni opera citata,",
        "accent": "nel punto esatto",
        "rest": "in cui viene citata.",
        "banner_label": "Pre-alpha · open source · Apache-2.0 · gira sul tuo dispositivo",
        "social_label": "Open source · gira sul tuo dispositivo · github.com/citestar",
        "title": "Citestar: ogni opera citata, nel punto esatto in cui viene citata.",
    },
}


def headline(theme: dict, faces: Faces, copy: dict, x: float, y: float, size: float, line_gap: float) -> str:
    """Two-line tagline, the start of the second line in the italic accent."""
    ink, accent = theme["ink"], theme["accent"]
    out = [faces.text.svg(copy["line1"], x, y, size, ink)]
    y2 = y + line_gap
    out.append(faces.italic.svg(copy["accent"], x, y2, size, accent))
    rest_x = x + faces.italic.width(copy["accent"], size) + faces.text.width(" ", size)
    out.append(faces.text.svg(copy["rest"], rest_x, y2, size, ink))
    return "".join(out)


def wordmark(theme: dict, faces: Faces, x: float, y: float, size: float) -> str:
    """Glint + 'Citestar', with the glint centered on the cap height."""
    glint_size = size * 0.42
    cy = y - size * 0.36
    out = [
        f'<use href="#glint" transform="translate({x + glint_size / 2:.1f} {cy:.1f}) scale({glint_size / 20:.3f})" '
        f'fill="{theme["accent"]}"/>'
    ]
    out.append(faces.display.svg("Citestar", x + glint_size * 1.55, y, size, theme["ink"]))
    return "".join(out)


def label(theme: dict, faces: Faces, text: str, x: float, y: float, size: float) -> str:
    return faces.mono.svg(text.upper(), x, y, size, theme["soft"], 0.08)


def svg_doc(w: int, h: int, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
    )


SOCIAL_PREVIEW_LIMIT = 1_000_000  # bytes; GitHub's limit for repository social previews


def banner(theme: dict, faces: Faces, copy: dict) -> str:
    w, h = 1280, 400
    rng = random.Random(42)
    body = [defs(theme, w, h), ground(theme, w, h)]
    body.append(star_field(rng, (0, 0, w, h), 220, 1.0))
    body.append(star_field(rng, (720, 30, 1250, 370), 140, 1.1))
    body.append(constellation(theme, faces, (790, 70, 1200, 330), 1.0))
    body.append(wordmark(theme, faces, 72, 150, 76))
    body.append(headline(theme, faces, copy, 74, 226, 34, 44))
    body.append(label(theme, faces, copy["banner_label"], 76, 334, 14))
    body.append(registration(theme, w, h, 18))
    body.append(grain(theme, w, h))
    return svg_doc(w, h, "".join(body), copy["title"])


def social(theme: dict, faces: Faces, copy: dict) -> str:
    w, h = 1280, 640
    rng = random.Random(42)
    body = [defs(theme, w, h), ground(theme, w, h)]
    body.append(star_field(rng, (0, 0, w, h), 320, 1.2))
    body.append(star_field(rng, (700, 60, 1250, 600), 160, 1.3))
    body.append(constellation(theme, faces, (760, 120, 1200, 520), 1.35))
    body.append(wordmark(theme, faces, 84, 230, 104))
    body.append(headline(theme, faces, copy, 88, 336, 46, 60))
    body.append(label(theme, faces, copy["social_label"], 90, 540, 17))
    body.append(registration(theme, w, h, 24, 18))
    # Lighter grain: noise compresses badly, and GitHub caps social previews at 1 MB.
    body.append(grain(theme, w, h, 0.55))
    return svg_doc(w, h, "".join(body), copy["title"])


def avatar(theme: dict, faces: Faces) -> str:
    w = h = 512
    rng = random.Random(7)
    body = [defs(theme, w, h), ground(theme, w, h)]
    body.append(star_field(rng, (0, 0, w, h), 140, 1.4))
    c = w / 2
    body.append(
        f'<ellipse cx="{c}" cy="{c}" rx="150" ry="128" transform="rotate(-14 {c} {c})" '
        f'fill="none" stroke="{theme["accent"]}" stroke-width="5"/>'
    )
    body.append(f'<use href="#glint" transform="translate({c} {c}) scale(9.5)" fill="{theme["accent"]}"/>')
    body.append(grain(theme, w, h))
    return svg_doc(w, h, "".join(body), "Citestar")


# ---------------------------------------------------------------- output


def rasterize(svg: Path, png: Path, width: int) -> None:
    subprocess.run(["rsvg-convert", "--width", str(width), "--output", str(png), str(svg)], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=Path("docs/assets"))
    parser.add_argument("--fonts", type=Path, default=Path(tempfile.gettempdir()) / "citestar-fonts")
    args = parser.parse_args()
    if shutil.which("rsvg-convert") is None:
        raise SystemExit("rsvg-convert not found: install librsvg")

    ensure_fonts(args.fonts)
    faces = load_faces(args.fonts)
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    for lang, copy in COPY.items():
        suffix = "" if lang == "en" else f"-{lang}"
        for name in ("light", "dark"):
            svg = banner(THEMES[name], faces, copy)
            (out / f"banner{suffix}-{name}.svg").write_text(svg, encoding="utf-8")

    with tempfile.TemporaryDirectory() as tmp:
        social_svg = Path(tmp) / "social.svg"
        social_svg.write_text(social(THEMES["dark"], faces, COPY["en"]), encoding="utf-8")
        rasterize(social_svg, out / "social-preview.png", 1280)
        size = (out / "social-preview.png").stat().st_size
        if size >= SOCIAL_PREVIEW_LIMIT:
            raise SystemExit(f"social-preview.png is {size} bytes; GitHub accepts less than 1 MB")
        avatar_svg = Path(tmp) / "avatar.svg"
        avatar_svg.write_text(avatar(THEMES["dark"], faces), encoding="utf-8")
        rasterize(avatar_svg, out / "avatar.png", 512)

    for f in sorted(out.iterdir()):
        print(f"{f}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
