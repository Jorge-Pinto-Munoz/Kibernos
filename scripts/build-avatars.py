# Genera apps-script/Avatars.html desde assets/avatars/<id>.jpg (120 px, JPEG liviano)
import base64, io, glob, os, sys
from PIL import Image
root = sys.argv[1]
out = ["<script>", "/* Fotos del equipo: assets/avatars/<id>.jpg. Generado por scripts/build-avatars.py */", "var AVATAR_SRC = {"]
for f in sorted(glob.glob(os.path.join(root, 'assets/avatars/*.jpg'))):
    pid = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert('RGB').resize((120, 120), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=82, optimize=True)
    out.append(f"  {pid}: 'data:image/jpeg;base64,{base64.b64encode(b.getvalue()).decode()}',")
out += ["};", "</script>"]
open(os.path.join(root, 'apps-script/Avatars.html'), 'w').write("\n".join(out) + "\n")
print(len(out) - 5, 'fotos')
