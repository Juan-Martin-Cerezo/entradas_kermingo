# Capturas

PNG reales del sistema corriendo, usadas por el README. No son mockups.

| Archivo | Qué muestra |
|---|---|
| `01-landing.png` | `/` — home con los eventos a la venta |
| `02-panel-superadmin.png` | `/panel` — métricas de la plataforma |
| `03-panel-crear-evento.png` | `/panel` — formulario de creación de evento |
| `04-evento-admin-ventas.png` | `/[slug]/admin` — ventas y aprobación de comprobantes |
| `05-evento-admin-referidos.png` | `/[slug]/admin/referidos` — promoters y ranking |
| `06-evento-admin-asistentes.png` | `/[slug]/admin/asistentes` — planilla de asistentes |
| `07-registro.png` | `/registro` — alta self-service de organizador |
| `08-escaner-mobile.png` | `/[slug]/escaner` a 390×844 — escáner QR offline-first |
| `09-panel-mobile.png` | `/panel` a 390×844 — administración desde el celular |

## Cómo regenerarlas

Script incluido en el repo del proyecto original (Playwright + login de superadmin):

```bash
~/insta-env/bin/python scripts/eventhub_screenshots.py
```

Login con las credenciales de superadmin (`ALLOW_SELF_SIGNUP`, `ADMIN_PASSWORD` /
`SUPERADMIN_PASSWORD`), viewport 1440×1000 desktop y 390×844 mobile a
`device_scale_factor=2`. Usá un evento demo, nunca datos personales reales.
