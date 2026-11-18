#!/usr/bin/env python3
"""Genera los creative assets del App Store: header 21:9 y search results 3:2.

Las medidas y las art safe areas salen de
developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
Todo lo critico (marca, texto, arcilla) queda dentro del safe area; lo que se
sale son solo manchas de color de fondo.

Escribe los dos SVG; el PNG final sale de rsvg-convert con la tipografia Jost
que vive en node_modules (ver README.md de esta carpeta).

    python3 store/creative/generar.py [carpeta-de-salida]
"""
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CLAY = ROOT / "assets" / "clay"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent

MARFIL, TINTA, TIERRA = "#FBF8F2", "#151110", "#5A4A40"
MOSTAZA, TOMATE, SALVIA, ROSA, CREMA = "#F4B740", "#EF7A57", "#86C1B7", "#F3C2C9", "#EFE6D8"


def clay(name: str) -> str:
    data = base64.b64encode((CLAY / f"{name}.png").read_bytes()).decode()
    return f"data:image/png;base64,{data}"


def img(name, x, y, size, opacity=1.0):
    return (
        f'<image href="{clay(name)}" x="{x}" y="{y}" width="{size}" height="{size}"'
        f' opacity="{opacity}" preserveAspectRatio="xMidYMid meet"/>'
    )


def text(s, x, y, size, weight, fill, anchor="start", tracking=0):
    family = "Jost ExtraBold" if weight >= 800 else "Jost"
    return (
        f'<text x="{x}" y="{y}" font-family="{family}" font-weight="{weight}"'
        f' font-size="{size}" fill="{fill}" text-anchor="{anchor}"'
        f' letter-spacing="{tracking}" xml:space="preserve">{s}</text>'
    )


# ── Header 21:9 · 3840x1646 · safe 1646x661 en (1097, 493) ──────────────────
header = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="3840" height="1646" viewBox="0 0 3840 1646">
  <rect width="3840" height="1646" fill="{MARFIL}"/>
  <circle cx="240" cy="1520" r="720" fill="{CREMA}"/>
  <circle cx="3700" cy="300" r="440" fill="{SALVIA}"/>
  {img("pulsador", 40, 1180, 600)}
  {img("reloj-arena", 3300, 1120, 620)}
  <rect x="1963" y="373" width="780" height="900" rx="120" fill="{MOSTAZA}"/>
  {img("composicion-grande", 2073, 543, 560)}
  {text("Anotador, dados y reloj", 1100, 735, 58, 500, TIERRA, tracking=2)}
  {text("¿Quién gana?", 1097, 905, 138, 800, TINTA, tracking=-5)}
</svg>"""

# ── Search results 3:2 · 3840x2560 · safe 2168x1030 en (836, 765) ───────────
tiles = ""
tile_colors = [MOSTAZA, TOMATE, SALVIA, ROSA, "#7FA8C9"]
tile_clay = ["corazon", "dado", "pulsador", "reloj-arena", "lapiz"]
TILE, GAP, TILE_Y = 380, 60, 1360
row_w = 5 * TILE + 4 * GAP
x0 = 1920 - row_w // 2
for i, (col, name) in enumerate(zip(tile_colors, tile_clay)):
    tx = x0 + i * (TILE + GAP)
    tiles += f'<rect x="{tx}" y="{TILE_Y}" width="{TILE}" height="{TILE}" rx="88" fill="{col}"/>'
    tiles += img(name, tx + 40, TILE_Y + 40, TILE - 80)

search = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="3840" height="2560" viewBox="0 0 3840 2560">
  <rect width="3840" height="2560" fill="{MARFIL}"/>
  <circle cx="170" cy="150" r="620" fill="{MOSTAZA}"/>
  <circle cx="3720" cy="2480" r="680" fill="{SALVIA}"/>
  <circle cx="3640" cy="300" r="300" fill="{CREMA}"/>
  {text("¿Quién gana?", 1920, 1075, 300, 800, TINTA, anchor="middle", tracking=-9)}
  {text("Anotador, dados, pulsador y reloj", 1920, 1250, 110, 500, TIERRA, anchor="middle", tracking=1)}
  {tiles}
</svg>"""

(OUT / "header.svg").write_text(header)
(OUT / "search.svg").write_text(search)
print("svg listo")
