#!/usr/bin/env python3
"""gen_figures -- the site's figures, drawn from code: converter schematics
(schemdraw, standard IEEE symbols) and idealized waveforms (matplotlib), in
the site's symbols (CLAUDE.md: V_g, V, D, T_s, L, i_L, 1:n).

Every figure is an SVG in src/assets/figures/, inlined by <Figure> so that it
takes the page's text colour: lines and text are `currentColor`, so the same
file reads in the light and the dark theme. Text is drawn as paths (no fonts
needed), ids are prefixed with the figure's name (several figures can share
a page), and the output is deterministic, so CI can regenerate and compare:

    pip install -e "python[figures]"
    python scripts/gen_figures.py           # write src/assets/figures/*.svg
    python scripts/gen_figures.py --check   # fail if a file is stale

It also writes the README's gallery of schematics (docs/images/topologies.svg),
which picks its ink from the reader's light or dark colour scheme.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt  # noqa: E402
import schemdraw  # noqa: E402
import schemdraw.elements as elm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "figures"
GALLERY = ROOT / "docs" / "images" / "topologies.svg"

INK = "#010203"  # stands for currentColor while drawing
BLUE = "#3b82f6"  # trace colours readable on the light and the dark theme
ORANGE = "#f97316"
GREEN = "#22a06b"

schemdraw.use("svg")
schemdraw.svgconfig.text = "path"
plt.rcParams.update(
    {
        "svg.fonttype": "path",
        "svg.hashsalt": "pe-core",
        "font.size": 12,
        "mathtext.fontset": "stix",
        "font.family": "STIXGeneral",
        "axes.edgecolor": INK,
        "axes.labelcolor": INK,
        "text.color": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "axes.linewidth": 1.0,
        "figure.facecolor": "none",
        "axes.facecolor": "none",
        "savefig.facecolor": "none",
    }
)


# ---- schematics -------------------------------------------------------------


def drawing() -> schemdraw.Drawing:
    d = schemdraw.Drawing(show=False)
    d.config(fontsize=15, lw=1.5, color=INK, unit=2.4, bgcolor="none")
    return d


def terminals(d, top, bottom, polarity=("+", "$V$", "−")) -> None:
    """Open output terminals right of the load, with the output voltage between them."""
    d.add(elm.Line().at(top).right(1.0))
    d.add(elm.Dot(open=True))
    d.add(elm.Gap().down().toy(bottom).label(polarity, loc="bottom"))
    d.add(elm.Dot(open=True))
    d.add(elm.Line().left(1.0))


def load(d, return_x, polarity=("+", "$V$", "−")) -> None:
    """C and R from the current point down to the return line, which runs back to x = return_x."""
    d.add(elm.Dot())
    d.push()
    d.add(elm.Capacitor().down().label("$C$", loc="top"))
    d.pop()
    d.add(elm.Line().right(1.4))
    r = d.add(elm.Resistor().down().label("$R$", loc="top"))
    terminals(d, r.start, r.end, polarity)
    d.add(elm.Line().at(r.end).left().tox(return_x))


def source(d, label_loc="bottom"):
    return d.add(elm.SourceV().up().label("$V_g$", loc=label_loc, ofst=0.2))


def buck(d) -> None:
    v = source(d)
    d.add(elm.Line().right(0.6))
    d.add(elm.Switch().right().label("$Q_1$"))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Diode().down().reverse().label("$D_1$", loc="bottom"))
    d.pop()
    ind = d.add(elm.Inductor2(loops=4).right().label("$L$"))
    d.add(elm.CurrentLabelInline(direction="in").at(ind).label("$i_L$"))
    load(d, v.start[0])


def boost(d) -> None:
    v = source(d)
    d.add(elm.Line().right(0.6))
    ind = d.add(elm.Inductor2(loops=4).right().label("$L$"))
    d.add(elm.CurrentLabelInline(direction="in").at(ind).label("$i_L$"))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Switch().down().label("$Q_1$", loc="bottom"))
    d.pop()
    d.add(elm.Diode().right().label("$D_1$"))
    load(d, v.start[0])


def buckboost(d) -> None:
    v = source(d)
    d.add(elm.Line().right(0.6))
    d.add(elm.Switch().right().label("$Q_1$"))
    d.add(elm.Dot())
    d.push()
    ind = d.add(elm.Inductor2(loops=4).down().label("$L$", loc="bottom"))
    d.add(elm.CurrentLabelInline(direction="in").at(ind).label("$i_L$", loc="top"))
    d.pop()
    d.add(elm.Diode().right().reverse().label("$D_1$"))
    # the output is negative: its "−" terminal is on top (V is its magnitude)
    load(d, v.start[0], polarity=("−", "$V$", "+"))


def flyback(d) -> None:
    v = source(d)
    d.add(elm.Line().up(0.6))
    d.add(elm.Line().right(2.2))
    t = d.add(elm.Transformer(t1=4, t2=4, core=True).right().anchor("p1").label("$1:n$", loc="top", ofst=0.35))
    # dots at opposite ends: the secondary conducts while the switch is off
    d.add(elm.Dot(radius=0.08).at((t.p1[0] - 0.3, t.p1[1] - 0.3)))
    d.add(elm.Dot(radius=0.08).at((t.s2[0] + 0.3, t.s2[1] + 0.3)))
    d.add(elm.Line().at(t.p2).down(0.3))
    d.add(elm.Switch().down().label("$Q_1$", loc="bottom"))
    d.add(elm.Line().left().tox(v.start))
    d.add(elm.Line().up().toy(v.start))
    d.add(elm.Line().at(t.s1).right(0.6))
    d.add(elm.Diode().right().label("$D_1$"))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Capacitor().down().toy(t.s2).label("$C$", loc="top"))
    d.pop()
    d.add(elm.Line().right(1.4))
    r = d.add(elm.Resistor().down().toy(t.s2).label("$R$", loc="top"))
    terminals(d, r.start, r.end)
    d.add(elm.Line().at(r.end).left().tox(t.s2))


def forward(d) -> None:
    """Single-switch forward converter: reset winding n_r with D_r, secondary n with D_1, D_2, L."""
    v = source(d, label_loc="top")
    d.add(elm.Line().up(0.6))
    d.add(elm.Line().right(1.6))
    d.add(elm.Dot())
    d.push()
    reset = d.add(elm.Inductor(loops=3).down().flip().label("$n_r$", loc="top"))
    dr = d.add(elm.Diode().down().reverse().label("$D_r$", loc="bottom"))
    d.pop()
    d.add(elm.Line().right(2.0))
    prim = d.add(elm.Inductor(loops=4).down().flip().label("$1$", loc="top", ofst=0.1))
    d.add(elm.Line().down(0.4))
    d.add(elm.Switch().down().label("$Q_1$", loc="bottom"))
    bottom_y = d.here[1]
    d.add(elm.Line().left().tox(v.start))
    d.add(elm.Line().up().toy(v.start))
    d.add(elm.Line().at(dr.end).down().toy(bottom_y))
    xc = prim.start[0] + 0.55
    y0, y1 = prim.start[1] + 0.2, prim.end[1] - 0.2
    d.add(elm.Line().at((xc, y0)).to((xc, y1)))
    d.add(elm.Line().at((xc + 0.18, y0)).to((xc + 0.18, y1)))
    sec = d.add(elm.Inductor(loops=4).at((xc + 0.73, prim.start[1])).down().flip().label("$n$", loc="bottom", ofst=0.1))
    # dots: primary and secondary at the top (they conduct together), reset winding at its diode end
    d.add(elm.Dot(radius=0.08).at((prim.start[0] - 0.3, prim.start[1] - 0.3)))
    d.add(elm.Dot(radius=0.08).at((sec.start[0] + 0.3, sec.start[1] - 0.3)))
    d.add(elm.Dot(radius=0.08).at((reset.end[0] + 0.3, reset.end[1] + 0.3)))
    d.add(elm.Line().at(sec.start).right(0.5))
    d.add(elm.Diode().right().label("$D_1$"))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Diode().down().toy(sec.end).reverse().label("$D_2$", loc="bottom"))
    d.pop()
    ind = d.add(elm.Inductor2(loops=4).right().label("$L$"))
    d.add(elm.CurrentLabelInline(direction="in").at(ind).label("$i_L$"))
    d.add(elm.Dot())
    d.push()
    d.add(elm.Capacitor().down().toy(sec.end).label("$C$", loc="top"))
    d.pop()
    d.add(elm.Line().right(1.4))
    r = d.add(elm.Resistor().down().toy(sec.end).label("$R$", loc="top"))
    terminals(d, r.start, r.end)
    d.add(elm.Line().at(r.end).left().tox(sec.end))


def schematic(draw):
    def render() -> str:
        with drawing() as d:
            draw(d)
            return d.get_imagedata("svg").decode("utf-8")

    return render


# ---- waveforms --------------------------------------------------------------


def axes_style(ax, ylabel: str) -> None:
    """Axes through the origin; the quantity's name above the vertical axis, clear of its tick labels."""
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_position("zero")
    ax.spines["bottom"].set_position("zero")
    if ylabel:
        ax.text(0, 1.02, ylabel, transform=ax.transAxes, ha="center", va="bottom")


