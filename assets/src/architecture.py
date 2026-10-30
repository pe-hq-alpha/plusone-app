"""Draws assets/architecture.svg: how a request moves through PlusOne, with real logos
and animated flow. Run from the repository root: python3 assets/src/architecture.py"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
LOGOS = ROOT / "assets" / "logos"

INK, CARD, CARD2, LINE = "#11141c", "#1a1f2b", "#202637", "#2e3548"
GOLD, TEXT, MUTED, META = "#f4b53a", "#ecebe6", "#9aa0ad", "#3b82f6"
SANS = "'Work Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
SERIF = "'EB Garamond', Georgia, 'Times New Roman', serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

ICONS = {  # lucide paths, 24 x 24
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "mic": '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    "mail": '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    "list": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    "image": '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    "camera": '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    "sheet": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
    "scale": '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    "columns": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    "sparkles": '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "store": '<path d="M2 7 6.4 2.6A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20v3a2 2 0 0 1-2 2 2.5 2.5 0 0 1-2-1 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-2 1 2 2 0 0 1-2-2Z"/>',
    "receipt": '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6"/><path d="M16 12h-6"/><path d="M12 16h-2"/>',
}

out: list[str] = []


def logo(name: str, x: float, y: float, size: float) -> str:
    f = LOGOS / name
    mime = "image/svg+xml" if f.suffix == ".svg" else "image/png"
    data = base64.b64encode(f.read_bytes()).decode()
    return f'<image href="data:{mime};base64,{data}" x="{x}" y="{y}" width="{size}" height="{size}"/>'


def icon(name: str, x: float, y: float, size: float = 22, color: str = GOLD) -> str:
    s = size / 24
    return f'<g transform="translate({x} {y}) scale({s})" fill="none" stroke="{color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>'


def text(x, y, s, size=15, color=TEXT, weight=400, family=SANS, anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{s}</text>'


def card(x, y, w, h, fill=CARD, stroke=LINE, dash=None, r=12):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"{d}/>'


def chip(x, y, ic, title, sub, w=230, h=64):
    out.append(card(x, y, w, h))
    out.append(icon(ic, x + 16, y + h / 2 - 11))
    out.append(text(x + 52, y + 28, title, 16, weight=600))
    out.append(text(x + 52, y + 47, sub, 12.5, MUTED))


flows: list[tuple[str, float, str]] = []  # path d, start delay, colour


def flow(d: str, delay: float, color: str = GOLD):
    flows.append((d, delay, color))


def curve(x1, y1, x2, y2):
    mx = (x1 + x2) / 2
    return f"M{x1} {y1} C{mx} {y1} {mx} {y2} {x2} {y2}"


W, H = 1600, 900
out.append(f'<rect width="{W}" height="{H}" fill="{INK}"/>')
out.append(text(40, 52, "PlusOne, end to end", 30, family=SERIF))
out.append(text(340, 52, "how a quote, a call or a photo becomes something a family can compare", 15, MUTED))

for x, label in [(40, "1  WHAT ARRIVES"), (330, "2  APP AND BACKEND"), (720, "3  META'S MODELS"), (1110, "4  FIXED, TESTED RULES"), (1390, "5  WHAT PEOPLE SEE")]:
    out.append(text(x, 98, label, 12, GOLD, 600))

# 1. What arrives
inputs = [
    ("mic", "A spoken brief", "Tamil, English or both"),
    ("mail", "Vendors' quotes", "email, PDF, WhatsApp photo"),
    ("phone", "A vendor's call", "recorded, two speakers"),
    ("list", "A price list", "typed or photographed"),
    ("image", "The hall's photo", "the host's own venue"),
    ("camera", "Photos of work", "added by a vendor"),
]
WRAP_IN = (350, 392)
for i, (ic, t, s) in enumerate(inputs):
    y = 120 + i * 86
    chip(40, y, ic, t, s)
    flow(curve(270, y + 32, WRAP_IN[0], WRAP_IN[1]), i * 0.25)

# 2. App and backend
out.append(card(330, 120, 320, 80))
out.append(logo("react.svg", 348, 144, 30))
out.append(logo("cloudflare.svg", 386, 144, 30))
out.append(text(430, 154, "The app", 16, weight=600))
out.append(text(430, 174, "React on Cloudflare's edge", 12.5, MUTED))

out.append(card(330, 230, 320, 470, fill="#151a25"))
out.append(logo("convex.svg", 348, 248, 26))
out.append(text(384, 268, "Convex backend", 16, weight=600))
out.append(f'<path d="M490 200 V230" stroke="{LINE}" stroke-width="1.5"/>')

out.append(card(350, 296, 280, 192, fill=CARD2, stroke=GOLD))
out.append(text(370, 326, "One model wrapper", 17, weight=600))
out.append(text(370, 346, "convex/lib/models.ts", 12, MUTED, family=MONO))
for j, pill in enumerate(["schema-checked JSON", "retries, Retry-After", "fallback, logged", "a cost row per call"]):
    px, py = 370 + (j % 2) * 128, 366 + (j // 2) * 40
    out.append(f'<rect x="{px}" y="{py}" width="120" height="28" rx="14" fill="none" stroke="{LINE}" stroke-width="1.2"/>')
    out.append(text(px + 60, py + 18, pill, 11, TEXT, anchor="middle"))
out.append(text(370, 470, "same request code for Meta, Baseten, Modal", 11.5, MUTED))

out.append(card(350, 508, 280, 172, fill=CARD2))
out.append(text(370, 536, "Durable jobs", 16, weight=600))
out.append(text(370, 556, "workflows · crons · webhooks · rate limits", 11.5, MUTED))
out.append(logo("firecrawl.png", 370, 576, 24))
out.append(text(404, 593, "reads vendors' own sites", 12.5, TEXT))
out.append(logo("agentmail.png", 370, 612, 24))
out.append(text(404, 629, "each event's own inbox, chased", 12.5, TEXT))
out.append(icon("receipt", 371, 646, 22, MUTED))
out.append(text(404, 663, "every call priced: Under the hood", 12.5, TEXT))

# 3. Meta's models
out.append(card(720, 120, 330, 590, fill="#141b2b", stroke="#2c3f66"))
out.append(logo("meta.svg", 740, 136, 30))
out.append(text(780, 158, "Meta's models", 17, weight=600))
models = [
    ("Muse Spark 1.3", "reads and writes every step", None),
    ("Muse Voice Transcribe", "hears briefs and calls", None),
    ("Muse Spark Open", "reads price lists, open weights", "baseten.png"),
    ("SAM 3.1", "cuts out the stage", None),
    ("Muse Glimmer 30B", "checks work photos, our GPU", "modal.svg"),
    ("Muse Wonder", "gathers a vendor's evidence", None),
]
MODEL_Y = []
for i, (name, job, host) in enumerate(models):
    y = 186 + i * 84
    MODEL_Y.append(y + 34)
    out.append(card(740, y, 290, 68, fill=CARD))
    out.append(f'<circle cx="760" cy="{y + 34}" r="5" fill="{META}"/>')
    out.append(text(776, y + 30, name, 15.5, weight=600))
    out.append(text(776, y + 50, job, 12.5, MUTED))
    if host:
        out.append(logo(host, 994, y + 22, 24))
    flow(curve(630, WRAP_IN[1], 740, y + 34), 1.4 + i * 0.12)

out.append(card(740, 740, 290, 60, fill="none", stroke=MUTED, dash="6 6"))
out.append(logo("claude.svg", 756, 756, 28))
out.append(text(796, 768, "Claude, as fallback", 14.5, weight=600))
out.append(text(796, 787, "only when a Meta model can't answer", 12, MUTED))
out.append(f'<path d="M630 470 C690 470 680 770 740 770" fill="none" stroke="{MUTED}" stroke-width="1.5" stroke-dasharray="5 6"/>')

# 4. Fixed, tested rules
out.append(card(1110, 170, 230, 120, fill=CARD2, stroke=GOLD))
out.append(icon("sheet", 1128, 190))
out.append(text(1160, 208, "The standard sheet", 16, weight=600))
out.append(text(1128, 240, "every quote and every offer", 12.5, MUTED))
out.append(text(1128, 258, "on the same lines: unit, GST,", 12.5, MUTED))
out.append(text(1128, 276, "transport, service, extras", 12.5, MUTED))
out.append(card(1110, 330, 230, 112, fill=CARD2))
out.append(icon("scale", 1128, 348))
out.append(text(1160, 366, "Rules, not the model", 16, weight=600))
for k, line in enumerate(["missing charges flagged", "the city's market range", "when a quote moves the budget"]):
    out.append(text(1128, 394 + k * 18, "· " + line, 12.5, MUTED))
out.append(f'<path d="M1225 290 V330" stroke="{LINE}" stroke-width="1.5"/>')
for i in range(3):
    flow(curve(1030, MODEL_Y[i], 1110, 230), 2.6 + i * 0.15)
flow("M1225 290 V330", 3.3)

# 5. What people see
outputs = [
    (150, "store", "PlusOne Partner", "answer the same brief"),
    (330, "columns", "Compare", "line by line, gaps flagged"),
    (460, "sparkles", "Venue, dressed", "the real stage, a look on it"),
    (590, "shield", "PlusOne Ops", "a person decides"),
    (720, "search", "Find vendors", "open, priced on the sheet"),
]
for y, ic, t, s in outputs:
    out.append(card(1390, y, 180, 92))
    out.append(icon(ic, 1406, y + 16))
    out.append(text(1438, y + 34, t, 15, weight=600))
    out.append(text(1406, y + 66, s, 12, MUTED))
flow(curve(1340, 386, 1390, 376), 3.7)
flow(curve(1030, MODEL_Y[3], 1390, 506), 2.8)
flow(curve(1030, MODEL_Y[4], 1390, 626), 2.9)
flow(curve(1030, MODEL_Y[5], 1390, 650), 3.0)
flow(curve(1390, 196, 1340, 214), 3.2)
out.append(text(1365, 240, "offers", 11, MUTED, anchor="middle"))
flow("M1570 636 C1600 636 1600 196 1570 196", 4.0)
flow(curve(1340, 266, 1390, 766), 3.5)
out.append(text(1588, 420, "verified only", 11, MUTED, anchor="middle", family=SANS).replace("<text", '<text transform="rotate(90 1588 420)"'))

# Footer: the rest of the stack and a legend
out.append(f'<line x1="40" y1="836" x2="1560" y2="836" stroke="{LINE}"/>')
fx = 40
for name, label in [("clerk.svg", "sign-in"), ("resend.svg", "app emails"), ("whatsapp.svg", "quote updates to the host"), ("openstreetmap.svg", "vendor map"), ("posthog.svg", "usage, with consent"), ("vitest.svg", "760 tests")]:
    out.append(logo(name, fx, 852, 20))
    out.append(text(fx + 28, 867, label, 12.5, MUTED))
    fx += 40 + len(label) * 7.5
out.append(f'<circle cx="1150" cy="862" r="4" fill="{GOLD}"/>')
out.append(text(1162, 867, "a request on its way", 12.5, MUTED))
out.append(f'<path d="M1320 862 H1350" stroke="{MUTED}" stroke-width="1.5" stroke-dasharray="5 6"/>')
out.append(text(1358, 867, "only if needed", 12.5, MUTED))
out.append(f'<circle cx="1470" cy="862" r="5" fill="{META}"/>')
out.append(text(1482, 867, "a Meta model", 12.5, MUTED))

# The flows: a quiet track, an arrowhead, and a dot travelling along it
CYCLE = 4.6
tracks, dots = [], []
for n, (d, delay, color) in enumerate(flows):
    tracks.append(f'<path id="f{n}" d="{d}" fill="none" stroke="#3a4257" stroke-width="1.6" marker-end="url(#head)"/>')
    tracks.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6" stroke-dasharray="4 14" opacity=".55" class="dash"/>')
    dots.append(
        f'<circle r="4.5" fill="{color}" opacity="0"><animateMotion dur="1.1s" begin="{delay}s;f{n}a.end+{CYCLE - 1.1:.2f}s" id="f{n}a" fill="freeze"><mpath href="#f{n}"/></animateMotion>'
        f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur="1.1s" begin="{delay}s;f{n}a.begin" /></circle>'
    )

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="PlusOne end to end: briefs, quotes, calls, price lists and photos go through one model wrapper on Convex to the Meta model suited to each; quotes land on the standard sheet, where fixed rules flag missing charges and place prices in the market range for Compare; SAM 3.1 dresses the venue; Muse Glimmer and Muse Wonder feed PlusOne Ops, where a person verifies vendors before they answer briefs on PlusOne Partner; Find vendors lists every vendor openly, priced on the same sheet; a WhatsApp message tells the host when a quote lands">
<style>.dash{{animation:run 1.2s linear infinite}}@keyframes run{{to{{stroke-dashoffset:-18}}}}@media (prefers-reduced-motion:reduce){{.dash{{animation:none}}}}</style>
<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#5a6378"/></marker></defs>
{"".join(out[:1])}
{"".join(tracks)}
{"".join(out[1:])}
{"".join(dots)}
</svg>
'''
(ROOT / "assets" / "architecture.svg").write_text(svg)
print("wrote assets/architecture.svg", len(svg) // 1024, "KB")
