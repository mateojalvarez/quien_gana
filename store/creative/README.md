# Creative assets del App Store

| Archivo | Placement | Medida | Art safe area |
| --- | --- | --- | --- |
| `header-3840x1646.png` | Encabezado de la ficha (21:9) | 3840 × 1646 | 1646 × 661 en (1097, 493) |
| `search-results-3840x2560.png` | Resultados de búsqueda (3:2) | 3840 × 2560 | 2168 × 1030 en (836, 765) |

Las medidas salen de la [spec de Apple][spec]. Dos reglas que no se negocian:
el PNG **no puede llevar canal alfa**, y todo lo que importa —marca, texto,
arcilla— tiene que caer dentro del safe area, porque fuera de ahí la App Store
recorta según el dispositivo. Lo de afuera es sólo fondo.

Tampoco van precios, descuentos, URLs, premios ni menciones a otras
plataformas: la guía de Apple los prohíbe.

## Regenerar

`generar.py` arma los SVG; el PNG lo rinde `rsvg-convert`. La tipografía Jost
no está instalada en el sistema, así que se le pasa por un fontconfig propio
que apunta a `node_modules/@expo-google-fonts/jost`.

```sh
brew install librsvg fontconfig
python3 store/creative/generar.py /tmp/assets
rsvg-convert -w 3840 -h 1646 -b '#FBF8F2' -o header-3840x1646.png /tmp/assets/header.svg
rsvg-convert -w 3840 -h 2560 -b '#FBF8F2' -o search-results-3840x2560.png /tmp/assets/search.svg
```

El `-b` es lo que deja el PNG opaco: sin ese fondo sólido el render sale con
alfa y App Store Connect lo rechaza. Verificar con
`ffprobe -show_entries stream=pix_fmt` que diga `rgb24`.

[spec]: https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
