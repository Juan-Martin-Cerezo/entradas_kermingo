'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function RegistroContent() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [step, setStep] = useState<'register' | 'wizard'>('register');

  const [eventName, setEventName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [fecha, setFecha] = useState('');
  const [ticketPricePesos, setTicketPricePesos] = useState('5000');
  const [payAlias, setPayAlias] = useState('');
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardWarnings, setWizardWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/auth/register')
      .then((res) => res.json())
      .then((data) => setOpen(Boolean(data.open)))
      .catch(() => setOpen(false))
      .finally(() => setChecking(false));
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al registrarse.');
      }
      setStep('wizard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    setWizardError(null);
    setWizardWarnings([]);

    if (!eventName.trim() || !newSlug.trim()) {
      setWizardError('Nombre y slug del evento son obligatorios.');
      return;
    }

    const priceCents = Math.round(Number(ticketPricePesos) * 100);
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      setWizardError('El precio debe ser un número positivo en pesos.');
      return;
    }

    setWizardLoading(true);
    try {
      const res = await fetch('/api/auth/register/event', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventName.trim(),
          slug: newSlug.trim(),
          fecha: fecha.trim() || undefined,
          ticketPriceCents: priceCents,
          payAlias: payAlias.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al configurar el evento.');
      }
      setWizardWarnings(data.warnings ?? []);
      setTimeout(() => {
        router.push(`/${data.event.slug}/admin`);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado.';
      setWizardError(message);
    } finally {
      setWizardLoading(false);
    }
  };

  const card = 'w-full max-w-md rounded-3xl border-4 border-[#D4AF37] bg-white p-8 shadow-2xl';

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
        <div className={card}>
          <p className="text-center font-bold text-slate-600">Cargando registro...</p>
        </div>
      </div>
    );
  }

  if (!open && step === 'register') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
        <div className={`${card} text-center`}>
          <span className="text-4xl block mb-2">🔒</span>
          <h1 className="text-2xl font-black text-slate-800">Registro cerrado</h1>
          <p className="mt-3 text-sm text-slate-600">
            Esta instancia de EventHub no acepta registros públicos por el momento.
            Pedí una invitación al administrador de la plataforma.
          </p>
          <div className="mt-6">
            <Link
              href="/panel/login"
              className="inline-block rounded-xl bg-[#74ACDF] px-6 py-2.5 font-bold text-white shadow-md hover:bg-[#5490c4] transition"
            >
              Ver eventos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'wizard') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4 py-8">
        <div className={card}>
          <div className="text-center mb-6">
            <span className="text-4xl block mb-2">🎉</span>
            <h1 className="text-2xl font-black text-slate-800">¡Cuenta creada!</h1>
            <p className="mt-1 text-sm text-slate-600">
              Revisá tu email para verificar la cuenta. Ahora configurá tu primer evento:
            </p>
          </div>

          <form onSubmit={handleWizard} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Nombre del evento
              </label>
              <input
                type="text"
                required
                value={eventName}
                onChange={(e) => {
                  const val = e.target.value;
                  setEventName(val);
                  if (!slugTouched) {
                    setNewSlug(slugify(val));
                  }
                }}
                placeholder="Fiesta de Fin de Año 2026"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Slug (URL pública)
              </label>
              <input
                type="text"
                required
                value={newSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setNewSlug(e.target.value);
                }}
                placeholder="fiesta-fin-de-ano-2026"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                Solo minúsculas, números y guiones. Tu venta va a estar en /{newSlug || 'tu-slug'}.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Fecha (opcional)
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Precio por entrada (pesos)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={ticketPricePesos}
                onChange={(e) => setTicketPricePesos(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Alias para cobrar (opcional)
              </label>
              <input
                type="text"
                value={payAlias}
                onChange={(e) => setPayAlias(e.target.value)}
                placeholder="mi.alias.pagos"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>

            {wizardError && (
              <p className="text-center text-xs font-bold text-red-600">⚠ {wizardError}</p>
            )}

            {wizardWarnings.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                {wizardWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={wizardLoading}
              className="w-full rounded-xl bg-gradient-to-r from-[#74ACDF] to-[#5490c4] py-3.5 font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {wizardLoading ? 'Guardando...' : 'Crear mi evento 🚀'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4 py-8">
      <div className={card}>
        <div className="text-center mb-6">
          <span className="text-4xl block mb-2">🎟️</span>
          <h1 className="text-2xl font-black text-slate-800">Creá tu cuenta en EventHub</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registrate como organizador y creá tu primer evento.
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@tuevento.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
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
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
            />
          </div>

          {formError && (
            <p className="text-center text-xs font-bold text-red-600">⚠ {formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-[#74ACDF] to-[#5490c4] py-3.5 font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Creando cuenta...' : 'Registrarme 🚀'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          ¿Ya tenés cuenta? Entrá desde el panel de tu evento.
        </p>
      </div>
    </div>
  );
}

export default function RegistroPage() {
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
      <RegistroContent />
    </Suspense>
  );
}