def svg_of(fig) -> str:
    import io

    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", pad_inches=0.05, metadata={"Date": None, "Creator": None})
    plt.close(fig)
    return buf.getvalue()


def switch_node(d_ratio: float = 0.4) -> str:
    """v_s(t): V_g for D T_s, 0 for D' T_s, and its average D V_g."""
    fig, ax = plt.subplots(figsize=(5.2, 2.2))
    t, v = [], []
    for k in range(2):
        t += [k, k, k + d_ratio, k + d_ratio]
        v += [0, 1, 1, 0]
    ax.plot(t + [2], v + [0], color=BLUE, lw=2)
    ax.hlines(d_ratio, 0, 2, color=ORANGE, lw=1.6, ls=(0, (5, 3)))
    ax.text(2.06, d_ratio, r"$\langle v_s\rangle = D\,V_g$", va="center", color=ORANGE)
    ax.set_xlim(0, 2.75)
    ax.set_ylim(-0.1, 1.3)
    ax.set_xticks([d_ratio, 1, 2], [r"$DT_s$", r"$T_s$", r"$2T_s$"])
    ax.set_yticks([1], [r"$V_g$"])
    axes_style(ax, r"$v_s(t)$")
    ax.set_xlabel(r"$t$", loc="right")
    return svg_of(fig)


