'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface EventConfig {
  event_id: string;
  ticket_price_cents: number;
  referral_commission_cents: number;
  currency: string;
  pay_alias: string | null;
  contact_email: string | null;
  max_tickets: number | null;
  logo_url: string | null;
}

interface EventOwner {
  id: string;
  email: string;
  invite_token: string | null;
}

interface EventItem {
  id: string;
  slug: string;
  name: string;
  status: 'DRAFT' | 'ON_SALE' | 'CLOSED';
  createdAt: string;
  config: EventConfig | null;
  owner: EventOwner | null;
  approvedTickets: number;
  pendingTickets: number;
  approvedPurchases: number;
  pendingPurchases: number;
  revenueCents: number;
  usedTickets: number;
  validTickets: number;
  maxTickets: number | null;
  capacityOccupiedPercent: number | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function formatCurrency(cents: number, currency = 'ARS'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function SuperadminPanelPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ON_SALE' | 'DRAFT' | 'CLOSED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccessInvite, setCreateSuccessInvite] = useState<{ url: string; email: string } | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ticketPricePesos, setTicketPricePesos] = useState('5000');
  const [referralCommissionPesos, setReferralCommissionPesos] = useState('1000');
  const [currency, setCurrency] = useState('ARS');
  const [payAlias, setPayAlias] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [maxTickets, setMaxTickets] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Edit Modal State
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Re-invite feedback
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const fetchEvents = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch('/api/admin/platform-stats')
      .then((res) => {
        if (res.status === 401) {
          router.push('/panel/login');
          return null;
        }
        if (!res.ok) throw new Error('Error al cargar métricas y eventos');
        return res.json();
      })
      .then((data) => {
        if (!ignore && data) {
          setEvents(data.events || []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Error inesperado');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [router, refreshKey]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) {
      setSlug(slugify(val));
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccessInvite(null);

    try {
      const priceCents = Math.round(parseFloat(ticketPricePesos || '0') * 100);
      const commCents = Math.round(parseFloat(referralCommissionPesos || '0') * 100);

      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
          ticketPriceCents: priceCents,
          referralCommissionCents: commCents,
          currency,
          payAlias: payAlias.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          maxTickets: maxTickets ? parseInt(maxTickets, 10) : undefined,
          logoUrl: logoUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear evento');
      }

      setCreateSuccessInvite({
        url: data.inviteUrl,
        email: ownerEmail.trim().toLowerCase(),
      });

      // Refresh list
      await fetchEvents();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear evento');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleQuickStatusChange = async (event: EventItem, newStatus: 'DRAFT' | 'ON_SALE' | 'CLOSED') => {
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          status: newStatus,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al cambiar estado');
      }

      await fetchEvents();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al actualizar');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    setEditLoading(true);
    setEditError(null);
    setEditSuccessMsg(null);

    try {
      const priceCents = editingEvent.config?.ticket_price_cents ?? 500000;
      const commCents = editingEvent.config?.referral_commission_cents ?? 100000;

      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEvent.id,
          name: editingEvent.name,
          slug: editingEvent.slug,
          status: editingEvent.status,
          ticketPriceCents: priceCents,
          referralCommissionCents: commCents,
          currency: editingEvent.config?.currency || 'ARS',
          payAlias: editingEvent.config?.pay_alias,
          contactEmail: editingEvent.config?.contact_email,
          maxTickets: editingEvent.config?.max_tickets,
          logoUrl: editingEvent.config?.logo_url,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar cambios');
      }

      setEditSuccessMsg('Configuración actualizada con éxito');
      await fetchEvents();
      setTimeout(() => {
        setEditingEvent(null);
        setEditSuccessMsg(null);
      }, 1200);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setEditLoading(false);
    }
  };

  const handleReinvite = async (event: EventItem) => {
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          reinvite: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al reenviar invitación');
      }

      if (data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl);
        setCopiedUrl(event.id);
        setTimeout(() => setCopiedUrl(null), 3500);
      }
      await fetchEvents();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al reenviar');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.push('/panel/login');
      router.refresh();
    }
  };

  // Aggregated totals
  const totalApprovedTickets = events.reduce((acc, e) => acc + e.approvedTickets, 0);
  const totalRevenue = events.reduce((acc, e) => acc + e.revenueCents, 0);
  const totalUsedTickets = events.reduce((acc, e) => acc + e.usedTickets, 0);
  const activeEventsCount = events.filter((e) => e.status === 'ON_SALE').length;

  const filteredEvents = events.filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎟️</span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white sm:text-xl">
                EventHub <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest ml-1 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/30">Superadmin</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setName('');
                setSlug('');
                setOwnerEmail('');
                setTicketPricePesos('5000');
                setReferralCommissionPesos('1000');
                setPayAlias('');
                setMaxTickets('');
                setCreateError(null);
                setCreateSuccessInvite(null);
                setShowCreateModal(true);
              }}
              className="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span>+</span>
              <span className="hidden sm:inline">Nuevo Evento</span>
              <span className="sm:hidden">Crear</span>
            </button>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 space-y-6">
        {/* Global Summary Cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Total Vendidos</p>
            <p className="mt-1 text-2xl font-black text-white">{totalApprovedTickets}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Tickets aprobados</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Recaudación Total</p>
            <p className="mt-1 text-2xl font-black text-emerald-400">{formatCurrency(totalRevenue)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Ventas efectivas</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Tickets Usados</p>
            <p className="mt-1 text-2xl font-black text-indigo-400">{totalUsedTickets}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Ingresos escaneados</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Eventos Activos</p>
            <p className="mt-1 text-2xl font-black text-amber-400">
              {activeEventsCount} <span className="text-xs font-normal text-slate-500">/ {events.length}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">A la venta ahora</p>
          </div>
        </section>

        {/* Filters & Search */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex overflow-x-auto pb-1 gap-1.5 scrollbar-none">
            {(['ALL', 'ON_SALE', 'DRAFT', 'CLOSED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white'
                }`}
              >
                {st === 'ALL' && 'Todos'}
                {st === 'ON_SALE' && '🟢 A la venta'}
                {st === 'DRAFT' && '🟡 Borradores'}
                {st === 'CLOSED' && '🔴 Cerrados'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar evento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </section>

        {/* Notification / Copy Feedback */}
        {copiedUrl && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-400 text-center animate-pulse">
            ✅ Enlace de activación copiado al portapapeles. ¡Envíaselo al organizador!
          </div>
        )}

        {/* Events Grid */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 font-medium text-sm">
            Cargando eventos y métricas...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">
            {error}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
            <p className="text-slate-400 font-medium">No se encontraron eventos</p>
            <p className="text-xs text-slate-600 mt-1">Creá tu primer evento para comenzar a vender entradas.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((evt) => {
              const priceCents = evt.config?.ticket_price_cents ?? 500000;
              const hasCapacity = evt.maxTickets && evt.maxTickets > 0;
              const capPercent = evt.capacityOccupiedPercent ?? 0;

              return (
                <div
                  key={evt.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg transition-all hover:border-slate-700"
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-black text-white leading-tight">{evt.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono text-slate-500">/{evt.slug}</span>
                          <span className="text-[11px] font-semibold text-slate-400">· {formatCurrency(priceCents, evt.config?.currency || 'ARS')}</span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                          evt.status === 'ON_SALE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : evt.status === 'DRAFT'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {evt.status === 'ON_SALE' ? 'A la venta' : evt.status === 'DRAFT' ? 'Borrador' : 'Cerrado'}
                      </span>
                    </div>

                    {/* Metrics Breakdown */}
                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-950/60 p-3 border border-slate-800/80">
                      <div>
                        <p className="text-[10px] font-medium text-slate-400">Tickets Vendidos</p>
                        <p className="text-base font-black text-white">{evt.approvedTickets}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-400">Recaudado</p>
                        <p className="text-base font-black text-emerald-400">
                          {formatCurrency(evt.revenueCents, evt.config?.currency || 'ARS')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-400">Usados / Válidos</p>
                        <p className="text-xs font-bold text-slate-200">
                          {evt.usedTickets} <span className="text-slate-500">/ {evt.validTickets} válidos</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-400">Capacidad</p>
                        <p className="text-xs font-bold text-slate-200">
                          {hasCapacity ? `${capPercent}% (${evt.maxTickets} máx)` : 'Sin límite'}
                        </p>
                      </div>
                    </div>

                    {/* Capacity Progress Bar */}
                    {hasCapacity && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            capPercent >= 90 ? 'bg-red-500' : capPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(capPercent, 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Event Owner Info */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate">
                        👤 {evt.owner?.email || 'Sin organizador'}
                      </span>
                      {evt.owner?.invite_token && (
                        <button
                          onClick={() => handleReinvite(evt)}
                          className="font-bold text-indigo-400 hover:text-indigo-300 ml-2"
                        >
                          Reenviar link
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-5 space-y-2 border-t border-slate-800/80 pt-4">
                    {/* Status Toggle Buttons */}
                    <div className="flex gap-1.5">
                      {evt.status !== 'ON_SALE' && (
                        <button
                          onClick={() => handleQuickStatusChange(evt, 'ON_SALE')}
                          className="flex-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-600/30 active:scale-95"
                        >
                          Abrir Ventas
                        </button>
                      )}
                      {evt.status === 'ON_SALE' && (
                        <button
                          onClick={() => handleQuickStatusChange(evt, 'CLOSED')}
                          className="flex-1 rounded-lg bg-red-600/20 border border-red-500/30 px-2 py-1.5 text-xs font-bold text-red-400 hover:bg-red-600/30 active:scale-95"
                        >
                          Cerrar Ventas
                        </button>
                      )}
                      {evt.status !== 'DRAFT' && (
                        <button
                          onClick={() => handleQuickStatusChange(evt, 'DRAFT')}
                          className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 active:scale-95"
                        >
                          Pausar
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingEvent(JSON.parse(JSON.stringify(evt)));
                          setEditError(null);
                          setEditSuccessMsg(null);
                        }}
                        className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 active:scale-95"
                      >
                        ✏️
                      </button>
                    </div>

                    {/* Direct Links */}
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <Link
                        href={`/${evt.slug}`}
                        target="_blank"
                        className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                      >
                        🌐 Venta
                      </Link>
                      <Link
                        href={`/${evt.slug}/admin`}
                        target="_blank"
                        className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                      >
                        ⚙️ Owner
                      </Link>
                      <Link
                        href={`/${evt.slug}/escaner`}
                        target="_blank"
                        className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                      >
                        📷 Escáner
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black text-white">Crear Nuevo Evento</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {createSuccessInvite ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                  <span className="text-3xl">🎉</span>
                  <h4 className="mt-2 text-base font-bold text-emerald-400">
                    ¡Evento creado exitosamente!
                  </h4>
                  <p className="mt-1 text-xs text-slate-300">
                    Se envió la invitación por email a <strong>{createSuccessInvite.email}</strong>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400">
                    Enlace de activación para el organizador:
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createSuccessInvite.url}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createSuccessInvite.url);
                        alert('¡Enlace copiado al portapapeles!');
                      }}
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                    >
                      Copiar
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateEvent} className="mt-4 space-y-4">
                {createError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-400">
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Nombre del Evento *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Fiesta Fin de Año 2026"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-slate-300">
                      Slug de la URL *
                    </label>
                    <button
                      type="button"
                      onClick={() => setAutoSlug(!autoSlug)}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      {autoSlug ? 'Personalizar slug' : 'Autogenerar'}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
                    <span className="text-xs text-slate-500 font-mono">/</span>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => {
                        setAutoSlug(false);
                        setSlug(slugify(e.target.value));
                      }}
                      placeholder="fiesta-fin-de-ano-2026"
                      className="w-full bg-transparent pl-1 text-sm font-mono text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Email del Organizador * (recibirá la invitación)
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="organizador@evento.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      Precio Entrada ($) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="100"
                      value={ticketPricePesos}
                      onChange={(e) => setTicketPricePesos(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      Comisión Promotor ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={referralCommissionPesos}
                      onChange={(e) => setReferralCommissionPesos(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      Alias o CBU de Pago
                    </label>
                    <input
                      type="text"
                      placeholder="evento.fiesta.mp"
                      value={payAlias}
                      onChange={(e) => setPayAlias(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      Capacidad Máxima
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Ej. 500 (opcional)"
                      value={maxTickets}
                      onChange={(e) => setMaxTickets(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      Moneda
                    </label>
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      Email de Contacto
                    </label>
                    <input
                      type="email"
                      placeholder="contacto@evento.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Logo / Flyer URL (opcional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://ejemplo.com/flyer.jpg"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {createLoading ? 'Creando evento...' : 'Guardar y Crear'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* EDIT EVENT MODAL */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black text-white">Editar Evento</h3>
              <button
                onClick={() => setEditingEvent(null)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              {editError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-400">
                  {editError}
                </div>
              )}
              {editSuccessMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-400">
                  {editSuccessMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300">Nombre</label>
                <input
                  type="text"
                  required
                  value={editingEvent.name}
                  onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Estado de Venta</label>
                  <select
                    value={editingEvent.status}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        status: e.target.value as 'DRAFT' | 'ON_SALE' | 'CLOSED',
                      })
                    }
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="DRAFT">🟡 Borrador (DRAFT)</option>
                    <option value="ON_SALE">🟢 A la venta (ON_SALE)</option>
                    <option value="CLOSED">🔴 Cerrado (CLOSED)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Moneda</label>
                  <input
                    type="text"
                    value={editingEvent.config?.currency || 'ARS'}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        config: {
                          ...(editingEvent.config as EventConfig),
                          currency: e.target.value.toUpperCase(),
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Precio Entrada ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={Math.round((editingEvent.config?.ticket_price_cents ?? 500000) / 100)}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        config: {
                          ...(editingEvent.config as EventConfig),
                          ticket_price_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Comisión Promotor ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={Math.round((editingEvent.config?.referral_commission_cents ?? 100000) / 100)}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        config: {
                          ...(editingEvent.config as EventConfig),
                          referral_commission_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Alias o CBU</label>
                  <input
                    type="text"
                    value={editingEvent.config?.pay_alias || ''}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        config: {
                          ...(editingEvent.config as EventConfig),
                          pay_alias: e.target.value,
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Capacidad Máxima</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Sin límite"
                    value={editingEvent.config?.max_tickets ?? ''}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        config: {
                          ...(editingEvent.config as EventConfig),
                          max_tickets: e.target.value ? parseInt(e.target.value, 10) : null,
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
                >
                  {editLoading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
