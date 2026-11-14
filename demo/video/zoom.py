#!/usr/bin/env python3
"""Smooth zoom for one recorded scene.

python3 zoom.py raw/review.mp4 raw/review.json out/review-zoom.mp4

Every 'zoom' mark eases in to its box over 0.6 s (smoothstep), holds, and eases
out at the next 'unzoom'. Implemented as a per-frame scale (eval=frame) followed
by a per-frame crop, so the motion is continuous with no zoompan jitter.
"""
import json
import subprocess
import sys

src, marks_path, out = sys.argv[1:4]
m = json.load(open(marks_path))
W, H = 1920, 1080
dpr_px = W / m["viewport"]["width"]  # page CSS px -> video px
EASE = 0.6
MAXZ = 2.0

segs = []
open_zoom = None
for k in m["marks"]:
    if k["name"] == "zoom":
        open_zoom = k
    elif k["name"] == "unzoom" and open_zoom:
        x, y, w, h = [v * dpr_px for v in open_zoom["box"]]
        z = max(1.35, min(MAXZ, 0.75 * W / max(w, 1), 0.75 * H / max(h, 1)))
        cx, cy = x + w / 2, y + h / 2
        segs.append((open_zoom["t"], k["t"], z, cx, cy))
        open_zoom = None


def ease(a, b):
    """0 -> 1 from a to a+EASE, hold, 1 -> 0 from b to b+EASE (smoothstep both ways)."""
    up = f"(clip((t-{a:.3f})/{EASE},0,1))"
    dn = f"(clip((t-{b:.3f})/{EASE},0,1))"
    s_up = f"({up}*{up}*(3-2*{up}))"
    s_dn = f"({dn}*{dn}*(3-2*{dn}))"
    return f"({s_up}-{s_dn})"


Z = "1" + "".join(f"+{z - 1:.4f}*{ease(a, b)}" for a, b, z, _, _ in segs)
CX = f"{W / 2}" + "".join(f"+{cx - W / 2:.1f}*{ease(a, b)}" for a, b, _, cx, _ in segs)
CY = f"{H / 2}" + "".join(f"+{cy - H / 2:.1f}*{ease(a, b)}" for a, b, _, _, cy in segs)

# After scaling by Z, the crop window (W x H) is centred on (CX*Z, CY*Z), kept inside the frame.
x = f"clip(({CX})*({Z})-{W / 2},0,{W}*({Z})-{W})"
y = f"clip(({CY})*({Z})-{H / 2},0,{H}*({Z})-{H})"
vf = (
    f"scale=w='trunc({W}*({Z})/2)*2':h='trunc({H}*({Z})/2)*2':eval=frame:flags=lanczos,"
    f"crop=w={W}:h={H}:x='{x}':y='{y}',setsar=1,fps=30"
)
open(out + ".vf.txt", "w").write(vf)
subprocess.run(
    ["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", vf, "-an", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", out],
    check=True,
)
print(out, len(segs), "zooms")
