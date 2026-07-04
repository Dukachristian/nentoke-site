#!/usr/bin/env python3
"""Nentoke Records — street-art cover treatment.

Turns any source image into a high-contrast, two-spot-colour SCREENPRINT: a
paper ground, a halftone accent screen through the midtones, and a darker ink
screen through the shadows. The result reads as a paste-up poster / silk-screen
sleeve rather than a photograph.

Pipeline
--------
1. crop to square, desaturate to luminance, punch the contrast
2. split luminance into two coverage maps: midtones → ACCENT, shadows → INK
3. render each as an angled halftone dot screen (dot area ∝ coverage)
4. lay accent down first, ink on top, over the PAPER ground; add spray grain

Usage
-----
    python scripts/street_treat.py IN.jpg OUT.jpg \
        --paper "#F2ECD9" --accent "#FF3B2E" --ink "#0D0D0F" --dot 7

Every colour and the dot size are CLI flags, so the label can retune the whole
catalogue's look from one place. Requires: numpy, pillow.
"""
import argparse
import numpy as np
from PIL import Image, ImageOps


def hex_rgb(s):
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def center_square(im):
    w, h = im.size
    s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def halftone(coverage, dot, angle_deg):
    """Round dots on a rotated lattice; dot AREA tracks `coverage` (0..1).

    Returns a boolean mask of inked pixels."""
    h, w = coverage.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    a = np.deg2rad(angle_deg)
    u = xx * np.cos(a) + yy * np.sin(a)
    v = -xx * np.sin(a) + yy * np.cos(a)
    # fractional position inside each cell, recentred to [-0.5, 0.5]
    fu = (u / dot) % 1.0 - 0.5
    fv = (v / dot) % 1.0 - 0.5
    dist = np.sqrt(fu * fu + fv * fv) / 0.7071  # 0 at centre, ~1 at corner
    radius = np.sqrt(np.clip(coverage, 0, 1))   # area ∝ coverage
    return dist < radius


def treat(src, out, paper, accent, ink, dot=7.0, size=1200, contrast=2, gamma=0.9, grain=0.06, seed=7):
    im = Image.open(src).convert('L')
    im = center_square(im).resize((size, size), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=contrast)
    lum = (np.asarray(im, np.float64) / 255.0) ** gamma

    # spray grain nudges the coverage maps so dot edges break up like real print
    rng = np.random.default_rng(seed)
    n = rng.standard_normal(lum.shape) * grain

    # midtones carry the accent; shadows carry the ink
    cov_accent = np.clip(1.0 - np.abs(lum - 0.45) / 0.45 + n, 0, 1) * 0.92
    cov_ink = np.clip((0.42 - lum) / 0.42 + n, 0, 1)

    ink_accent = halftone(cov_accent, dot * 1.15, 15)
    ink_dark = halftone(cov_ink, dot, 45)

    canvas = np.empty((size, size, 3), np.float64)
    canvas[:] = hex_rgb(paper)
    canvas[ink_accent] = hex_rgb(accent)
    canvas[ink_dark] = hex_rgb(ink)   # darkest screen prints last, on top

    # faint speckle so flat paper areas aren't dead-clean
    speck = rng.random(lum.shape) < 0.004
    canvas[speck] = hex_rgb(ink)

    Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), 'RGB').save(out, quality=90)
    print(f'treated {out}')


def main():
    ap = argparse.ArgumentParser(description='Street-art screenprint cover treatment.')
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--paper', default='#F2ECD9', help='background / paper colour')
    ap.add_argument('--accent', default='#FF3B2E', help='midtone spot colour')
    ap.add_argument('--ink', default='#0D0D0F', help='shadow spot colour')
    ap.add_argument('--dot', type=float, default=7.0, help='halftone dot pitch (px)')
    ap.add_argument('--size', type=int, default=1200)
    a = ap.parse_args()
    treat(a.src, a.out, a.paper, a.accent, a.ink, dot=a.dot, size=a.size)


if __name__ == '__main__':
    main()