def balance(d_ratio: float = 0.4, m: float = 0.4, half_ripple: float = 0.18) -> str:
    """Buck in CCM: v_L(t) with its two volt-second areas, and i_L(t) with its dc value and half-ripple."""
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(5.2, 3.8), sharex=True, gridspec_kw={"hspace": 0.35})
    vg, v = 1.0, m
    d = d_ratio
    a1.plot([0, 0, d, d, 1, 1, 1 + d, 1 + d, 2], [0, vg - v, vg - v, -v, -v, vg - v, vg - v, -v, -v], color=BLUE, lw=2)
    for k in range(2):
        a1.fill_between([k, k + d], 0, vg - v, color=BLUE, alpha=0.18, lw=0)
        a1.fill_between([k + d, k + 1], 0, -v, color=ORANGE, alpha=0.22, lw=0)
    a1.set_yticks([vg - v, -v], [r"$V_g - V$", r"$-V$"])
    a1.set_ylim(-0.6, 0.8)
    axes_style(a1, r"$v_L(t)$")
    i_dc = 0.55
    a2.plot([0, d, 1, 1 + d, 2], [i_dc - half_ripple, i_dc + half_ripple, i_dc - half_ripple, i_dc + half_ripple, i_dc - half_ripple], color=GREEN, lw=2)
    # the half-ripple, measured right of the waveform where no line crosses its label
    x_arrow = 2.1
    a2.hlines(i_dc, 0, x_arrow + 0.04, color=INK, lw=1, ls=(0, (4, 3)))
    a2.hlines(i_dc + half_ripple, 1 + d, x_arrow + 0.04, color=INK, lw=0.8, ls=(0, (1, 2)))
    a2.annotate("", xy=(x_arrow, i_dc + half_ripple), xytext=(x_arrow, i_dc), arrowprops={"arrowstyle": "<->", "color": INK, "lw": 1, "shrinkA": 0, "shrinkB": 0})
    a2.text(x_arrow + 0.06, i_dc + half_ripple / 2, r"$\Delta i_L$", va="center")
    a2.set_yticks([i_dc], [r"$I$"])
    a2.set_ylim(0, 1.0)
    a2.set_xlim(0, 2.45)
    a2.set_xticks([d, 1, 2], [r"$DT_s$", r"$T_s$", r"$2T_s$"])
    axes_style(a2, r"$i_L(t)$")
    a2.set_xlabel(r"$t$", loc="right")
    return svg_of(fig)


