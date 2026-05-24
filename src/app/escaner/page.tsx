'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Dynamically import QrScanner component with SSR disabled
const QrScanner = dynamic(() => import('@/components/QrScanner'), { ssr: false });

interface ScanResult {
  success: boolean;
  data?: {
    buyerEmail: string;
    ticketId: string;
    entryDate: string;
  };
  error?: string;
}

export default function EscanerPage() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const handleScanResult = (result: { success: boolean; data?: any; error?: string }) => {
    setScanResult(result);
  };

  const handleReset = () => {
    setScanResult(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      {/* Admin Navbar */}
      <nav className="border-b-4 border-[#D4AF37] bg-[#74ACDF] px-6 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link href="/admin" className="text-lg font-black tracking-wider flex items-center gap-1">
            <span>🏆</span> KERMINGO 2026
          </Link>
          <div className="flex gap-4">
            <Link href="/admin" className="text-sm font-bold bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition">
              Panel
            </Link>
            <Link href="/" className="text-sm font-bold bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition">
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
            <p className="text-sm text-slate-400 mb-8">Control de Acceso / Validación de Entradas</p>
            <QrScanner onScanResult={handleScanResult} />
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
                  className="w-full rounded-xl bg-emerald-500 py-4 font-extrabold text-white shadow-xl hover:bg-emerald-600 transition active:scale-95 text-lg"
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
                  className="w-full rounded-xl bg-red-500 py-4 font-extrabold text-white shadow-xl hover:bg-red-600 transition active:scale-95 text-lg"
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
