'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TICKET_PRICE } from '@/lib/constants';

interface Promoter {
  id: string;
  name: string;
  referral_code: string;
}

interface Purchase {
  id: string;
  buyer_email: string;
  quantity: number;
  payment_status: string;
  attendee_names: string;
  dietary_preferences?: string;
  promoter?: Promoter | null;
  email_sent: boolean;
  createdAt: string;
}

interface Stats {
  approvedTickets: number;
  pendingTickets: number;
  rejectedTickets: number;
  approvedPurchasesCount: number;
  pendingPurchasesCount: number;
  rejectedPurchasesCount: number;
  totalEarnings: number;
}

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const verifyAndFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/purchases');
      if (!res.ok) {
        throw new Error('No autorizado.');
      }
      const data = await res.json();
      setPurchases(data);
      setIsAuthorized(true);
      await fetchStats();
    } catch (err: any) {
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyAndFetch();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Contraseña incorrecta.');
      }
      await verifyAndFetch();
    } catch (err: any) {
      setError(err.message || 'Error de autenticación.');
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (purchaseId: string, action: 'APPROVE' | 'REJECT' | 'DELETE' | 'RESEND_EMAIL') => {
    if (action === 'DELETE' && !confirm('¿Estás seguro de que deseas eliminar esta compra? Esto borrará también todas sus entradas y códigos QR asociados.')) {
      return;
    }

    setActionLoadingId(purchaseId + '_' + action);
    setError(null);
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId, action }),
      });

      let data: any = null;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          // ignore
        }
      }

      if (!res.ok) {
        throw new Error(data?.error || `Error del servidor (${res.status}).`);
      }

      if (data.warning) {
        alert(data.warning);
      }

      // Update state local list
      if (action === 'DELETE') {
        setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
      } else if (action === 'RESEND_EMAIL') {
        setPurchases((prev) =>
          prev.map((p) =>
            p.id === purchaseId
              ? { ...p, email_sent: true }
              : p
          )
        );
        alert('Email reenviado correctamente.');
      } else {
        // Update local status so it moves to respective tab
        setPurchases((prev) =>
          prev.map((p) =>
            p.id === purchaseId
              ? { ...p, payment_status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', email_sent: action === 'APPROVE' }
              : p
          )
        );
      }
      await fetchStats();
    } catch (err: any) {
      setError(err.message || 'Error al procesar la acción.');
      // If action failed but update occurred (e.g. resend failed) update local status
      if (action === 'RESEND_EMAIL') {
        setPurchases((prev) =>
          prev.map((p) =>
            p.id === purchaseId
              ? { ...p, email_sent: false }
              : p
          )
        );
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const viewReceipt = async (purchaseId: string) => {
    try {
      const res = await fetch(`/api/admin/purchases/receipt?id=${purchaseId}`);
      if (!res.ok) {
        throw new Error('No se pudo cargar el comprobante.');
      }
      const data = await res.json();
      setSelectedReceipt(data.receipt_url);
    } catch (err: any) {
      alert(err.message || 'Error al cargar el comprobante.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout failed:', err);
    }
    setPassword('');
    setIsAuthorized(false);
    setPurchases([]);
    setStats(null);
  };

  const filteredPurchases = purchases.filter((p) => p.payment_status === activeTab);

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
      <nav className="border-b-4 border-[#D4AF37] bg-[#74ACDF] px-4 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="text-lg sm:text-xl font-black tracking-wider whitespace-nowrap">
            🏆 KERMINGO 2026 ADMIN
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/asistentes" className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-white/30 transition whitespace-nowrap">
              📋 Planilla
            </Link>
            <Link href="/admin/referidos" className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-white/30 transition whitespace-nowrap">
              📊 Referidos
            </Link>
            <Link href="/escaner" className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-white/30 transition whitespace-nowrap">
              📷 Escanear QR
            </Link>
            <button onClick={handleLogout} className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-red-700 transition whitespace-nowrap cursor-pointer">
              Cerrar
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        
        {/* Statistics Panels */}
        {stats && (
          <section className="mb-8 grid gap-4 grid-cols-2 md:grid-cols-4">
            <div className="rounded-2xl border-4 border-[#D4AF37] bg-white p-5 shadow-md text-center">
              <span className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase block">Entradas Vendidas</span>
              <span className="text-xl sm:text-3xl font-extrabold text-[#D4AF37] mt-1">
                {stats.approvedTickets} ⚽
              </span>
            </div>
            <div className="rounded-2xl border-4 border-emerald-500 bg-white p-5 shadow-md text-center">
              <span className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase block">Recaudado (Total)</span>
              <span className="text-xl sm:text-3xl font-extrabold text-emerald-600 mt-1">
                ${stats.totalEarnings.toLocaleString('es-AR')}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center">
              <span className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase block text-[#74ACDF]">Por Verificar</span>
              <span className="text-xl sm:text-3xl font-extrabold text-[#74ACDF] mt-1">
                {stats.pendingTickets} ⏳
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center">
              <span className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase block text-red-500">Rechazadas</span>
              <span className="text-xl sm:text-3xl font-extrabold text-red-500 mt-1">
                {stats.rejectedTickets} ✕
              </span>
            </div>
          </section>
        )}

        {/* Tabbed Interface */}
        <div className="mb-6 flex border-b border-slate-200 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('PENDING')}
            className={`px-6 py-2.5 font-bold text-sm border-b-4 transition cursor-pointer ${
              activeTab === 'PENDING'
                ? 'border-[#74ACDF] text-[#437fb2]'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Pendientes de Pago ({purchases.filter((p) => p.payment_status === 'PENDING').length})
          </button>
          <button
            onClick={() => setActiveTab('APPROVED')}
            className={`px-6 py-2.5 font-bold text-sm border-b-4 transition cursor-pointer ${
              activeTab === 'APPROVED'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Aprobados ({purchases.filter((p) => p.payment_status === 'APPROVED').length})
          </button>
          <button
            onClick={() => setActiveTab('REJECTED')}
            className={`px-6 py-2.5 font-bold text-sm border-b-4 transition cursor-pointer ${
              activeTab === 'REJECTED'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Rechazados ({purchases.filter((p) => p.payment_status === 'REJECTED').length})
          </button>
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
        ) : filteredPurchases.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
            <span className="text-5xl block mb-2">⭐</span>
            <p className="text-lg font-bold text-slate-600">¡Ninguno por acá!</p>
            <p className="text-slate-400">No hay transferencias registradas en esta categoría.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* Header */}
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center gap-2">
                  <div className="truncate">
                    <p className="text-sm font-bold text-slate-800 truncate">{purchase.buyer_email}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(purchase.createdAt).toLocaleString('es-AR')}
                    </p>
                  </div>
                  {/* Quick Delete Trash Icon for any tab */}
                  <button
                    onClick={() => handleAction(purchase.id, 'DELETE')}
                    disabled={actionLoadingId === purchase.id + '_DELETE'}
                    className="text-red-500 hover:text-red-700 hover:bg-red-550 p-1.5 rounded-lg transition cursor-pointer"
                    title="Eliminar registro"
                  >
                    🗑️
                  </button>
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

                  {purchase.dietary_preferences && (
                    <div className="rounded-xl bg-amber-50 p-3 text-xs border border-amber-150">
                      <span className="text-amber-800 font-bold block mb-1">Restricciones/Preferencias:</span>
                      <p className="text-slate-700 font-medium">{purchase.dietary_preferences}</p>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total pagado:</span>
                    <span className="font-extrabold text-[#D4AF37]">
                      ${(purchase.quantity * TICKET_PRICE).toLocaleString('es-AR')}
                    </span>
                  </div>

                  {purchase.promoter && (
                    <div className="flex justify-between rounded-lg bg-[#74ACDF]/10 p-2 text-xs">
                      <span className="text-slate-600">Referido por:</span>
                      <span className="font-bold text-[#437fb2]">
                        Scout {purchase.promoter.name}
                      </span>
                    </div>
                  )}
                  
                  {/* View Receipt Button */}
                  <button
                    onClick={() => viewReceipt(purchase.id)}
                    className="w-full rounded-lg border border-[#74ACDF] bg-white py-2 text-sm font-bold text-[#74ACDF] hover:bg-[#74ACDF]/5 transition cursor-pointer"
                  >
                    🔍 Ver Comprobante
                  </button>
                </div>

                {/* Tab Actions */}
                {purchase.payment_status === 'PENDING' && (
                  <div className="grid grid-cols-2 border-t border-slate-100 p-2 gap-2 bg-slate-50">
                    <button
                      onClick={() => handleAction(purchase.id, 'REJECT')}
                      disabled={actionLoadingId === purchase.id + '_REJECT'}
                      className="rounded-lg bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition disabled:opacity-50 cursor-pointer"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleAction(purchase.id, 'APPROVE')}
                      disabled={actionLoadingId === purchase.id + '_APPROVE'}
                      className="rounded-lg bg-green-500 py-2.5 text-sm font-bold text-white hover:bg-green-600 transition disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {actionLoadingId === purchase.id + '_APPROVE' ? (
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        'Aprobar ⚽'
                      )}
                    </button>
                  </div>
                )}

                {purchase.payment_status === 'APPROVED' && (
                  <div className="border-t border-slate-100 p-2 bg-slate-50 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      Email: {purchase.email_sent ? '🟢 Enviado' : '🔴 Falló'}
                    </span>
                    <button
                      onClick={() => handleAction(purchase.id, 'RESEND_EMAIL')}
                      disabled={actionLoadingId === purchase.id + '_RESEND_EMAIL'}
                      className="rounded-lg bg-[#74ACDF]/15 border border-[#74ACDF]/30 px-2.5 py-1.5 text-xs font-bold text-[#437fb2] hover:bg-[#74ACDF]/30 transition disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoadingId === purchase.id + '_RESEND_EMAIL' ? 'Enviando...' : 'Reenviar ✉️'}
                    </button>
                  </div>
                )}

                {purchase.payment_status === 'REJECTED' && (
                  <div className="border-t border-slate-100 p-2.5 bg-slate-50 text-center text-xs font-bold text-red-500">
                    🔴 RECHAZADO
                  </div>
                )}
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
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white font-bold hover:bg-black cursor-pointer"
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
