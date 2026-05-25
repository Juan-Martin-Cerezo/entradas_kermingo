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
      const res = await fetch(`/api/admin/asistentes?password=${encodeURIComponent(passToVerify)}`);
      if (!res.ok) {
        throw new Error('Contraseña incorrecta o error de servidor.');
      }
      const data = await res.json();
      setAssistants(data);
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

  const handleCheckin = async (ticketId: string, currentStatus: boolean) => {
    setActionLoadingId(ticketId);
    setError(null);
    const action = currentStatus ? 'RESET' : 'CHECKIN';
    try {
      const res = await fetch('/api/admin/asistentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action, password }),
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

  const handleLogout = () => {
    localStorage.removeItem('kermingo_admin_pass');
    setPassword('');
    setIsAuthorized(false);
    setAssistants([]);
  };

  const filteredAssistants = assistants.filter((a) => {
    const query = search.toLowerCase();
    return (
      a.holderName.toLowerCase().includes(query) ||
      a.buyerEmail.toLowerCase().includes(query) ||
      a.promoterName.toLowerCase().includes(query)
    );
  });

  const totalCount = assistants.length;
  const insideCount = assistants.filter((a) => a.entryStatus).length;
  const pendingCount = totalCount - insideCount;

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4">
        <div className="w-full max-w-md rounded-3xl border-4 border-[#D4AF37] bg-white p-8 shadow-2xl">
          <div className="mb-4 text-center">
            <span className="text-4xl">📋</span>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">Planilla de Asistentes</h2>
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
            <button onClick={handleLogout} className="rounded-lg bg-red-650 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-red-700 transition whitespace-nowrap">
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
            <p className="text-sm text-slate-500 mt-1">Usa esta planilla si los códigos QR no pueden ser escaneados en la puerta.</p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-[#74ACDF] hover:underline">
            ← Volver a Panel
          </Link>
        </div>

        {/* Totals Summary */}
        <div className="mb-6 grid gap-4 grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
            <span className="text-slate-400 text-xs font-bold uppercase block">Asistentes Totales</span>
            <span className="text-2xl font-black text-slate-800">{totalCount}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
            <span className="text-slate-400 text-xs font-bold uppercase block text-emerald-600">Ingresaron</span>
            <span className="text-2xl font-black text-emerald-600">{insideCount}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
            <span className="text-slate-400 text-xs font-bold uppercase block text-amber-600">Restantes</span>
            <span className="text-2xl font-black text-amber-600">{pendingCount}</span>
          </div>
        </div>

        {/* Search Filter */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por nombre del asistente, mail del comprador o Scout..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
          />
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
        ) : filteredAssistants.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
            <span className="text-4xl block mb-2">🔍</span>
            <p className="text-slate-600 font-bold">No se encontraron asistentes</p>
            <p className="text-slate-400">Prueba con otra palabra clave o verifica si hay entradas aprobadas.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {filteredAssistants.map((assistant) => (
                <div key={assistant.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 transition">
                  <div className="flex-1 min-w-[250px]">
                    <p className="text-base font-extrabold text-slate-800 capitalize">
                      {assistant.holderName}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                      <span><strong>Comprador:</strong> {assistant.buyerEmail}</span>
                      <span><strong>Referido por:</strong> {assistant.promoterName}</span>
                    </div>
                    {assistant.entryStatus && (
                      <p className="text-[10px] font-bold text-emerald-600 mt-1">
                        ✓ Ingresó el {new Date(assistant.entryDate!).toLocaleString('es-AR')}
                      </p>
                    )}
                  </div>
                  <div>
                    <button
                      onClick={() => handleCheckin(assistant.id, assistant.entryStatus)}
                      disabled={actionLoadingId === assistant.id}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition active:scale-95 flex items-center gap-1 ${
                        assistant.entryStatus
                          ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          : 'bg-emerald-500 text-white hover:bg-emerald-600'
                      }`}
                    >
                      {actionLoadingId === assistant.id ? (
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                      ) : assistant.entryStatus ? (
                        'Reestablecer 🔄'
                      ) : (
                        'Validar Ingreso Manual 🟢'
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
