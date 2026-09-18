'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function InvitacionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [loadingToken, setLoadingToken] = useState<boolean>(Boolean(token));
  const [tokenError, setTokenError] = useState<string | null>(
    !token ? 'No se proporcionó ningún token de invitación.' : null
  );
  const [eventData, setEventData] = useState<{
    email: string;
    eventName: string;
    eventSlug: string;
  } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'La invitación es inválida o ha expirado.');
        }
        setEventData(data);
      })
      .catch((err: Error) => {
        setTokenError(err.message);
      })
      .finally(() => {
        setLoadingToken(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al activar la cuenta.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${data.eventSlug}/admin`);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
        <div className="rounded-3xl border-4 border-[#D4AF37] bg-white p-8 text-center shadow-2xl">
          <p className="font-bold text-slate-600">Verificando invitación...</p>
        </div>
      </div>
    );
  }

  if (tokenError || !eventData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
        <div className="w-full max-w-md rounded-3xl border-4 border-red-400 bg-white p-8 text-center shadow-2xl">
          <span className="text-4xl block mb-2">❌</span>
          <h2 className="text-2xl font-bold text-slate-800">Invitación no válida</h2>
          <p className="mt-3 text-sm text-slate-600">
            {tokenError || 'El enlace de invitación no es válido o ya ha sido utilizado (validez de 24 horas).'}
          </p>
          <div className="mt-6">
            <Link
              href="/panel/login"
              className="inline-block rounded-xl bg-[#74ACDF] px-6 py-2.5 font-bold text-white shadow-md hover:bg-[#5490c4] transition"
            >
              Ir a Eventos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border-4 border-[#D4AF37] bg-white p-8 shadow-2xl">
        <div className="text-center mb-6">
          <span className="text-4xl block mb-2">🎟️</span>
          <h1 className="text-2xl font-black text-slate-800">Bienvenido a EventHub</h1>
          <p className="mt-1 text-sm font-bold text-[#74ACDF]">
            {eventData.eventName}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Cuenta de organizador: <span className="font-semibold">{eventData.email}</span>
          </p>
        </div>

        {success ? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center">
            <span className="text-4xl block mb-2">✅</span>
            <h3 className="text-lg font-bold text-emerald-800">¡Cuenta activada!</h3>
            <p className="text-xs text-emerald-600 mt-1">
              Redirigiendo a tu panel de administración...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Contraseña nueva
              </label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Confirmar contraseña
              </label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>

            {formError && (
              <p className="text-center text-xs font-bold text-red-600">
                ⚠ {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-[#74ACDF] to-[#5490c4] py-3.5 font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Activando cuenta...' : 'Activar cuenta y acceder 🚀'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function InvitacionPage() {
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
      <InvitacionContent />
    </Suspense>
  );
}
