# Kermingo 2026 — Sistema de Gestión de Entradas

Este es el sistema oficial de venta y control de accesos para el evento **Kermingo 2026**. Diseñado para operar sobre arquitectura Serverless de Vercel y base de datos Neon PostgreSQL.

---

## 🛠️ Stack Tecnológico
- **Frontend/Backend:** Next.js 16 (App Router) con soporte Turbopack.
- **Base de Datos:** Neon PostgreSQL.
- **ORM:** Prisma Client.
- **Envío de Correos:** Nodemailer (SMTP).
- **Control de Accesos:** Lector QR integrado en cliente (HTML5-QRCode).

---

## 🚀 Arquitectura y Optimizaciones del Sistema
Este proyecto fue diseñado con foco en la tolerancia a fallos, límites estrictos de almacenamiento y resiliencia en el día del evento.

### 1. Compresión de Imágenes en Cliente (Bypass de Limitaciones)
- **Problema:** Vercel restringe los payloads de subida en Serverless a 4.5MB. Adicionalmente, Neon (Free Tier) limita la base de datos a 500MB de almacenamiento. Guardar capturas de transferencias directamente en formato Base64 crudo saturaría el almacenamiento en menos de 100 transacciones.
- **Solución:** Implementamos un pre-procesador de imágenes en el cliente usando HTML5 Canvas (`compressImage`).
- **Resultado:** Cualquier captura en formato PNG/JPG (hasta 15MB) se escala y comprime automáticamente en el navegador a formato JPEG optimizado (calidad 60%, dimensiones máximas de 1200px) en <100ms. El archivo final pesa entre **70KB y 150KB**, lo que permite registrar más de **3,500 pedidos** dentro de la cuota gratuita de la base de datos sin saturar los límites de Vercel.

### 2. Blindaje de Conexiones a PostgreSQL (Connection Pooler)
- **Problema:** En entornos serverless, Vercel escala las funciones horizontalmente. Durante picos de tráfico, múltiples instancias concurrentes abren conexiones de base de datos simultáneas, saturando rápidamente los límites de Neon (capados a 20 conexiones simultáneas).
- **Solución:** En `src/lib/db.ts` limitamos la cuota del pool de `pg.Pool` en producción:
  - `max: 1` conexión por instancia serverless (evita abrir conexiones redundantes).
  - `idleTimeoutMillis: 1000` (cierre inmediato de conexiones inactivas para su reciclaje).
  - `connectionTimeoutMillis: 5000` (fallo rápido antes de agotar la duración máxima de ejecución del serverless).

### 3. Keep-Alive para Bases de Datos Neon (Bypass de Auto-Suspensión)
- **Problema:** Neon suspende la base de datos de manera automática tras 5 minutos de inactividad para ahorrar recursos. El primer usuario o escaneo de accesos tras un período inactivo experimentaría un retraso de 15 segundos hasta la reactivación de la base de datos (cold start).
- **Solución:** Implementamos una ruta `/api/keep-alive` que ejecuta una consulta ligera (`SELECT 1`).
- **Instrucción de despliegue:** Se recomienda programar un ping periódico cada 5 minutos al endpoint `https://<tu-app>.vercel.app/api/keep-alive` utilizando un servicio externo gratuito como **cron-job.org** para mantener el motor caliente el día del evento.

### 4. Sistema de Validación QR Offline-First
- **Problema:** En el ingreso del evento, la cobertura de red móvil (3G/4G/5G) suele saturarse o ser inestable. Una caída en la conexión impediría escanear entradas.
- **Solución:** El módulo de escáner en `/escaner` incluye un sistema offline robusto:
  - **Planilla Offline:** Los administradores pueden pre-cargar toda la base de datos de entradas aprobadas a `localStorage`.
  - **Validación Local:** Al activar el "Modo Offline" (o ante una falla de red), el escáner valida las entradas contrastándolas localmente, marcándolas como utilizadas al instante para prevenir doble accesos.
  - **Cola de Sincronización:** Los ingresos validados en modo offline se encolan en el almacenamiento local. Una vez recuperada la red, un botón permite subirlos en lote al servidor para sincronizar el estado global.

---

## 🔑 Variables de Entorno (.env)
Configura tu archivo `.env` en la raíz del proyecto basándote en el archivo `.env.example`:

```bash
DATABASE_URL="postgresql://usuario:contraseña@servidor:puerto/bd?sslmode=require"
ADMIN_PASSWORD="ContraseñaAdministrativaParaPanel"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="tu-correo@gmail.com"
SMTP_PASS="tu-contraseña-de-aplicación"
SMTP_FROM='"Kermingo 2026" <tu-correo@gmail.com>'
```

---

## 💻 Desarrollo Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Generar el cliente de Prisma y correr las migraciones:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. Correr el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Compilar en producción:
   ```bash
   npm run build
   ```
