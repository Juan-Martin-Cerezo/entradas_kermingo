'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Promoter {
  name: string;
  referral_code: string;
}

interface Purchase {
  id: string;
  buyer_email: string;
  receipt_url: string;
  quantity: number;
  payment_status: string;
  attendee_names: string;
  promoter?: Promoter | null;
  createdAt: string;
}

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);

  useEffect(() => {
    const savedPassword = localStorage.getItem('kermingo_admin_pass');
    if (savedPassword) {
      setPassword(savedPassword);
      verifyAndFetch(savedPassword);
    }
  }, []);

  const verifyAndFetch = async (passToVerify: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/purchases?password=${encodeURIComponent(passToVerify)}`);
      if (!res.ok) {
        throw new Error('Contraseña incorrecta o error de servidor.');
      }
      const data = await res.json();
      setPurchases(data);
      setIsAuthorized(true);
      localStorage.setItem('kermingo_admin_pass', passToVerify);
    } catch (err: any) {
      setError(err.message || 'Error de autenticación.');
      setIsAuthorized(false);
      localStorage.removeItem('kermingo_admin_pass');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    verifyAndFetch(password);
  };

  const handleAction = async (purchaseId: string, action: 'APPROVE' | 'REJECT') => {
    setActionLoadingId(purchaseId);
    setError(null);
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId, action, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al procesar la acción.');
      }

      if (data.warning) {
        alert(data.warning);
      }

      setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
    } catch (err: any) {
      setError(err.message || 'Error al procesar la acción.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kermingo_admin_pass');
    setPassword('');
    setIsAuthorized(false);
    setPurchases([]);
  };

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
        <div className="w-full max-w-md rounded-3xl border-4 border-[#D4AF37] bg-white p-8 shadow-2xl">
          <div className="mb-4 text-center">
            <span className="text-4xl">🔐</span>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">Panel de Administración</h2>
            <p className="text-sm text-slate-500">Ingresá la contraseña administrativa para continuar</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
            </div>
            {error && <p className="text-center text-sm font-bold text-red-600">⚠ {error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-[#74ACDF] to-[#5490c4] py-3 font-semibold text-white shadow-lg transition disabled:opacity-50"
            >
              {loading ? 'Accediendo...' : 'Ingresar 🇦🇷'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      {/* Navigation */}
      <nav className="border-b-4 border-[#D4AF37] bg-[#74ACDF] px-6 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/admin" className="text-xl font-black tracking-wider">
            🏆 KERMINGO 2026 ADMIN
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/admin/referidos" className="rounded-lg bg-white/20 px-4 py-2 text-sm font-bold hover:bg-white/30 transition">
              📊 Referidos
            </Link>
            <Link href="/escaner" className="rounded-lg bg-white/20 px-4 py-2 text-sm font-bold hover:bg-white/30 transition">
              📷 Escanear QR
            </Link>
            <button onClick={handleLogout} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold hover:bg-red-700 transition">
              Cerrar Sesión
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span>⏳</span> Transferencias Pendientes de Aprobación
          </h1>
          <span className="rounded-full bg-[#74ACDF]/20 px-3 py-1 text-sm font-bold text-[#437fb2]">
            {purchases.length} pendientes
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 border border-red-200 font-bold text-red-600">
            ⚠ Error: {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <svg className="animate-spin h-8 w-8 text-[#74ACDF]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : purchases.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
            <span className="text-5xl block mb-2">⭐</span>
            <p className="text-lg font-bold text-slate-600">¡Todo al día!</p>
            <p className="text-slate-400">No hay transferencias pendientes para revisar.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {purchases.map((purchase) => (
              <div key={purchase.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* Header */}
                <div className="bg-slate-50 p-4 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-800 truncate">{purchase.buyer_email}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(purchase.createdAt).toLocaleString('es-AR')}
                  </p>
                </div>

                {/* Details */}
                <div className="p-4 flex-1 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Cantidad:</span>
                    <span className="font-bold text-slate-800">{purchase.quantity} {purchase.quantity === 1 ? 'entrada' : 'entradas'}</span>
                  </div>
                  
                  {/* Attendee list */}
                  <div className="rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                    <span className="text-slate-500 font-bold block mb-1.5">Titulares de las Entradas:</span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 capitalize font-medium">
                      {(() => {
                        try {
                          const names = JSON.parse(purchase.attendee_names);
                          return names.map((name: string, i: number) => (
                            <li key={i} className="truncate">{name}</li>
                          ));
                        } catch {
                          return <li>No especificado</li>;
                        }
                      })()}
                    </ol>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total pagado:</span>
                    <span className="font-extrabold text-[#D4AF37]">
                      ${(purchase.quantity * 5500).toLocaleString('es-AR')}
                    </span>
                  </div>

                  {purchase.promoter && (
                    <div className="flex justify-between rounded-lg bg-[#74ACDF]/10 p-2 text-xs">
                      <span className="text-slate-600">Referido:</span>
                      <span className="font-bold text-[#437fb2]">
                        {purchase.promoter.name} ({purchase.promoter.referral_code})
                      </span>
                    </div>
                  )}
                  
                  {/* View Receipt Button */}
                  <button
                    onClick={() => setSelectedReceipt(purchase.receipt_url)}
                    className="w-full rounded-lg border border-[#74ACDF] bg-white py-2 text-sm font-bold text-[#74ACDF] hover:bg-[#74ACDF]/5 transition"
                  >
                    🔍 Ver Comprobante
                  </button>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 border-t border-slate-100 p-2 gap-2 bg-slate-50">
                  <button
                    onClick={() => handleAction(purchase.id, 'REJECT')}
                    disabled={actionLoadingId !== null}
                    className="rounded-lg bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleAction(purchase.id, 'APPROVE')}
                    disabled={actionLoadingId !== null}
                    className="rounded-lg bg-green-500 py-2.5 text-sm font-bold text-white hover:bg-green-600 transition disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {actionLoadingId === purchase.id ? (
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      'Aprobar ⚽'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Image Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelectedReceipt(null)}>
          <div className="relative max-h-full max-w-3xl overflow-hidden rounded-2xl bg-white p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedReceipt(null)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white font-bold hover:bg-black"
            >
              ✕
            </button>
            <div className="max-h-[80vh] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedReceipt}
                alt="Comprobante de pago"
                className="mx-auto h-auto max-w-full rounded-lg"
              />
            </div>
            <div className="p-3 text-center text-sm text-slate-500 border-t mt-2">
              <a href={selectedReceipt} download className="font-bold text-[#74ACDF] hover:underline">
                ⬇ Descargar archivo original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
