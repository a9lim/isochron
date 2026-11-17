# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy"]
# ///
"""Earth's orbit in the sim's form (src/engine/orbit.js, OrbitCycles): its terms fitted to Berger and
Loutre 1991's solution for the last WINDOW kyr (NOAA's orbit91: tools/earth/README.md), printed as the
EARTH_CYCLES constant orbit.js keeps.

    uv run --no-project --with numpy --with scipy python -I tools/earth/orbit-fit.py

The sim's orbit is a sum of eccentricity terms, of obliquity terms and a steady precession of the perihelion
(the sun's longitude at perihelion: orbit91's, from the moving equinox, plus 180°). Each series takes its terms
by matching pursuit (the residual's strongest period, then every term refitted by least squares); the
means are then shifted so the present (1950, the solution's origin) is exact. The sim's time runs forward from today, past the
solution's end, so these terms are Earth's orbit continued as the sim's few cycles.
"""
import pathlib

import numpy as np
from scipy.optimize import least_squares

WINDOW = 5000   # kyr of the past the terms are fitted over (the whole solution)
NE, NO = 12, 10   # eccentricity's terms and obliquity's (8 and 6: rms 0.0054 and 0.18°; 12 and 10: 0.0043 and 0.05°)
src = pathlib.Path(__file__).resolve().parent / '.cache' / 'bl91' / 'orbit91'
rows = [l.split() for l in src.read_text().splitlines()]
rows = [r for r in rows if len(r) == 9 and r[0].lstrip('-').isdigit()]
d = np.array([[float(x) for x in r[:4]] for r in rows])
d = d[d[:, 0] >= -WINDOW]
t, ecc, om, obl = d[:, 0], d[:, 1], d[:, 2], d[:, 3]


def model(p, tt):
    out = np.full_like(tt, p[0])
    for j in range((len(p) - 1) // 3):
        P, a, ph = p[1 + 3 * j: 4 + 3 * j]
        out += a * np.cos(2 * np.pi * tt / P + ph)
    return out


def fit(y, k, pmin=15, pmax=3000):
    """k terms by matching pursuit: the residual's strongest period on a fine grid (a linear fit of
    cos and sin at each), then every period, amplitude and phase refitted together."""
    p = np.array([y.mean()])
    for _ in range(k):
        r = y - model(p, t)
        best = (0, None)
        for P in np.exp(np.linspace(np.log(pmin), np.log(pmax), 6000)):
            A = np.stack([np.cos(2 * np.pi * t / P), np.sin(2 * np.pi * t / P)], 1)
            c, *_ = np.linalg.lstsq(A, r, rcond=None)
            power = np.hypot(*c)
            if power > best[0]:
                best = (power, (P, power, np.arctan2(-c[1], c[0])))
        p = np.concatenate([p, best[1]])
        p = least_squares(lambda q: model(q, t) - y, p).x
    for j in range(k):   # amplitudes positive, phases in [0, 2π)
        if p[2 + 3 * j] < 0:
            p[2 + 3 * j] *= -1
            p[3 + 3 * j] += np.pi
        p[3 + 3 * j] %= 2 * np.pi
    order = np.argsort(-p[2::3][:k])
    p = np.concatenate([p[:1]] + [p[1 + 3 * j: 4 + 3 * j] for j in order])
    shift = y[t == 0][0] - model(p, np.array([0.0]))[0]
    p[0] += shift   # the present exact
    rms = np.sqrt(np.mean((model(p, t) - y) ** 2))
    return p, rms, shift


pe, re, se = fit(ecc, NE)
po, ro, so = fit(np.radians(obl), NO)
# The perihelion: the sun's longitude at it, unwrapped, its mean rate over the window.
w = np.unwrap(np.radians(om + 180))
rate = np.polyfit(t, w, 1)[0]
w0 = (np.radians(om[t == 0][0] + 180)) % (2 * np.pi)

terms = lambda p, k: ', '.join(f'{{ P: {p[1 + 3 * j]:.3f}, a: {p[2 + 3 * j]:.6g}, p: {p[3 + 3 * j]:.4f} }}' for j in range(k))
print(f'// fitted over the last {WINDOW} kyr: eccentricity rms {re:.5f} (the present shifted {se:+.5f}), obliquity {np.degrees(ro):.3f}° ({np.degrees(so):+.3f}°)')
print('export const EARTH_CYCLES = {')
print(f'  e0: {pe[0]:.6f}, eTerms: [{terms(pe, NE)}],')
print(f'  ob0: {po[0]:.6f}, obTerms: [{terms(po, NO)}],')
print(f'  precP: {2 * np.pi / rate:.3f}, prec0: {w0:.4f},')
print('};')
