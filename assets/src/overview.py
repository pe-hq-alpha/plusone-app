"""Draws assets/overview.svg: PlusOne at a glance, the people who use it and how they
connect, with no technology in it (that is assets/architecture.svg). Run from the
repository root: python3 assets/src/overview.py"""
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


W, H = 1600, 760
out.append(f'<rect width="{W}" height="{H}" fill="{INK}"/>')
out.append(text(800, 58, "How PlusOne works", 32, family=SERIF, anchor="middle"))
ICONS["users"] = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'


def person(cx, cy, ic, who, sub):
    # A soft marigold glow, a filled disc and a bold icon, so each side reads at a glance.
    out.append(f'<circle cx="{cx}" cy="{cy}" r="84" fill="url(#glow)"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="60" fill="url(#disc)" stroke="{GOLD}" stroke-width="2.5"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="50" fill="none" stroke="{GOLD}" stroke-opacity=".25" stroke-width="1"/>')
    out.append(icon(ic, cx - 28, cy - 28, 56, "#ffd27a").replace('stroke-width="1.8"', 'stroke-width="2.2"'))
    out.append(text(cx, cy + 96, who, 21, weight=600, anchor="middle"))
    if sub:
        out.append(text(cx, cy + 120, sub, 14, MUTED, anchor="middle"))


def step(x, y, ic, n, s_):
    # A numbered gold badge, the step's icon and its words, centred on x as one group.
    width = 26 + 10 + 20 + 10 + len(s_) * 7.6
    left = x - width / 2
    out.append(f'<rect x="{left - 10}" y="{y - 24}" width="{width + 20}" height="36" rx="18" fill="{CARD2}" stroke="{LINE}"/>')
    out.append(f'<circle cx="{left + 13}" cy="{y - 6}" r="13" fill="{GOLD}"/>')
    out.append(text(left + 13, y - 1, str(n), 14, INK, 700, anchor="middle"))
    out.append(icon(ic, left + 36, y - 16, 20))
    out.append(text(left + 66, y, s_, 15, TEXT))


# The one app in the middle
out.append(card(560, 190, 480, 240, fill="#141b2b", stroke=GOLD, r=20))
out.append(logo("plusone.svg", 676, 226, 52))
out.append(text(742, 268, "PlusOne", 44, family=SERIF))
out.append(text(800, 310, "one app for planning and buying events", 16, MUTED, anchor="middle"))
out.append(f'<line x1="610" y1="336" x2="990" y2="336" stroke="{LINE}"/>')
out.append(text(800, 368, "every quote on the same lines,", 15.5, TEXT, anchor="middle"))
out.append(text(800, 392, "missing charges flagged, every price comparable", 15.5, TEXT, anchor="middle"))

# The people who use it
person(220, 300, "users", "Customers", "families and event managers")
person(1380, 300, "store", "Vendors", "caterers, decorators, halls…")
person(800, 610, "shield", "The PlusOne team", "")

# The story, in order
flow("M290 262 H560", 0.0)
step(425, 236, "mic", "1", "describe the event")
flow("M1040 262 H1310", 0.7)
step(1175, 236, "mail", "2", "the same brief")
flow("M1310 340 H1040", 1.4)
step(1175, 384, "receipt", "3", "quotes back")
flow("M560 340 H290", 2.1)
step(425, 384, "columns", "4", "compared, line by line")
flow("M800 552 V430", 2.8)
out.append(text(818, 496, "verifies every vendor", 14, MUTED))

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

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="How PlusOne works: customers, families and event managers, describe their event in PlusOne; vendors get the same brief and send quotes back; PlusOne puts every quote on the same lines, flags missing charges and makes every price comparable, so the customer compares them line by line; the PlusOne team verifies every vendor">
<style>.dash{{animation:run 1.2s linear infinite}}@keyframes run{{to{{stroke-dashoffset:-18}}}}@media (prefers-reduced-motion:reduce){{.dash{{animation:none}}}}</style>
<defs><radialGradient id="glow"><stop offset="0" stop-color="#f4b53a" stop-opacity=".22"/><stop offset="1" stop-color="#f4b53a" stop-opacity="0"/></radialGradient><radialGradient id="disc" cx=".35" cy=".3"><stop offset="0" stop-color="#3a3524"/><stop offset="1" stop-color="#1c1f29"/></radialGradient><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#5a6378"/></marker></defs>
{"".join(out[:1])}
{"".join(tracks)}
{"".join(out[1:])}
{"".join(dots)}
</svg>
'''
(ROOT / "assets" / "overview.svg").write_text(svg)
print("wrote assets/overview.svg", len(svg) // 1024, "KB")
