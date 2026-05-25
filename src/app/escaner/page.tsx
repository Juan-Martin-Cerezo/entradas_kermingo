'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Dynamically import QrScanner component with SSR disabled
const QrScanner = dynamic(() => import('@/components/QrScanner'), { ssr: false });

interface ScanResult {
  success: boolean;
  data?: {
    buyerEmail: string;
    holderName: string;
    ticketId: string;
    entryDate: string;
  };
  error?: string;
}

export default function EscanerPage() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [offlineDb, setOfflineDb] = useState<any[] | null>(null);
  const [forceOffline, setForceOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Load configuration from localStorage
  useEffect(() => {
    const savedDb = localStorage.getItem('kermingo_offline_db');
    if (savedDb) {
      try {
        setOfflineDb(JSON.parse(savedDb));
      } catch (err) {
        console.error('Failed to parse offline DB', err);
      }
    }

    const savedPending = localStorage.getItem('kermingo_pending_sync');
    if (savedPending) {
      try {
        setPendingSync(JSON.parse(savedPending));
      } catch (err) {
        console.error('Failed to parse pending syncs', err);
      }
    }
  }, []);

  const downloadOfflineDb = async () => {
    try {
      const res = await fetch('/api/admin/asistentes');
      if (!res.ok) {
        throw new Error('No autorizado. Por favor ingresá al panel admin primero.');
      }
      const data = await res.json();
      setOfflineDb(data);
      localStorage.setItem('kermingo_offline_db', JSON.stringify(data));
      alert(`¡Éxito! Se descargaron ${data.length} entradas autorizadas para validación offline.`);
    } catch (err: any) {
      alert('Error: ' + (err.message || 'No se pudo descargar la planilla.'));
    }
  };

  const onOfflineScan = (ticketId: string): ScanResult => {
    if (!offlineDb || offlineDb.length === 0) {
      return { success: false, error: 'MODO OFFLINE: Descargá la planilla primero.' };
    }

    const cleanId = ticketId.trim();
    const ticketIndex = offlineDb.findIndex((t) => t.id === cleanId);

    if (ticketIndex === -1) {
      return { success: false, error: 'TICKET NOT FOUND' };
    }

    const ticket = offlineDb[ticketIndex];

    if (ticket.entryStatus) {
      return {
        success: false,
        error: 'TICKET ALREADY USED',
      };
    }

    // Mark as checked in locally
    const updatedDb = [...offlineDb];
    updatedDb[ticketIndex] = {
      ...ticket,
      entryStatus: true,
      entryDate: new Date().toISOString(),
    };
    setOfflineDb(updatedDb);
    localStorage.setItem('kermingo_offline_db', JSON.stringify(updatedDb));

    // Queue for sync
    const updatedPending = [...pendingSync, cleanId];
    setPendingSync(updatedPending);
    localStorage.setItem('kermingo_pending_sync', JSON.stringify(updatedPending));

    return {
      success: true,
      data: {
        ticketId: ticket.id,
        holderName: ticket.holderName,
        buyerEmail: ticket.buyerEmail,
        entryDate: updatedDb[ticketIndex].entryDate,
      },
    };
  };

  const syncOfflineScans = async () => {
    if (pendingSync.length === 0) return;
    setSyncing(true);

    const successfulSyncs: string[] = [];

    try {
      for (const ticketId of pendingSync) {
        const res = await fetch('/api/admin/asistentes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, action: 'CHECKIN' }),
        });

        if (res.ok) {
          successfulSyncs.push(ticketId);
        } else {
          if (res.status === 401) {
            throw new Error('Sesión de administrador vencida. Por favor, logueate de vuelta en el panel.');
          }
        }
      }

      // Remove successful syncs from queue
      const remainingPending = pendingSync.filter((id) => !successfulSyncs.includes(id));
      setPendingSync(remainingPending);
      localStorage.setItem('kermingo_pending_sync', JSON.stringify(remainingPending));

      if (remainingPending.length === 0) {
        alert('¡Sincronización completada! Todos los registros offline fueron subidos al servidor.');
      } else {
        alert(`Sincronización parcial: se subieron ${successfulSyncs.length} de ${pendingSync.length} scans.`);
      }
    } catch (err: any) {
      alert('Error en sincronización: ' + (err.message || 'Error de conexión.'));
    } finally {
      setSyncing(false);
    }
  };

  const handleScanResult = (result: { success: boolean; data?: any; error?: string }) => {
    setScanResult(result);
  };

  const handleReset = () => {
    setScanResult(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      {/* Admin Navbar */}
      <nav className="border-b-4 border-[#D4AF37] bg-[#74ACDF] px-4 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="text-base sm:text-lg font-black tracking-wider flex items-center gap-1 whitespace-nowrap">
            <span>🏆</span> KERMINGO 2026
          </Link>
          <div className="flex flex-wrap gap-1.5">
            <Link href="/admin" className="text-xs sm:text-sm font-bold bg-white/20 px-2.5 py-1.5 rounded-lg hover:bg-white/30 transition whitespace-nowrap">
              Panel
            </Link>
            <Link href="/admin/asistentes" className="text-xs sm:text-sm font-bold bg-white/20 px-2.5 py-1.5 rounded-lg hover:bg-white/30 transition whitespace-nowrap">
              Planilla
            </Link>
            <Link href="/" className="text-xs sm:text-sm font-bold bg-white/20 px-2.5 py-1.5 rounded-lg hover:bg-white/30 transition whitespace-nowrap">
              Comprar
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Scanner Page */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {scanResult === null ? (
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-black mb-1 text-[#74ACDF]">SOL DE MAYO</h1>
            <p className="text-sm text-slate-400 mb-6">Control de Acceso / Validación de Entradas</p>

            {/* Offline Control Dashboard */}
            <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 shadow-lg text-left">
              <h3 className="text-xs font-black text-[#74ACDF] mb-3 flex items-center justify-between uppercase tracking-wider">
                <span>🔌 Modo Offline & Sincronización</span>
                <span className={`h-2.5 w-2.5 rounded-full ${forceOffline ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
              </h3>

              <div className="space-y-3 text-[11px] font-semibold text-slate-300">
                <div className="flex justify-between items-center gap-2">
                  <span>Modo Scanner:</span>
                  <button
                    onClick={() => setForceOffline(!forceOffline)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                      forceOffline ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-700 hover:bg-slate-650 text-slate-200'
                    }`}
                  >
                    {forceOffline ? '⚠️ FORZAR OFFLINE' : '🟢 AUTOMÁTICO (ONLINE-FIRST)'}
                  </button>
                </div>

                <div className="flex justify-between items-center gap-2 border-t border-slate-700/50 pt-2">
                  <span>Base Offline:</span>
                  <div className="flex items-center gap-2">
                    {offlineDb && (
                      <span className="text-[10px] text-slate-400 font-bold bg-white/5 px-2 py-1 rounded">
                        {offlineDb.length} cargadas
                      </span>
                    )}
                    <button
                      onClick={downloadOfflineDb}
                      className="bg-[#74ACDF]/20 text-[#74ACDF] border border-[#74ACDF]/30 px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-[#74ACDF]/30 transition cursor-pointer"
                    >
                      {offlineDb ? '🔄 Actualizar' : '📥 Descargar'}
                    </button>
                  </div>
                </div>

                {pendingSync.length > 0 && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 mt-2 flex flex-col gap-2">
                    <p className="font-bold text-amber-400 text-[10px] uppercase tracking-wide">
                      ⚠️ scans pendientes offline: {pendingSync.length}
                    </p>
                    <button
                      onClick={syncOfflineScans}
                      disabled={syncing}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-black py-2 rounded-lg text-[10px] transition disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                    >
                      {syncing ? 'Sincronizando...' : '⬆️ Subir Scans al Servidor'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <QrScanner
              onScanResult={handleScanResult}
              forceOffline={forceOffline}
              onOfflineScan={onOfflineScan}
            />
          </div>
        ) : (
          <div className="w-full max-w-md animate-fade-in">
            {scanResult.success ? (
              /* Success Card (ACCESS GRANTED) */
              <div className="rounded-3xl border-4 border-emerald-500 bg-emerald-950/90 p-8 text-center shadow-2xl backdrop-blur-md">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white text-3xl">
                  ✓
                </div>
                <h2 className="text-3xl font-black text-emerald-400 uppercase tracking-widest mb-1">
                  Ingreso Permitido
                </h2>
                <p className="text-xs text-emerald-300 font-bold uppercase tracking-wider mb-6">
                  Access Granted
                </p>

                <div className="rounded-2xl bg-black/40 p-5 text-left border border-emerald-500/20 space-y-3 mb-8">
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">Titular del Ticket:</span>
                    <span className="font-extrabold text-lg text-emerald-300 capitalize">
                      {scanResult.data?.holderName}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">Comprador:</span>
                    <span className="font-bold text-sm break-all text-white">
                      {scanResult.data?.buyerEmail}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">ID Entrada:</span>
                    <span className="font-mono text-xs break-all text-slate-300">
                      {scanResult.data?.ticketId}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">Fecha de Ingreso:</span>
                    <span className="text-sm text-emerald-300 font-bold">
                      {scanResult.data?.entryDate
                        ? new Date(scanResult.data.entryDate).toLocaleString('es-AR')
                        : new Date().toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleReset}
                  className="w-full rounded-xl bg-emerald-500 py-4 font-extrabold text-white shadow-xl hover:bg-emerald-600 transition active:scale-95 text-lg cursor-pointer"
                >
                  Escanear Siguiente Entrada ⚽
                </button>
              </div>
            ) : (
              /* Failure Card (TICKET ALREADY USED / INVALID) */
              <div className="rounded-3xl border-4 border-red-500 bg-red-950/90 p-8 text-center shadow-2xl backdrop-blur-md">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white text-3xl font-black">
                  ✕
                </div>
                <h2 className="text-3xl font-black text-red-400 uppercase tracking-widest mb-1">
                  Acceso Denegado
                </h2>
                <p className="text-xs text-red-300 font-bold uppercase tracking-wider mb-6">
                  Ticket Invalid / Used
                </p>

                <div className="rounded-2xl bg-black/40 p-5 border border-red-500/20 mb-8">
                  <p className="text-lg font-extrabold text-red-300 uppercase tracking-wide">
                    {scanResult.error === 'TICKET ALREADY USED'
                      ? 'Entrada Ya Utilizada'
                      : scanResult.error === 'TICKET NOT FOUND'
                      ? 'Entrada Inexistente'
                      : 'Error de Validación'}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    {scanResult.error === 'TICKET ALREADY USED'
                      ? 'Este código QR ya fue escaneado anteriormente en la puerta de ingreso y no es válido.'
                      : 'El código QR escaneado no corresponde a ninguna entrada válida emitida por el sistema.'}
                  </p>
                </div>

                <button
                  onClick={handleReset}
                  className="w-full rounded-xl bg-red-50 py-4 font-extrabold text-white shadow-xl hover:bg-red-600 transition active:scale-95 text-lg cursor-pointer"
                >
                  Intentar Nuevamente 🔄
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
