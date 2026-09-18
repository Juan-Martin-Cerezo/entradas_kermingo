# EventHub Developer Guidelines

## Build & Run Commands
- Run development server: `npm run dev`
- Build for production: `npm run build`
- Start production server: `npm run start`
- Lint checks: `npm run lint`
- Run test suite: `npx vitest run`

## Database Commands
- Generate Prisma Client: `npx prisma generate`
- Push schema to DB: `ALLOW_DB_PUSH=1 npx prisma db push` (development only)
- Open Prisma Studio: `ALLOW_DB_PUSH=1 npx prisma studio`
- Run database seed: `npm run postinstall` (or `ALLOW_DB_PUSH=1 npx tsx prisma/seed.ts`)

## Code Conventions & Standards
- **Routing:** App Router only (pages inside `src/app/`, APIs inside `src/app/api/`). Multi-tenant routes under `src/app/[slug]/`.
- **Styles:** Tailwind CSS with utility classes. Use responsive utilities (`sm:`, `md:`, etc.).
- **Serverless Limits:** Do not upload files >4.5MB from backend. Always compress images in client before upload.
- **Database Safety:** Configure `pg.Pool` with `max: 1` in serverless/production to prevent connection limit saturation.
- **Types:** Always specify strict TypeScript types. Avoid `any` where possible.
- **Error Handling:** Verify response content-types before calling `res.json()` on fetch. Wrap JSON parsing in try-catch blocks.

## CRITICAL DATABASE SAFETY RULES (AI & Human Mandatory)
- **DATABASE SHIELD #1 (allowlist)**: Si se define `ALLOWED_DB_PROJECT_REFS="ref1,ref2"`, `prisma.config.ts` bloquea cualquier ejecución donde `DATABASE_URL`/`DIRECT_URL` no coincida con los project refs permitidos.
- **DATABASE SHIELD #2 (DDL explícito)**: `prisma db push|execute|seed`, `prisma migrate*` y `prisma studio` requieren `ALLOW_DB_PUSH=1` en el entorno. Sin eso el comando sale con exit 1 y no toca nada — protección contra ejecuciones accidentales.
- **DO NOT RUN** `prisma db push` or Prisma migrations pointing to production databases without authorization.
- Realizar backup de base de datos antes de intentar cambios de schema en entornos productivos.
- Las migraciones se escriben como SQL plano en `prisma/migrations/<timestamp>_<name>/migration.sql` y se aplican deliberadamente.
