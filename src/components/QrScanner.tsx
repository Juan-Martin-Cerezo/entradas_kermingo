'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScanResult: (result: { success: boolean; data?: any; error?: string }) => void;
}

export default function QrScanner({ onScanResult }: QrScannerProps) {
  const scannerId = 'kermingo-qr-reader-element';
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    // Initialise scanner object
    const scanner = new Html5Qrcode(scannerId);
    qrScannerRef.current = scanner;

    startScanning();

    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch((err) => console.error('Failed to stop camera scanner:', err));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScanning = async () => {
    if (!qrScannerRef.current) return;

    try {
      setScanning(true);
      setErrorState(null);
      await qrScannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          },
        },
        async (decodedText) => {
          // Found QR code. Stop scanner immediately and validate.
          if (qrScannerRef.current && qrScannerRef.current.isScanning) {
            await qrScannerRef.current.stop();
            setScanning(false);
            validateTicket(decodedText);
          }
        },
        (errorMessage) => {
          // Silent scan tracking
        }
      );
      setCameraPermission('granted');
    } catch (err: any) {
      console.error('Camera start error:', err);
      setScanning(false);
      if (err?.toString().includes('NotAllowedError')) {
        setCameraPermission('denied');
      }
    }
  };

  const [errorState, setErrorState] = useState<string | null>(null);

  const validateTicket = async (ticketId: string) => {
    try {
      const res = await fetch('/api/tickets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
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

      if (res.ok) {
        onScanResult({ success: true, data });
      } else {
        onScanResult({ success: false, error: data?.error || 'INVALID TICKET' });
      }
    } catch (err: any) {
      onScanResult({ success: false, error: 'CONNECTION ERROR' });
    }
  };

  const handleRetry = () => {
    startScanning();
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {cameraPermission === 'denied' && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 border border-red-200 text-center">
          <p className="font-bold text-red-600">Acceso a Cámara Denegado</p>
          <p className="text-sm text-slate-500 mt-1">Por favor permite acceso a la cámara en tu navegador para escanear.</p>
        </div>
      )}

      {/* Scanner container */}
      <div className="relative w-full aspect-square bg-black rounded-3xl overflow-hidden border-4 border-[#74ACDF] shadow-2xl">
        <div id={scannerId} className="w-full h-full" />
        
        {/* Argentina Themed Overlay border and target frame */}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
            <div className="flex justify-between">
              <div className="w-8 h-8 border-t-4 border-l-4 border-[#D4AF37] rounded-tl-lg" />
              <div className="w-8 h-8 border-t-4 border-r-4 border-[#D4AF37] rounded-tr-lg" />
            </div>
            {/* Center animated horizontal scanline */}
            <div className="w-full h-0.5 bg-[#74ACDF]/80 shadow-[0_0_12px_#74ACDF] animate-pulse" />
            <div className="flex justify-between">
              <div className="w-8 h-8 border-b-4 border-l-4 border-[#D4AF37] rounded-bl-lg" />
              <div className="w-8 h-8 border-b-4 border-r-4 border-[#D4AF37] rounded-br-lg" />
            </div>
          </div>
        )}

        {!scanning && cameraPermission === 'granted' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-6 text-center">
            <span className="animate-spin h-10 w-10 border-4 border-white border-t-transparent rounded-full mb-3" />
            <p className="font-bold text-sm">Validando entrada...</p>
          </div>
        )}
      </div>

      {!scanning && cameraPermission !== 'denied' && (
        <button
          onClick={handleRetry}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#74ACDF] to-[#5490c4] py-3 font-semibold text-white shadow-lg transition active:scale-95"
        >
          Iniciar Escaneo / Reactivar Cámara
        </button>
      )}
    </div>
  );
}
