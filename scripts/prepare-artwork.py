"""Rebuild deterministic canvas points and Windows icons from the supplied artwork."""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parent.parent
image = Image.open(root / "public/emblem.png").convert("RGBA")
alpha = image.getchannel("A")
points = []
for y in range(12, 500, 3):
    for x in range(12, 500, 3):
        a = alpha.getpixel((x, y))
        if a < 140:
            continue
        edge = any(alpha.getpixel((x + dx, y + dy)) < 100 for dx, dy in [(2,0),(-2,0),(0,2),(0,-2)])
        if edge or (x // 3 + y // 3) % 2 == 0:
            points.append([round((x - 256) / 256, 4), round((y - 256) / 256, 4), int(edge)])
(root / "src/emblem-points.json").write_text(json.dumps(points, separators=(",", ":")), encoding="utf-8")
logo = Image.open(root / "public/logo.png").convert("RGBA")
icons = root / "src-tauri/icons"
icons.mkdir(exist_ok=True)
for size in (32, 128):
    logo.resize((size, size), Image.Resampling.LANCZOS).save(icons / f"{size}x{size}.png")
logo.save(icons / "icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(f"Prepared {len(points)} emblem points and Windows icons.")

