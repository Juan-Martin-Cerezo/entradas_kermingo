'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Assistant {
  id: string;
  holderName: string;
  entryStatus: boolean;
  entryDate: string | null;
  buyerEmail: string;
  promoterName: string;
}

export default function AsistentesBackupPage() {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const verifyAndFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/asistentes');
      if (!res.ok) {
        throw new Error('No autorizado.');
      }
      const data = await res.json();
      setAssistants(data);
      setIsAuthorized(true);
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

  const handleCheckin = async (ticketId: string, currentStatus: boolean) => {
    setActionLoadingId(ticketId);
    setError(null);
    const action = currentStatus ? 'RESET' : 'CHECKIN';
    try {
      const res = await fetch('/api/admin/asistentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action }),
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
        throw new Error(data?.error || 'Ocurrió un error al procesar el ingreso.');
      }

      // Update state
      setAssistants((prev) =>
        prev.map((a) =>
          a.id === ticketId
            ? { ...a, entryStatus: !currentStatus, entryDate: action === 'CHECKIN' ? new Date().toISOString() : null }
            : a
        )
      );
    } catch (err: any) {
      setError(err.message || 'Error al actualizar el estado.');
    } finally {
      setActionLoadingId(null);
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
    setAssistants([]);
  };

  const filteredAssistants = assistants.filter(
    (a) =>
      a.holderName.toLowerCase().includes(search.toLowerCase()) ||
      a.buyerEmail.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
  );

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
            <Link href="/admin" className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-white/30 transition whitespace-nowrap">
              ⏳ Aprobaciones
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
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <span>📋</span> Planilla Física de Respaldo
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Lista para verificar ingresos manualmente en puerta si el scanner QR falla
            </p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre, email o ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 border border-red-200 font-bold text-red-600">
            ⚠ {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-[#74ACDF]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : filteredAssistants.length === 0 ? (
            <div className="py-16 text-center text-slate-400 font-semibold">
              No se encontraron asistentes aprobados en la lista.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-700">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-800 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4">Titular</th>
                    <th className="px-6 py-4">Comprador</th>
                    <th className="px-6 py-4">Vendedor (Referido)</th>
                    <th className="px-6 py-4">ID Ticket</th>
                    <th className="px-6 py-4 text-center">Acceso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssistants.map((assistant) => (
                    <tr key={assistant.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4 font-bold text-slate-800 capitalize">{assistant.holderName}</td>
                      <td className="px-6 py-4">{assistant.buyerEmail}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-[#437fb2]">
                        {assistant.promoterName !== 'Ninguno' ? `Scout ${assistant.promoterName}` : '-'}
                      </td>
                      <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{assistant.id}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleCheckin(assistant.id, assistant.entryStatus)}
                          disabled={actionLoadingId === assistant.id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                            assistant.entryStatus
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200'
                          }`}
                        >
                          {actionLoadingId === assistant.id ? (
                            '...'
                          ) : assistant.entryStatus ? (
                            `✓ Ingresó (${assistant.entryDate ? new Date(assistant.entryDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''})`
                          ) : (
                            'Marcar Ingreso'
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