def ccm_dcm(d_ratio: float = 0.4, d2: float = 0.3) -> str:
    """i_L(t) in CCM, at the boundary, and in DCM with its three intervals."""
    fig, axs = plt.subplots(1, 3, figsize=(7.2, 2.1), sharey=True, gridspec_kw={"wspace": 0.25})
    d = d_ratio
    cases = [(r"CCM: $K > K_\mathrm{crit}$", 0.35), (r"$K = K_\mathrm{crit}$", 0.0), (r"DCM: $K < K_\mathrm{crit}$", None)]
    for ax, (title, low) in zip(axs, cases):
        if low is not None:
            t, i = [0, d, 1, 1 + d, 2], [low, low + 1.0, low, low + 1.0, low]
        else:
            t, i = [], []
            for k in range(2):
                t += [k, k + d, k + d + d2, k + 1]
                i += [0, 0.75, 0, 0]
        ax.plot(t, i, color=GREEN, lw=2)
        ax.set_title(title, fontsize=12, color=INK)
        ax.set_xticks([1, 2], [r"$T_s$", r"$2T_s$"])
        ax.set_yticks([])
        ax.set_ylim(-0.05, 1.45)
        ax.set_xlim(0, 2.1)
        axes_style(ax, r"$i_L$" if ax is axs[0] else "")
    ax = axs[2]
    # the first period's intervals, in fractions of T_s: D (switch on), D_2 (diode on), D_3 (neither)
    for x0, x1, lab in ((0, d, r"$D$"), (d, d + d2, r"$D_2$"), (d + d2, 1, r"$D_3$")):
        ax.annotate("", xy=(x0, 1.0), xytext=(x1, 1.0), arrowprops={"arrowstyle": "<->", "color": INK, "lw": 0.8, "shrinkA": 0, "shrinkB": 0})
        ax.text((x0 + x1) / 2, 1.06, lab, ha="center", va="bottom", fontsize=11)
        ax.vlines(x1, 0, 1.0, color=INK, lw=0.6, ls=(0, (2, 2)))
    return svg_of(fig)


FIGURES = {
    "buck": schematic(buck),
    "boost": schematic(boost),
    "buck-boost": schematic(buckboost),
    "flyback": schematic(flyback),
    "forward": schematic(forward),
    "switch-node": switch_node,
    "balance": balance,
    "ccm-dcm": ccm_dcm,
}


# attributes whose numbers are geometry: rounded to 6 significant digits, so that a
# last-bit difference in a platform's trigonometry never changes a committed file
GEOMETRY = re.compile(r'(\s(?:d|points|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|viewBox|transform)=")([^"]*)(")')
NUMBER = re.compile(r"-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?")


def short(match: re.Match) -> str:
    x = float(match.group(0))
    return "0" if abs(x) < 1e-6 else f"{x:.6g}"


def finish(name: str, svg: str) -> str:
    """Inline-ready SVG: ids prefixed with the figure's name, `currentColor` for the ink, and nothing
    that would reach outside the figure (matplotlib's `*{...}` style sheet would style the whole page)."""
    svg = re.sub(r"<\?xml[^>]*>\s*", "", svg)
    svg = re.sub(r"<!DOCTYPE[^>]*>\s*", "", svg)
    svg = re.sub(r"<!--.*?-->\s*", "", svg, flags=re.S)
    svg = re.sub(r"<metadata>.*?</metadata>\s*", "", svg, flags=re.S)
    svg = re.sub(r"<style[^>]*>.*?</style>\s*", "", svg, flags=re.S)
    svg = re.sub(r"<defs>\s*</defs>\s*", "", svg)
    svg = svg.replace("stroke-dasharray:-;", "").replace(' xml:lang="en"', "").replace(' style="background-color:none;"', "")
    ids = set(re.findall(r'\sid="([^"]+)"', svg))
    for i in sorted(ids, key=len, reverse=True):
        svg = svg.replace(f'id="{i}"', f'id="fig-{name}-{i}"')
        svg = svg.replace(f'"#{i}"', f'"#fig-{name}-{i}"').replace(f"url(#{i})", f"url(#fig-{name}-{i})")
    svg = svg.replace(INK, "currentColor").replace(INK.upper(), "currentColor")
    svg = GEOMETRY.sub(lambda m: m.group(1) + NUMBER.sub(short, m.group(2)) + m.group(3), svg)
    # the reader gets the <Figure>'s text alternative instead; joins and caps as matplotlib's sheet set them
    svg = re.sub(r"<svg\b", '<svg aria-hidden="true" focusable="false" stroke-linejoin="round" stroke-linecap="butt"', svg, count=1)
    return svg.strip() + "\n"


