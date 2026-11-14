#!/usr/bin/env python3
"""Build the Sidebar demo from the recorded clips, cards, captions and voice.

python3 compose.py            -> out/sidebar-demo.mp4 (+ out/parts/*.mp4, out/timeline.json)

Each PART is one piece of picture: a recorded clip between two times (with its
smooth zooms from the recorder's marks) or a still card. Voices and captions are
placed at times relative to the part, then laid over the joined video.
"""
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

D = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1920, 1080, 30
EASE = 0.6
os.makedirs(f"{D}/out/parts", exist_ok=True)


def marks(clip):
    return json.load(open(f"{D}/raw/{clip}.json"))


def vlen(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))


# (kind, source, start, end, speed, voices [(key, at)], captions [(key, in, out)], extra)
# kind "clip": source = raw/<source>.mp4, start/end in clip seconds.
# kind "still": source = cards/out/<source>.png, end = duration. extra["zoom"] = [(label, t1, t2)].
PLAN = [
    ("still", "hook", 0, 9.0, 1, [("v01", 0.3)], [("s1", 0.5, 8.6)], {"zoom": [("v1", 1.6, 4.2), ("v2", 4.8, 7.8)]}),
    ("still", "title", 0, 4.8, 1, [("v02", 0.4)], [], {}),
    ("clip", "portal", 6.0, 16.2, 1, [("v03", 0.5)], [("s3", 0.5, 9.6)], {}),
    ("clip", "review", 8.0, 9.4, 1, [], [], {}),
    ("clip", "review", 9.4, 25.1, 6, [], [], {"clock": True}),
    ("clip", "review", 25.1, 41.2, 1, [("v04", 0.4)], [("s4", 0.5, 15.5)], {}),
    ("clip", "review", 42.6, 50.2, 1, [("v04b", 1.2)], [("s4b", 1.0, 7.2)], {}),
    ("clip", "redline", 10.6, 33.0, 1, [("v05", 6.0), ("v05b", 17.0)], [("s5", 5.6, 16.4), ("s5b", 16.8, 22.2)], {}),
    ("clip", "ask", 15.6, 31.2, 1, [("v06", 9.0)], [("s6", 0.6, 15.2)], {}),
    ("clip", "ask", 31.2, 53.0, 2.5, [], [], {}),
    ("clip", "ask", 53.0, 64.4, 4, [], [], {"clock": True}),
    ("clip", "ask", 64.4, 72.4, 1, [("v06b", 0.4)], [("s6b", 0.5, 7.6)], {}),
    ("clip", "decide", 14.2, 35.2, 1.5, [("v07", 2.0)], [], {}),
    ("clip", "decide", 43.6, 50.3, 1, [], [("s7", 0.4, 6.4)], {}),
    ("clip", "playbook", 12.5, 24.7, 1, [("v08", 0.5)], [("s8", 0.5, 11.8)], {}),
    *[("still", f"teams-{n}", 0, 1.25, 1, [("v08b", 0.2)] if n == 1 else [], [("s8b", 0.1, 1.25)] if n == 1 else ([("s8b", 0, 1.25)] if n > 1 else []), {}) for n in range(1, 6)],
    ("still", "teams-6", 0, 3.6, 1, [], [("s8b", 0, 3.4)], {}),
    ("still", "arch", 0, 6.2, 1, [("v09", 0.3)], [], {}),
    ("still", "end", 0, 3.4, 1, [], [], {}),
]


def ease(a, b):
    up = f"(clip((t-{a:.3f})/{EASE},0,1))"
    dn = f"(clip((t-{b:.3f})/{EASE},0,1))"
    return f"(({up}*{up}*(3-2*{up}))-({dn}*{dn}*(3-2*{dn})))"


def zoom_filter(segs, dur, push=False):
    """segs: (t1, t2, box[x,y,w,h] in video px) relative to part start, in source time."""
    zs = []
    for a, b, (x, y, w, h) in segs:
        z = max(1.35, min(2.0, 0.75 * W / max(w, 1), 0.75 * H / max(h, 1)))
        zs.append((a, b, z, x + w / 2, y + h / 2))
    base = f"(1+0.035*t/{dur:.2f})" if push and not zs else "1"
    Z = base + "".join(f"+{z - 1:.4f}*{ease(a, b)}" for a, b, z, _, _ in zs)
    CX = f"{W / 2}" + "".join(f"+{cx - W / 2:.1f}*{ease(a, b)}" for a, b, _, cx, _ in zs)
    CY = f"{H / 2}" + "".join(f"+{cy - H / 2:.1f}*{ease(a, b)}" for a, b, _, _, cy in zs)
    x = f"clip(({CX})*({Z})-{W / 2},0,{W}*({Z})-{W})"
    y = f"clip(({CY})*({Z})-{H / 2},0,{H}*({Z})-{H})"
    return (
        f"scale=w='trunc({W}*({Z})/2)*2':h='trunc({H}*({Z})/2)*2':eval=frame:flags=lanczos,"
        f"crop=w={W}:h={H}:x='{x}':y='{y}',setsar=1"
    )


