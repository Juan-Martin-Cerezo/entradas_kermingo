'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type State =
  | { status: 'loading' }
  | { status: 'ok'; email: string; eventName: string; eventSlug: string }
  | { status: 'error'; message: string };

function VerificarContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<State>(() =>
    !searchParams.get('token')
      ? { status: 'error', message: 'No se proporcionó ningún token de verificación.' }
      : { status: 'loading' }
  );

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      return;
    }
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error || 'La verificación es inválida o ha expirado.');
        }
        setState({
          status: 'ok',
          email: data.email,
          eventName: data.eventName,
          eventSlug: data.eventSlug,
        });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({ status: 'error', message: err.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const card =
    'w-full max-w-md rounded-3xl border-4 bg-white p-8 text-center shadow-2xl';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
      {state.status === 'loading' && (
        <div className={`${card} border-[#D4AF37]`}>
          <p className="font-bold text-slate-600">Verificando tu email...</p>
        </div>
      )}

      {state.status === 'ok' && (
        <div className={`${card} border-emerald-400`}>
          <span className="text-4xl block mb-2">✅</span>
          <h1 className="text-2xl font-black text-slate-800">¡Email verificado!</h1>
          <p className="mt-3 text-sm text-slate-600">
            Cuenta <span className="font-semibold">{state.email}</span> verificada
            para el evento <span className="font-semibold">{state.eventName}</span>.
          </p>
          <div className="mt-6">
            <Link
              href={`/${state.eventSlug}/admin`}
              className="inline-block rounded-xl bg-[#74ACDF] px-6 py-2.5 font-bold text-white shadow-md hover:bg-[#5490c4] transition"
            >
              Ir a mi panel →
            </Link>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className={`${card} border-red-400`}>
          <span className="text-4xl block mb-2">❌</span>
          <h2 className="text-2xl font-bold text-slate-800">Verificación no válida</h2>
          <p className="mt-3 text-sm text-slate-600">{state.message}</p>
          <div className="mt-6">
            <Link
              href="/registro"
              className="inline-block rounded-xl bg-[#74ACDF] px-6 py-2.5 font-bold text-white shadow-md hover:bg-[#5490c4] transition"
            >
              Volver al registro
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerificarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF]">
          <div className="rounded-3xl border-4 border-[#D4AF37] bg-white p-8 text-center shadow-2xl">
            <p className="font-bold text-slate-600">Cargando...</p>
          </div>
        </div>
      }
    >
      <VerificarContent />
    </Suspense>
  );
}
