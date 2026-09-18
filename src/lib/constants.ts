export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// No existe un "evento por defecto": cada evento vive en su propio /<slug>.
export const RESERVED_SLUGS = new Set([
  'api',
  '_next',
  'static',
  'favicon.ico',
  'eventos',
  'admin',
  'escaner',
  'invitacion',
  'panel',
  'registro',
  'verificar',
]);
