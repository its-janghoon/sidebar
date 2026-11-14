#!/usr/bin/env python3
"""Gather everything an editor needs into deliver/ (run after compose.py)."""
import json
import os
import shutil

D = os.path.dirname(os.path.abspath(__file__))
OUT = f"{D}/deliver"
shutil.rmtree(OUT, ignore_errors=True)
for sub in ["final", "scenes/raw", "scenes/edited", "voice", "captions", "cards", "subtitles", "marks"]:
    os.makedirs(f"{OUT}/{sub}", exist_ok=True)

tl = json.load(open(f"{D}/out/timeline.json"))
lines = json.load(open(f"{D}/lines.json"))
caps = json.load(open(f"{D}/captions.json"))
ko = json.load(open(f"{D}/lines.ko.json"))

shutil.copy(f"{D}/out/sidebar-demo.mp4", f"{OUT}/final/sidebar-demo.mp4")
shutil.copy(f"{D}/out/voice-track.m4a", f"{OUT}/final/voice-track.m4a")
for f in sorted(os.listdir(f"{D}/out/parts")):
    if f.endswith(".mp4"):
        shutil.copy(f"{D}/out/parts/{f}", f"{OUT}/scenes/edited/{f}")
for f in sorted(os.listdir(f"{D}/raw")):
    if f.endswith(".mp4"):
        shutil.copy(f"{D}/raw/{f}", f"{OUT}/scenes/raw/{f}")
    if f.endswith(".json") and "try" not in f:
        shutil.copy(f"{D}/raw/{f}", f"{OUT}/marks/{f}")
for f in sorted(os.listdir(f"{D}/voice")):
    shutil.copy(f"{D}/voice/{f}", f"{OUT}/voice/{f}")
for f in sorted(os.listdir(f"{D}/cards/out")):
    dst = "captions" if f.startswith("cap-") else "cards"
    if f.endswith(".png"):
        shutil.copy(f"{D}/cards/out/{f}", f"{OUT}/{dst}/{f}")


def ts(x):
    h, r = divmod(x, 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", ",")


def vlen(k):
    import subprocess
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{D}/voice/{k}.mp3"]))


for lang, src in (("en", lines), ("ko", ko)):
    rows = []
    for i, (k, at) in enumerate(tl["voices"], 1):
        rows.append(f"{i}\n{ts(at)} --> {ts(at + vlen(k))}\n{src[k]}\n")
    open(f"{OUT}/subtitles/{lang}.srt", "w").write("\n".join(rows))

md = ["# Sidebar demo: edit package", "",
      f"Final: `final/sidebar-demo.mp4` ({tl['total']:.1f} s, 1920x1080, 30 fps, voice -16 LUFS). Voice only: `final/voice-track.m4a`.", "",
      "| Folder | What |", "|---|---|",
      "| `scenes/raw/` | OBS recordings as captured, one per scene (no zoom, no captions) |",
      "| `scenes/edited/` | The parts of the final cut, in order, with zoom, speed and captions baked in (no audio) |",
      "| `voice/` | Amazon Polly (Matthew, generative), one mp3 per line |",
      "| `captions/` | Caption overlays, transparent 1920x1080 PNG, Pretendard Bold |",
      "| `cards/` | Still cards: hook, title, teams-0..6, arch, end |",
      "| `subtitles/` | `en.srt`, `ko.srt` (timed to the final cut) |",
      "| `marks/` | Recorder marks per scene: click and zoom times in seconds, zoom boxes in page px (x1.25 = video px) |",
      "", "## Timeline", "", "| At | Length | Part (scenes/edited) | Source | From-to (s) | Speed |", "|---|---|---|---|---|---|"]
for p in tl["parts"]:
    md.append(f"| {p['at']:.1f} | {p['length']:.1f} | `{p['part']}` | {p['source']} | {p['from']}-{p['to']} | {p['speed']}x |")
md += ["", "## Voice", "", "| At | File | Line |", "|---|---|---|"]
for k, at in tl["voices"]:
    md.append(f"| {at:.1f} | `voice/{k}.mp3` | {lines[k]} |")
md += ["", "## Captions", "", "| From | To | File | Text |", "|---|---|---|---|"]
for k, a, b in tl["captions"]:
    md.append(f"| {a:.1f} | {b:.1f} | `captions/cap-{k}.png` | {caps[k].replace('<b>', '**').replace('</b>', '**')} |")
md += ["", "Data on screen is demo data on a free Atlassian dev site. Contract text: Common Paper Cloud Service Agreement v3.0 (CC BY 4.0), edited for the demo.", ""]
open(f"{OUT}/timeline.md", "w").write("\n".join(md))
print("packaged", OUT)
