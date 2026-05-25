'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScanResult: (result: { success: boolean; data?: any; error?: string }) => void;
  forceOffline?: boolean;
  onOfflineScan?: (ticketId: string) => { success: boolean; data?: any; error?: string };
}

export default function QrScanner({ onScanResult, forceOffline = false, onOfflineScan }: QrScannerProps) {
  const scannerId = 'kermingo-qr-reader-element';
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [scanning, setScanning] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Keep latest props in refs to avoid capturing stale values in the scanner callback closure
  const forceOfflineRef = useRef(forceOffline);
  const onOfflineScanRef = useRef(onOfflineScan);
  const onScanResultRef = useRef(onScanResult);

  useEffect(() => {
    forceOfflineRef.current = forceOffline;
  }, [forceOffline]);

  useEffect(() => {
    onOfflineScanRef.current = onOfflineScan;
  }, [onOfflineScan]);

  useEffect(() => {
    onScanResultRef.current = onScanResult;
  }, [onScanResult]);

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

  const validateTicket = async (ticketId: string) => {
    if (forceOfflineRef.current && onOfflineScanRef.current) {
      const result = onOfflineScanRef.current(ticketId);
      onScanResultRef.current(result);
      return;
    }

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
        onScanResultRef.current({ success: true, data });
      } else {
        onScanResultRef.current({ success: false, error: data?.error || 'INVALID TICKET' });
      }
    } catch (err: any) {
      console.error('Network validation error, fallback to offline scan if available:', err);
      if (onOfflineScanRef.current) {
        const result = onOfflineScanRef.current(ticketId);
        onScanResultRef.current(result);
      } else {
        onScanResultRef.current({ success: false, error: 'Error de red y modo offline no disponible.' });
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-2">
      {cameraPermission === 'prompt' && (
        <div className="text-center p-4">
          <p className="text-sm text-slate-300 mb-4">
            Se requiere permiso de cámara para escanear los códigos QR de las entradas.
          </p>
          <button
            onClick={startScanning}
            className="bg-[#74ACDF] hover:bg-[#5490c4] text-white font-bold px-6 py-2.5 rounded-xl transition cursor-pointer"
          >
            Activar Cámara 📷
          </button>
        </div>
      )}

      {cameraPermission === 'denied' && (
        <div className="text-center p-4 border border-red-500/20 bg-red-950/20 rounded-2xl">
          <span className="text-3xl block mb-2">🚫</span>
          <p className="text-sm text-red-400 font-semibold">
            Permiso de cámara denegado. Por favor, permití el acceso a la cámara en los ajustes de tu navegador y recargá la página.
          </p>
        </div>
      )}

      <div
        id={scannerId}
        className="w-full max-w-sm overflow-hidden rounded-2xl border-4 border-[#74ACDF] bg-black shadow-lg"
        style={{ display: cameraPermission === 'granted' ? 'block' : 'none' }}
      />

      {scanning && (
        <p className="mt-4 text-xs font-bold text-slate-400 animate-pulse flex items-center gap-1.5 justify-center">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
          Apunta al código QR de la entrada...
        </p>
      )}

      {errorState && (
        <p className="mt-2 text-xs font-bold text-red-500 text-center">
          ⚠ {errorState}
        </p>
      )}
    </div>
  );
}
