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
