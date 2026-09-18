import Link from 'next/link';

// No se listan eventos: cada evento tiene su propio link y sólo se llega con él.
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4 text-center">
      <div className="w-full max-w-lg rounded-3xl border-4 border-[#D4AF37] bg-white/95 p-8 shadow-2xl">
        <div className="mb-2 text-4xl">🎟️</div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-800">EventHub</h1>
        <p className="mt-3 text-slate-600 font-semibold">
          Plataforma de entradas para eventos. Cada evento tiene su propio link de venta.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Si te compartieron un link de tu evento, abrilo directamente. Para administrar tus eventos entrá al panel.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/panel/login" className="rounded-xl bg-[#74ACDF] px-5 py-3 font-bold text-white hover:opacity-90">
            Panel de administración
          </Link>
          <Link href="/registro" className="rounded-xl border-2 border-[#D4AF37] px-5 py-3 font-bold text-slate-700 hover:bg-amber-50">
            Publicar mi evento
          </Link>
        </div>
      </div>
    </div>
  );
}
