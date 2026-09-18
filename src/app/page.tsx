'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface EventItem {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export default function HomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/events')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: EventItem[]) => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div suppressHydrationWarning className="flex min-h-screen flex-col bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF]">
      <header className="py-10 text-center text-slate-800 px-4">
        <div className="mx-auto mb-3 flex justify-center gap-2 text-4xl">
          <span>🎟️</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          EventHub
        </h1>
        <p className="mt-2 text-lg font-bold text-slate-700">
          Elegí tu evento y conseguí tus entradas
        </p>
      </header>

      <main className="flex-1 px-4 pb-16">
        <div className="mx-auto max-w-xl">
          {loading ? (
            <p className="text-center text-slate-500 font-semibold">Cargando eventos...</p>
          ) : events.length === 0 ? (
            <div className="rounded-3xl border-4 border-[#D4AF37] bg-white/95 p-8 text-center shadow-2xl">
              <p className="text-slate-600 font-semibold">No hay eventos a la venta por el momento.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/${event.slug}`}
                  className="rounded-3xl border-4 border-[#D4AF37] bg-white/95 p-6 shadow-2xl transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <h2 className="text-2xl font-bold text-slate-800">{event.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#5490c4]">
                    Conseguir entradas →
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
