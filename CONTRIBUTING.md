# Contributing a EventHub

Gracias por querer contribuir. EventHub es MIT: todo aporte (código, docs, tests) se acepta bajo la misma licencia.

## Setup de desarrollo

```bash
npm install
cp .env.example .env   # completá al menos DATABASE_URL/DIRECT_URL de TU Supabase, AUTH_SECRET y SUPERADMIN_*
npx prisma generate
npm run dev            # http://localhost:3000
```

Reglas de base de datos (obligatorias):

- **Nunca** corras `prisma db push` / `prisma migrate` contra la DB de producción ni contra una DB que no sea tuya.
- Solo `npx prisma generate` + tests con mocks para desarrollar.
- Si necesitás un cambio de schema, escribí el SQL como archivo `prisma/migrations/<timestamp>_<nombre>/migration.sql` y **no lo apliques**: lo revisa el mantenedor.
- Los comandos DDL están protegidos por `prisma.config.ts`: requieren `ALLOW_DB_PUSH=1` y, si está definido, `ALLOWED_DB_PROJECT_REFS` debe incluir tu proyecto.

## Tests y lint (antes de cada commit)

```bash
npx vitest run   # suite completa en verde, sin excepciones
npm run lint     # no aumentar los errores preexistentes (ver baseline en el log del commit)
```

`npm run build` una sola vez al final del lote de cambios, no por commit.

## Convenciones

- **Commits convencionales** en español rioplatense donde aplique: `feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`, `test(...)`, con el código de fase si existe (ej. `feat(panel): ... (F12)`).
- **Rutas multi-tenant:** todo lo de un evento vive bajo `src/app/[slug]/` y toda API bajo `src/app/api/...` con `event_id` obligatorio. Un query sin `event_id` es un bug.
- **Tests con mocks:** nunca toques una DB real desde los tests. Patrón existente en `src/__tests__/*.test.ts` (ver `isolation.test.ts` para el criterio de aislamiento entre eventos).
- **Sin valores reales:** no commitees emails, passwords, URLs de producción ni credenciales. `.env*` está ignorado salvo `.env.example`.
- **TypeScript estricto:** evitá `any`; verificá content-type antes de `res.json()` en fetches.

## Pull requests

1. Una task = un PR, contra `main`.
2. Describí qué cambia, cómo probarlo y el resultado de `npx vitest run` + `npm run lint`.
3. Si toca datos o auth, explicá el impacto en aislamiento (`event_id`) y roles (`superadmin`/`owner`/`scanner`).