# ---- README gallery -----------------------------------------------------------

GALLERY_ROWS = (
    (("buck", "Buck"), ("boost", "Boost"), ("buck-boost", "Buck-boost (inverting)")),
    (("flyback", "Flyback"), ("forward", "Forward")),
)


def label(text: str, size: float = 16) -> tuple[str, float, float]:
    """A text label as plain paths (DejaVu Sans, bundled with ziafont): its SVG body, width and height."""
    import ziafont

    before = ziafont.config.svg2
    ziafont.config.svg2 = False
    try:
        t = ziafont.Font().text(text, size=size)
        svg = t.svg()
        w, h = t.getsize()
    finally:
        ziafont.config.svg2 = before
    body = svg[svg.index(">") + 1 : svg.rindex("</svg>")]
    body = re.sub(r"<title>.*?</title>", "", body)
    top = float(re.search(r'viewBox="[-\d.]+ ([-\d.]+)', svg).group(1))
    return f'<g transform="translate(0 {-top:g})">{body}</g>', w, h


def gallery(figures: dict[str, str]) -> str:
    """The schematics in rows under their names, for the README; the ink follows prefers-color-scheme."""
    gap, head = 36.0, 26.0
    placed, rows_w, y = [], [], 0.0
    for row in GALLERY_ROWS:
        items = []
        for name, title in row:
            root = re.match(r"<svg[^>]*>", figures[name]).group(0)
            w = float(re.search(r'width="([\d.]+)pt"', root).group(1))
            h = float(re.search(r'height="([\d.]+)pt"', root).group(1))
            items.append((name, title, w, h, re.search(r'viewBox="([^"]+)"', root).group(1)))
        row_w = sum(it[2] for it in items) + gap * (len(items) - 1)
        rows_w.append(row_w)
        placed.append((items, row_w, y))
        y += head + max(it[3] for it in items) + gap
    width, height = max(rows_w), y - gap
    parts = []
    for items, row_w, y0 in placed:
        x = (width - row_w) / 2
        for name, title, w, h, box in items:
            body, lw, _ = label(title)
            parts.append(f'<g fill="currentColor" transform="translate({x + (w - lw) / 2:g} {y0:g})">{body}</g>')
            inner = figures[name][figures[name].index(">") + 1 : figures[name].rindex("</svg>")]
            parts.append(f'<svg x="{x:g}" y="{y0 + head:g}" width="{w:g}" height="{h:g}" viewBox="{box}">{inner}</svg>')
            x += w + gap
    style = "svg{color:#1f2328}@media (prefers-color-scheme:dark){svg{color:#e6edf3}}"
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{width:g}pt" height="{height:g}pt" viewBox="0 0 {width:g} {height:g}">'
        f"<style>{style}</style>{''.join(parts)}</svg>"
    )
    return GEOMETRY.sub(lambda m: m.group(1) + NUMBER.sub(short, m.group(2)) + m.group(3), svg) + "\n"


def render(outdir: Path, gallery_path: Path) -> list[Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    paths, done = [], {}
    for name, make in FIGURES.items():
        p = outdir / f"{name}.svg"
        done[name] = finish(name, make())
        p.write_text(done[name], encoding="utf-8")
        paths.append(p)
    gallery_path.parent.mkdir(parents=True, exist_ok=True)
    gallery_path.write_text(gallery(done), encoding="utf-8")
    return paths + [gallery_path]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail when a committed figure differs from a fresh render")
    args = ap.parse_args()
    if not args.check:
        for p in render(OUT, GALLERY):
            print(f"gen_figures: wrote {p.relative_to(ROOT)}")
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        fresh = {p.name: p.read_text(encoding="utf-8") for p in render(Path(tmp), Path(tmp) / "gallery" / GALLERY.name)}
    committed = {p.name: p.read_text(encoding="utf-8") for p in OUT.glob("*.svg")} if OUT.exists() else {}
    committed[GALLERY.name] = GALLERY.read_text(encoding="utf-8") if GALLERY.exists() else ""
    bad = sorted(n for n in fresh if committed.get(n) != fresh[n]) + sorted(set(committed) - set(fresh))
    if bad:
        print("gen_figures --check: stale or unknown figures (run python scripts/gen_figures.py):", ", ".join(bad))
        return 1
    print(f"gen_figures --check: up to date ({len(fresh)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
