# -*- coding: utf-8 -*-
"""生成扩展图标：蓝底圆角方块 + 白色 "1T"。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "icons")
os.makedirs(OUT, exist_ok=True)

BASE = 128
img = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角底：垂直渐变蓝 #2563eb -> #1e40af
r = 28
grad = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
top, bot = (37, 99, 235, 255), (30, 64, 175, 255)
for y in range(BASE):
    t = y / (BASE - 1)
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(4))
    gd.line([(0, y), (BASE, y)], fill=c)
mask = Image.new("L", (BASE, BASE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, BASE - 1, BASE - 1], radius=r, fill=255)
img.paste(grad, (0, 0), mask)

# 白色 "1T" 文字（居中，粗体）
font = None
for cand in (r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\tahoma.ttf"):
    if os.path.exists(cand):
        font = ImageFont.truetype(cand, 72)
        break
if font is None:
    font = ImageFont.load_default()
text = "1T"
bbox = d.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text(((BASE - tw) / 2 - bbox[0], (BASE - th) / 2 - bbox[1]), text, font=font, fill=(255, 255, 255, 255))

for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"{size}.png"))
    print("wrote", os.path.join(OUT, f"{size}.png"))
