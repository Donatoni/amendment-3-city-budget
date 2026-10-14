"""Fit deployment video copies within Pages' 25 MiB asset limit.

Run after the Vite build. Requires ffmpeg (override with FFMPEG).
Source videos stay untouched; cached encodes are keyed by source content.
"""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
CACHE = ROOT / '.cache/cloudflare-videos'
LIMIT = 25 * 1024 * 1024
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')


def duration(path):
    result = subprocess.run([FFMPEG, '-hide_banner', '-i', str(path)], capture_output=True, text=True)
    match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
    if not match:
        raise RuntimeError(f'Could not inspect {path}: {result.stderr}')
    hours, minutes, seconds = map(float, match.groups())
    return hours * 3600 + minutes * 60 + seconds


if not (DIST / 'index.html').exists():
    raise SystemExit('Run npm run build first.')
CACHE.mkdir(parents=True, exist_ok=True)
for path in sorted((DIST / 'assets/videos').glob('*.mp4')):
    if path.stat().st_size <= LIMIT:
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:20]
    cached = CACHE / f'{digest}-h264-v1.mp4'
    original_duration = duration(path)
    if not cached.exists():
        # Reserve room for audio and container overhead; retain full 720p video.
        bitrate = int(23 * 1024 * 1024 * 8 / original_duration - 128000)
        temporary = cached.with_suffix('.tmp.mp4')
        print(f'Encoding {path.name} at {bitrate // 1000} kbps', flush=True)
        subprocess.run([
            FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path),
            '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'fast',
            '-threads', '8', '-b:v', str(bitrate), '-maxrate', str(bitrate),
            '-bufsize', str(bitrate * 2), '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(temporary),
        ], check=True)
        if temporary.stat().st_size > LIMIT or abs(duration(temporary) - original_duration) > 0.2:
            temporary.unlink()
            raise RuntimeError(f'Encoded video failed size/duration checks: {path.name}')
        temporary.replace(cached)
    if cached.stat().st_size > LIMIT or abs(duration(cached) - original_duration) > 0.2:
        raise RuntimeError(f'Cached video failed validation: {cached}')
    shutil.copy2(cached, path)
    print(f'{path.name}: {path.stat().st_size / 1024 / 1024:.1f} MiB', flush=True)

oversized = [str(p.relative_to(DIST)) for p in DIST.rglob('*') if p.is_file() and p.stat().st_size > LIMIT]
if oversized:
    raise SystemExit(f'Assets still exceed 25 MiB: {oversized}')
print('All deployment assets fit Cloudflare Pages limits.')
