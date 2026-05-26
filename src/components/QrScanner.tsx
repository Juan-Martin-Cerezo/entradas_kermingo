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

    // Check if permission is already granted, if so start immediately
    navigator.permissions?.query({ name: 'camera' as any }).then((permissionStatus) => {
      if (permissionStatus.state === 'granted') {
        startScanning();
      } else if (permissionStatus.state === 'denied') {
        setCameraPermission('denied');
      }
    }).catch(() => {
      // Fallback: try to start, if user hasn't granted yet it will fail and show prompt
      startScanning(true); // silentFail = true
    });

    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch((err) => console.error('Failed to stop camera scanner:', err));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScanning = async (silentFail = false) => {
    if (!qrScannerRef.current) return;

    try {
      setScanning(true);
      setErrorState(null);
      
      // Stop scanner if already running
      if (qrScannerRef.current.isScanning) {
        try {
          await qrScannerRef.current.stop();
        } catch (e) {
          // ignore
        }
      }

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
      
      const errStr = err?.toString() || '';
      if (errStr.includes('NotAllowedError') || errStr.includes('Permission denied')) {
        setCameraPermission('denied');
      } else {
        if (!silentFail) {
          setErrorState('No se pudo iniciar la cámara. Verificá que no esté siendo usada por otra pestaña.');
        }
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
    <div className="flex flex-col items-center justify-center p-2 w-full">
      <div className="relative w-full max-w-sm aspect-square overflow-hidden rounded-2xl border-4 border-[#74ACDF] bg-black shadow-lg flex flex-col items-center justify-center p-4">
        
        {/* The scanner element (must always be rendered and have layout size for html5-qrcode initialization) */}
        <div
          id={scannerId}
          className="absolute inset-0 w-full h-full"
          style={{ 
            opacity: cameraPermission === 'granted' ? 1 : 0,
            pointerEvents: cameraPermission === 'granted' ? 'auto' : 'none'
          }}
        />

        {/* Overlay for prompting permission */}
        {cameraPermission === 'prompt' && (
          <div className="z-10 text-center px-4 py-6">
            <span className="text-4xl block mb-3">📷</span>
            <p className="text-sm text-slate-300 mb-4">
              Se requiere permiso de cámara para escanear los códigos QR de las entradas.
            </p>
            <button
              onClick={() => startScanning()}
              className="bg-[#74ACDF] hover:bg-[#5490c4] text-white font-bold px-6 py-2.5 rounded-xl transition cursor-pointer text-sm shadow-md"
            >
              Activar Cámara 📷
            </button>
          </div>
        )}

        {/* Overlay for denied permission */}
        {cameraPermission === 'denied' && (
          <div className="z-10 text-center px-4 py-6">
            <span className="text-4xl block mb-3">🚫</span>
            <p className="text-sm text-red-400 font-bold mb-2">
              Acceso a la cámara denegado
            </p>
            <p className="text-xs text-slate-400">
              Por favor, permití el acceso a la cámara en los ajustes de tu navegador y recargá la página.
            </p>
          </div>
        )}
      </div>

      {scanning && cameraPermission === 'granted' && (
        <p className="mt-4 text-xs font-bold text-slate-400 animate-pulse flex items-center gap-1.5 justify-center">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
          Apunta al código QR de la entrada...
        </p>
      )}

      {errorState && (
        <p className="mt-4 text-xs font-bold text-red-500 text-center max-w-xs">
          ⚠ {errorState}
        </p>
      )}
    </div>
  );
}
