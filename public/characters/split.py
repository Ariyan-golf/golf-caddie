from PIL import Image
import os

folder = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(folder, "characters.png")
names = ["mika.png", "yoshi.png", "sennin.png", "taka.png"]

img = Image.open(src)
w, h = img.size
cw = w // 4  # width of each character

print(f"Original: {w}x{h}  →  each character: {cw}x{h}")

for i, name in enumerate(names):
    left = cw * i
    crop = img.crop((left, 0, left + cw, h))
    out = os.path.join(folder, name)
    crop.save(out)
    print(f"Saved {name}  ({crop.size[0]}x{crop.size[1]})")

print("Done.")