def cap_chain(i, dur, first_input):
    """Overlay this part's captions. Fade only where a caption truly starts or ends,
    so a caption that runs across a cut does not blink."""
    cs = PLAN[i][6]
    prev = PLAN[i - 1][6] if i > 0 else []
    nxt = PLAN[i + 1][6] if i + 1 < len(PLAN) else []
    ins, fc, last = [], [], "[base]"
    for j, (k, a, b) in enumerate(cs):
        b = min(b, dur)
        cont_in = a < 0.15 and any(pk == k for pk, _, _ in prev)
        cont_out = b > dur - 0.15 and any(nk == k for nk, _, _ in nxt)
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", f"{D}/cards/out/cap-{k}.png"]
        f = f"[{first_input + j}:v]format=rgba"
        if not cont_in:
            f += f",fade=in:st={a:.2f}:d=0.25:alpha=1"
        if not cont_out:
            f += f",fade=out:st={b - 0.25:.2f}:d=0.25:alpha=1"
        fc.append(f + f"[c{j}]")
        fc.append(f"{last}[c{j}]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[o{j}]")
        last = f"[o{j}]"
    return ins, fc, last


def build_part(i, p):
    kind, src, s, e, speed, _, _, extra = p
    out = f"{D}/out/parts/{i:02d}-{src}.mp4"
    if kind == "still":
        boxes = {}
        jp = f"{D}/cards/out/{src}.json"
        if os.path.exists(jp):
            boxes = {b["label"]: b["box"] for b in json.load(open(jp))}
        segs = [(a, b, boxes[l]) for l, a, b in extra.get("zoom", [])]
        vf = zoom_filter(segs, e, push=True) + f",fps={FPS}"
        cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{e}", "-i", f"{D}/cards/out/{src}.png"]
        dur = e
    else:
        m = marks(src)
        scale = W / m["viewport"]["width"]
        segs, z0 = [], None
        for k in m["marks"]:
            if k["name"] == "zoom":
                z0 = k
            elif k["name"] == "unzoom" and z0:
                if z0["t"] >= s - 0.1 and k["t"] <= e + 0.1:
                    segs.append((z0["t"] - s, k["t"] - s, [v * scale for v in z0["box"]]))
                z0 = None
        vf = f"trim=start={s}:end={e},setpts=PTS-STARTPTS," + zoom_filter(segs, e - s)
        if speed != 1:
            vf += f",setpts=PTS/{speed}"
        if extra.get("clock"):
            # Real elapsed time in the corner while the wait is sped up.
            vf += (f",drawbox=x=1700:y=34:w=186:h=54:color=0x18181A@0.85:t=fill,"
                   f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf:"
                   f"text='%{{eif\\:t*{speed}\\:d}}s real':x=1722:y=48:fontsize=28:fontcolor=0xFCA700,"
                   f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='{speed}x':x=1834:y=50:fontsize=22:fontcolor=white")
        vf += f",fps={FPS}"
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", f"{D}/raw/{src}.mp4"]
        dur = (e - s) / speed
    ins, fc, last = cap_chain(i, dur, 1)
    graph = ";".join([f"[0:v]{vf}[base]"] + fc + [f"{last}format=yuv420p[vout]"])
    cmd += ins + ["-filter_complex", graph, "-map", "[vout]", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-t", f"{dur:.3f}", out]
    subprocess.run(cmd, check=True)
    return out, vlen(out)


with ThreadPoolExecutor(max_workers=6) as ex:
    results = list(ex.map(lambda ip: build_part(*ip), enumerate(PLAN)))

# Join the picture.
lst = f"{D}/out/parts/list.txt"
open(lst, "w").write("".join(f"file '{o}'\n" for o, _ in results))
video = f"{D}/out/video-captions.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video], check=True)

# Absolute times for voices and captions.
t = 0.0
voices, caps, timeline = [], [], []
for (o, dur), p in zip(results, PLAN):
    kind, src, s, e, speed, vs, cs, _ = p
    timeline.append({"part": os.path.basename(o), "source": src, "from": s, "to": e, "speed": speed, "at": round(t, 2), "length": round(dur, 2)})
    voices += [(k, t + a) for k, a in vs]
    caps += [(k, t + a, t + b) for k, a, b in cs]
    t += dur
total = t

# Merge back-to-back captions with the same key into one span (no flicker across cuts).
merged = []
for k, a, b in caps:
    if merged and merged[-1][0] == k and abs(merged[-1][2] - a) < 0.15:
        merged[-1] = (k, merged[-1][1], b)
    else:
        merged.append((k, a, b))
caps = merged

inputs = ["-i", video]
for k, _ in voices:
    inputs += ["-i", f"{D}/voice/{k}.mp3"]
fc = []
nv = len(voices)
for j, (k, at) in enumerate(voices):
    ms = int(at * 1000)
    fc.append(f"[{1 + j}:a]aresample=48000,adelay={ms}|{ms},apad=whole_dur={total:.2f}[a{j}]")
fc.append("".join(f"[a{j}]" for j in range(nv)) + f"amix=inputs={nv}:normalize=0:duration=longest,atrim=0:{total:.2f},loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
final = f"{D}/out/sidebar-demo.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.2f}", final], check=True)
# Voice-only track for editors.
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", final, "-vn", "-c:a", "copy", f"{D}/out/voice-track.m4a"], check=True)

json.dump({"total": round(total, 2), "parts": timeline, "voices": [(k, round(a, 2)) for k, a in voices], "captions": [(k, round(a, 2), round(b, 2)) for k, a, b in caps]},
          open(f"{D}/out/timeline.json", "w"), indent=1)
print(final, round(total, 1), "s")
