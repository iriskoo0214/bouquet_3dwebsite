"""Bake the bouquet viewer's studio lighting into an equirectangular HDR for <model-viewer>.

model-viewer can't take extra directional lights, only an environment image. So we draw the
light rig as glowing patches on a sphere, the way Saltmere's fieldStudioEnvironment() bakes
glowing panels. The light positions follow Saltmere's Bloom study rig (inspectCutting):

    hemisphere  sky above / ground below
    key         at (-3, 5, 4)   upper left, in front
    back        at ( 3, 2, -2)  right, behind  -> rim light on the petal edges
    fill        at ( 4, 0, 3)   low right, in front

Directions use the viewer's frame: +Y up, the bouquet faces +Z (MODEL_SPEC), camera starts on +Z.
A directional light of intensity I lights a matte surface like a patch of solid angle W
with radiance I*pi/W, which is how each patch's brightness is set.

Usage:  python3 tools/studio_env.py            -> public/env/studio.hdr
"""
import math
import os
import struct
import sys

W, H = 512, 256
# Saltmere's rig is low-key. The bouquet sits on bright photo backdrops and white flowers must stay white,
# so the whole rig is scaled to match the brightness of model-viewer's 'neutral' environment.
GAIN = 1.0
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'env', 'studio.hdr')


def srgb_to_linear(hex_color):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(ch((hex_color >> s) & 255) for s in (16, 8, 0))


def norm(v):
    l = math.sqrt(sum(x * x for x in v))
    return tuple(x / l for x in v)


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# Saltmere's placement, but neutral-warm colours: its sky #e4edff, back #b9d3ff and violet fill #898fe9
# suit blue flowers at night and tint white flowers blue on the cream photo backdrops.
# The sky and ground follow the backdrop (warm white above, beige floor below), and the fill is
# raised so the light stays soft and even, as the product photos were shot.
HEMI = dict(sky=srgb_to_linear(0xFFFBF5), ground=srgb_to_linear(0xC9BFB2), intensity=0.78)
# (colour, intensity, position, inner radius deg, outer radius deg)
LIGHTS = [
    (0xFFF4E8, 1.05, (-3, 5, 4), 16, 34),   # key: large soft box, upper left in front, a touch warm
    (0xF7F8FA, 0.70, (3, 2, -2), 12, 28),   # back: white rim light from behind
    (0xFFF8F0, 0.32, (4, 0, 3), 22, 44),    # fill: broad, lifts the shadow side
]


def build_patches():
    patches = []
    for hex_color, intensity, pos, r_in, r_out in LIGHTS:
        mid = math.radians((r_in + r_out) / 2)
        solid = 2 * math.pi * (1 - math.cos(mid))
        radiance = intensity * math.pi / solid
        col = srgb_to_linear(hex_color)
        patches.append((norm(pos), math.cos(math.radians(r_out)), math.cos(math.radians(r_in)),
                        tuple(c * radiance for c in col)))
    return patches


def radiance(d, patches):
    # Hemisphere light: blends ground to sky by how much the direction points up.
    k = d[1] * 0.5 + 0.5
    rgb = [HEMI['intensity'] * (g + (s - g) * k) for s, g in zip(HEMI['sky'], HEMI['ground'])]
    for center, cos_out, cos_in, col in patches:
        w = smoothstep(cos_out, cos_in, d[0] * center[0] + d[1] * center[1] + d[2] * center[2])
        if w > 0:
            for i in range(3):
                rgb[i] += col[i] * w
    return [c * GAIN for c in rgb]


def rgbe(rgb):
    m = max(rgb)
    if m < 1e-32:
        return b'\x00\x00\x00\x00'
    f, e = math.frexp(m)
    s = f * 256 / m
    return bytes((int(rgb[0] * s), int(rgb[1] * s), int(rgb[2] * s), e + 128))


def main():
    patches = build_patches()
    rows = []
    for y in range(H):
        # Row 0 is straight up. Longitude follows three.js equirectUv: u = atan(z, x) / 2pi + 0.5.
        el = (0.5 - (y + 0.5) / H) * math.pi
        ce, se = math.cos(el), math.sin(el)
        row = bytearray()
        for x in range(W):
            phi = ((x + 0.5) / W - 0.5) * 2 * math.pi
            row += rgbe(radiance((ce * math.cos(phi), se, ce * math.sin(phi)), patches))
        rows.append(bytes(row))
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as fh:
        fh.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
        fh.write(f'-Y {H} +X {W}\n'.encode())
        for r in rows:
            fh.write(r)
    print(f'wrote {out} ({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
