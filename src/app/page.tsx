'use client';

import { useState } from 'react';

const compressImage = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.6): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function CheckoutPage() {
  const [email, setEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [names, setNames] = useState<string[]>(['']);
  const [referralCode, setReferralCode] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingCompress, setLoadingCompress] = useState(false);

  const pricePerTicket = 5500;
  const totalPrice = quantity * pricePerTicket;

  const handleQuantityChange = (newQty: number) => {
    setQuantity(newQty);
    setNames((prev) => {
      const updated = [...prev];
      if (newQty > prev.length) {
        for (let i = prev.length; i < newQty; i++) {
          updated.push('');
        }
      } else {
        return updated.slice(0, newQty);
      }
      return updated;
    });
  };

  const handleNameChange = (index: number, val: string) => {
    setNames((prev) => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !receipt) {
      setError('Por favor completa todos los campos obligatorios.');
      return;
    }

    if (names.some((n) => !n.trim())) {
      setError('Por favor ingresa los nombres de todos los asistentes.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('quantity', quantity.toString());
      formData.append('referralCode', referralCode);
      formData.append('receipt', receipt);
      formData.append('attendeeNames', JSON.stringify(names.map((n) => n.trim())));

      const res = await fetch('/api/checkout', {
        method: 'POST',
        body: formData,
      });

      let data: any = null;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          // ignore parse error
        }
      }

      if (!res.ok) {
        if (res.status === 413) {
          throw new Error('El comprobante es demasiado pesado. Por favor, subí una captura de pantalla comprimida o un archivo menor a 4MB.');
        }
        throw new Error(data?.error || 'Ocurrió un error al procesar tu compra.');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error en la solicitud. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF] px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border-4 border-[#D4AF37] bg-white/95 p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            🏆
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-800">¡Pedido Recibido!</h2>
          <p className="mb-6 text-slate-600 text-sm leading-relaxed">
            Tu comprobante de transferencia fue cargado correctamente. 
            <br /><br />
            <strong>⚠️ Recordá:</strong> La verificación del pago se realiza de manera <strong>manual</strong> por nuestro equipo de Scouts, por lo que la confirmación <strong>no es instantánea</strong> y puede demorar unas horas. Te enviaremos las entradas con sus correspondientes códigos QR a <strong>{email}</strong> una vez aprobado. ¡No te desesperes, tu lugar ya está guardado!
          </p>
          <div className="rounded-xl bg-[#74ACDF]/10 p-4 border border-[#74ACDF]/30 mb-6 text-left">
            <h4 className="font-semibold text-slate-800 mb-1">Resumen del Pedido:</h4>
            <p className="text-sm text-slate-600">Cantidad: {quantity} {quantity === 1 ? 'entrada' : 'entradas'}</p>
            <div className="text-sm text-slate-600 mt-2">
              <strong>Asistentes:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs text-slate-500">
                {names.map((n, i) => (
                  <li key={i} className="capitalize">{n}</li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-slate-600 font-bold mt-3">Total Transferido: ${totalPrice.toLocaleString('es-AR')}</p>
          </div>
          <button
            onClick={() => {
              setSuccess(false);
              setEmail('');
              handleQuantityChange(1);
              setNames(['']);
              setReferralCode('');
              setReceipt(null);
            }}
            className="w-full rounded-xl bg-gradient-to-r from-[#74ACDF] to-[#5490c4] py-3 font-semibold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            Comprar más entradas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#74ACDF] via-white to-[#74ACDF]">
      {/* Header / Hero */}
      <header className="py-10 text-center text-slate-800 px-4">
        <div className="mx-auto mb-3 flex justify-center gap-2 text-4xl">
          <span>🇦🇷</span>
          <span className="animate-bounce">⚽</span>
          <span>🏆</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          KERMINGO <span className="text-[#D4AF37]">2026</span>
        </h1>
        <p className="mt-2 text-lg font-bold text-slate-700">
          20 de Junio - Estomba 1942
        </p>
      </header>

      {/* Checkout Form Card */}
      <main className="flex-1 px-4 pb-16">
        <div className="mx-auto max-w-xl rounded-3xl border-4 border-[#D4AF37] bg-white/95 p-6 shadow-2xl backdrop-blur-md sm:p-10">
          <h2 className="mb-6 text-center text-2xl font-bold text-slate-800">
            Adquirí tus Entradas
          </h2>

          {/* Friendly Guide */}
          <div className="mb-6 rounded-2xl bg-amber-50 p-5 text-sm text-slate-850 border border-amber-200 shadow-inner">
            <h3 className="mb-2.5 font-bold text-amber-900 flex items-center gap-1.5 text-base">
              <span>💡</span> ¿Cómo funciona tu compra?
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-700 text-xs font-semibold">
              <li>Completás tus datos y los nombres de las personas que van a asistir.</li>
              <li>Realizás la transferencia bancaria por el total de las entradas ($5.500 por cada una).</li>
              <li>Subís una foto o PDF del comprobante de transferencia bancaria.</li>
              <li>
                <strong>¡Muy importante!</strong> Una vez que confirmemos tu pago (verificación manual por los Scouts, la cual <strong>no es instantánea</strong> y puede demorar unas horas), te llegará un mail con <strong>un código QR por cada asistente</strong>.
              </li>
              <li>Cada persona deberá mostrar su código QR desde su celular al ingresar al evento para registrar la entrada.</li>
            </ol>
          </div>

          {/* Transfer Info */}
          <div className="mb-8 rounded-2xl border-2 border-dashed border-[#74ACDF] bg-[#74ACDF]/5 p-4 text-sm text-slate-700">
            <h3 className="mb-2 font-bold text-slate-800 flex items-center gap-2">
              <span>💳</span> Datos de Transferencia Bancaria
            </h3>
            <p className="mb-1"><strong>Banco:</strong> Banco de la Scaloneta</p>
            <p className="mb-1"><strong>Alias:</strong> kermingo.scout.2026</p>
            <p className="mb-1"><strong>CBU:</strong> 0000003100012345678901</p>
            <p className="mt-2 text-xs text-slate-500 font-semibold">
              * El valor de la entrada anticipada es de <strong>$5.500 ARS</strong>. Transferí el total correspondiente y adjuntá el comprobante abajo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                Correo Electrónico del Comprador <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20"
              />
              <p className="mt-1 text-xs text-slate-400">
                Aquí recibirás las entradas con los códigos QR una vez que verifiquemos tu pago.
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label htmlFor="quantity" className="block text-sm font-semibold text-slate-700">
                Cantidad de Entradas
              </label>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(Math.max(1, quantity - 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-600 transition hover:bg-slate-200 cursor-pointer"
                >
                  -
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-600 transition hover:bg-slate-200 cursor-pointer"
                >
                  +
                </button>
                <div className="ml-auto text-right">
                  <span className="text-xs text-slate-400 block">Total a pagar</span>
                  <span className="text-xl font-extrabold text-[#D4AF37]">
                    ${totalPrice.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Attendee Names */}
            <div className="space-y-4 rounded-2xl bg-slate-50 p-4 border border-slate-200">
              <label className="block text-sm font-bold text-slate-700">
                Nombres de los Asistentes <span className="text-red-500">*</span>
              </label>
              {names.map((name, idx) => (
                <div key={idx} className="space-y-1">
                  <span className="text-xs text-slate-500 font-semibold">Nombre Asistente #{idx + 1}</span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20 capitalize"
                  />
                </div>
              ))}
            </div>

            {/* Referral Scout Name */}
            <div>
              <label htmlFor="referral" className="block text-sm font-semibold text-slate-700">
                Nombre del Scout que te invitó <span className="text-slate-400 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                id="referral"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Ej: MARTINEZ EMILIANO"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none transition focus:border-[#74ACDF] focus:ring-2 focus:ring-[#74ACDF]/20 placeholder:uppercase"
              />
              <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ <span className="font-semibold">Aviso:</span> El sistema de referidos está habilitado exclusivamente para los Scouts pertenecientes a la <strong>Unidad Scout Mártires Palotinos</strong>. Ingresá el nombre completo del Scout que te invitó.
              </p>
            </div>

            {/* Receipt Upload */}
            <div>
              <label htmlFor="receipt" className="block text-sm font-semibold text-slate-700">
                Comprobante de Transferencia <span className="text-red-500">*</span>
              </label>
              <div className="mt-2 flex justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-6 transition hover:border-[#74ACDF] bg-slate-50/50">
                <div className="text-center">
                  <span className="mx-auto block text-3xl mb-2">📸</span>
                  <div className="flex text-sm text-slate-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-semibold text-[#74ACDF] focus-within:outline-none hover:text-[#5490c4]"
                    >
                      <span>Subir un archivo</span>
                      <input
                        id="file-upload"
                        name="receipt"
                        type="file"
                        accept="image/*,application/pdf"
                        required
                        className="sr-only"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const file = e.target.files[0];
                            if (file.type === 'application/pdf') {
                              if (file.size > 4 * 1024 * 1024) {
                                setError('El comprobante en PDF es demasiado pesado (máximo 4MB). Por favor, subí un archivo más chico.');
                                setReceipt(null);
                                e.target.value = '';
                              } else {
                                setError(null);
                                setReceipt(file);
                              }
                            } else if (file.type.startsWith('image/')) {
                              if (file.size > 15 * 1024 * 1024) {
                                setError('La imagen es demasiado pesada (máximo 15MB). Por favor, subí una captura de pantalla más chica.');
                                setReceipt(null);
                                e.target.value = '';
                                return;
                              }
                              setError(null);
                              setLoadingCompress(true);
                              try {
                                const compressed = await compressImage(file);
                                setReceipt(compressed);
                              } catch (err) {
                                console.error('Image compression failed, using original file', err);
                                setReceipt(file);
                              } finally {
                                setLoadingCompress(false);
                              }
                            } else {
                              setError('Formato no soportado. Por favor, subí una imagen (PNG, JPG) o un PDF.');
                              setReceipt(null);
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                    </label>
                    <p className="pl-1 text-slate-500">o arrastrar y soltar</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Formatos: PNG, JPG (hasta 15MB, se comprimen automáticamente) o PDF (hasta 4MB).
                  </p>
                  {loadingCompress && (
                    <div className="mt-3 text-xs font-bold text-[#74ACDF] animate-pulse">
                      ⚡ Optimizando y comprimiendo imagen...
                    </div>
                  )}
                  {receipt && (
                    <div className="mt-3 rounded-lg bg-green-50 p-2 border border-green-200">
                      <p className="text-xs font-bold text-green-700 flex items-center justify-center gap-1">
                        ✓ {receipt.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 border border-red-200 text-sm font-bold text-red-600 text-center">
                ⚠ {error}
              </div>
            )}

            {/* Delay Warning Callout */}
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center leading-relaxed font-semibold">
              📢 <strong>Nota importante:</strong> La acreditación del pago es verificada de forma manual por los Scouts. El envío de las entradas <strong>no es inmediato</strong> y puede demorar unas horas. ¡Quedate tranquilo que tu pedido queda registrado ni bien lo envías!
            </p>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-[#74ACDF] via-[#5490c4] to-[#74ACDF] py-4 font-bold text-white shadow-xl hover:from-[#5490c4] hover:to-[#437fb2] transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Procesando...
                </>
              ) : (
                'Confirmar y Enviar Comprobante 🇦🇷'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
