# Kermingo Developer Guidelines

## Build & Run Commands
- Run development server: `npm run dev`
- Build for production: `npm run build`
- Start production server: `npm run start`
- Lint checks: `npm run lint`

## Database Commands
- Generate Prisma Client: `npx prisma generate`
- Push schema to DB: `npx prisma db push`
- Open Prisma Studio: `npx prisma studio`
- Run database seed: `npm run postinstall` (or `npx tsx prisma/seed.ts`)

## Code Conventions & Standards
- **Routing:** App Router only (pages inside `src/app/`, APIs inside `src/app/api/`).
- **Styles:** Tailwind CSS with utility classes. Use responsive utilities (`sm:`, `md:`, etc.).
- **Serverless Limits:** Do not upload files >4.5MB from backend. Always compress images in client before upload.
- **Database Safety:** Configure `pg.Pool` with `max: 1` in serverless/production to prevent connection limit saturation.
- **Types:** Always specify strict TypeScript types. Avoid `any` where possible.
- **Error Handling:** Verify response content-types before calling `res.json()` on fetch. Wrap JSON parsing in try-catch blocks.

## CRITICAL DATABASE SAFETY RULES (AI & Human Mandatory)
- **DATABASE SHIELD**: The database endpoint is highly critical. A custom guard is configured in `prisma.config.ts` to block any execution where `DATABASE_URL` does not match the Kermingo production Supabase (`wodzuelvlqontlthdlig`) database.
- **DO NOT RUN** `prisma db push` or Prisma migrations pointing to other databases.
- Always run `npx tsx backup-db.ts` to create a local JSON snapshot in `backups/` before attempting schema changes.

