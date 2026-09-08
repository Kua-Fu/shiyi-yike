"""生成原创猫脸图标。纯标准库，4 倍采样保证小尺寸图标边缘清晰。"""
import struct
import subprocess
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def ellipse(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

def triangle(x, y, points):
    signs = []
    for a, b in zip(points, points[1:] + points[:1]):
        signs.append((x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]))
    return all(s >= 0 for s in signs) or all(s <= 0 for s in signs)

def pixel(x, y, tray=False):
    color = (0, 0, 0, 0)
    if not tray:
        dx, dy = max(abs(x - .5) - .28, 0), max(abs(y - .5) - .28, 0)
        if dx * dx + dy * dy < .19 ** 2:
            color = (236, 239, 222, 255)
    head = ellipse(x, y, .5, .56, .30, .245)
    ears = triangle(x, y, [(.21, .45), (.20, .19), (.43, .36)]) or triangle(x, y, [(.57, .36), (.8, .19), (.79, .45)])
    if head or ears:
        color = (0, 0, 0, 255) if tray else (173, 139, 89, 255)
    if not tray:
        if ellipse(x, y, .5, .57, .279, .225): color = (238, 211, 163, 255)
        if triangle(x, y, [(.24,.4),(.235,.255),(.355,.354)]) or triangle(x,y,[(.645,.354),(.765,.255),(.76,.4)]): color = (219,157,146,255)
    eye = ellipse(x,y,.388,.545,.018,.028) or ellipse(x,y,.612,.545,.018,.028)
    nose = triangle(x,y,[(.47,.617),(.53,.617),(.5,.647)])
    if eye or nose: color = (0,0,0,0) if tray else (104,86,60,255)
    return color

def png(filename, size, tray=False):
    rows = bytearray()
    scale = 4
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [pixel((x+(a+.5)/scale)/size,(y+(b+.5)/scale)/size,tray) for a in range(scale) for b in range(scale)]
            alpha = sum(p[3] for p in samples)
            rgb = [round(sum(p[c]*p[3] for p in samples)/alpha) if alpha else 0 for c in range(3)]
            rows.extend((*rgb,round(alpha/(scale*scale))))
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    filename.parent.mkdir(parents=True,exist_ok=True)
    filename.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(rows)))+chunk(b'IEND',b''))

png(ROOT/'assets/tray.png',44,True)
png(ROOT/'assets/icon.png',512)
if sys.platform == 'darwin':
    iconset = ROOT/'artifacts/CatGuard.iconset'
    iconset.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 128, 256, 512):
        for factor, suffix in ((1, ''), (2, '@2x')):
            subprocess.run(['sips', '-z', str(size*factor), str(size*factor), str(ROOT/'assets/icon.png'), '--out', str(iconset/f'icon_{size}x{size}{suffix}.png')], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(ROOT/'assets/icon.icns')], check=True)
