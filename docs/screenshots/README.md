# Capturas del panel

Este directorio guarda las capturas que ilustran el README (`docs/screenshots/`).

## Archivos esperados

| Archivo | Qué mostrar |
|---|---|
| `home.png` | `/` con la lista de eventos a la venta |
| `compra.png` | `/[slug]` formulario de compra |
| `panel.png` | `/panel` métricas por evento + crear evento |
| `admin-evento.png` | `/[slug]/admin` ventas y aprobaciones |
| `escaner.png` | `/[slug]/escaner` lector QR |

## Cómo capturarlas

1. Levantá una instancia local con el seed demo (`npx tsx prisma/seed.ts`).
2. Viewport desktop 1440×900 para `panel.png` y `admin-evento.png`; mobile 390×844 para `compra.png` y `escaner.png`.
3. Sin datos personales reales: usá el evento demo y emails de ejemplo.
4. Guardá en PNG y referenciá desde el README cuando existan.
