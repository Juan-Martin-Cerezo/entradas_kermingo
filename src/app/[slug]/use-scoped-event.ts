'use client';

import { use, useEffect, useState } from 'react';

export interface ScopedEvent {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export function useScopedEvent(slug: string) {
  const [event, setEvent] = useState<ScopedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/event?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (res.status === 404) throw new Error('Evento no encontrado.');
        if (!res.ok) throw new Error('No se pudo cargar el evento.');
        return res.json();
      })
      .then((data: ScopedEvent) => setEvent(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return { event, error, loading };
}

export function useUnwrapSlug(params: Promise<{ slug: string }>): string {
  const { slug } = use(params);
  return slug;
}
