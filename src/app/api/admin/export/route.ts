import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function csvResponse(filename: string, header: string[], rows: unknown[][]): Response {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  const body = '﻿' + lines.join('\r\n');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const tipo = searchParams.get('tipo');

    if (!eventId) {
      return Response.json({ error: 'eventId requerido' }, { status: 400 });
    }
    if (tipo !== 'ventas' && tipo !== 'asistentes') {
      return Response.json({ error: 'tipo debe ser ventas o asistentes' }, { status: 400 });
    }

    const isAuthorized = await checkAuth(eventId);
    if (!isAuthorized) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (tipo === 'ventas') {
      const purchases = await db.purchase.findMany({
        where: { event_id: eventId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          buyer_email: true,
          quantity: true,
          payment_status: true,
          attendee_names: true,
          createdAt: true,
          promoter: { select: { name: true, referral_code: true } },
        },
      });

      return csvResponse(
        `ventas-${eventId}.csv`,
        ['id', 'email', 'cantidad', 'estado', 'asistentes', 'promoter', 'codigo_referido', 'fecha'],
        purchases.map((p) => [
          p.id,
          p.buyer_email,
          p.quantity,
          p.payment_status,
          p.attendee_names,
          p.promoter?.name ?? '',
          p.promoter?.referral_code ?? '',
          p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
        ])
      );
    }

    const tickets = await db.ticket.findMany({
      where: { event_id: eventId, purchase: { payment_status: 'APPROVED' } },
      orderBy: { holder_name: 'asc' },
      select: {
        id: true,
        holder_name: true,
        entry_status: true,
        purchase: {
          select: {
            buyer_email: true,
            promoter: { select: { name: true } },
          },
        },
      },
    });

    return csvResponse(
      `asistentes-${eventId}.csv`,
      ['id', 'titular', 'ingreso', 'email_comprador', 'promoter'],
      tickets.map((t) => [
        t.id,
        t.holder_name,
        t.entry_status ? 'SI' : 'NO',
        t.purchase.buyer_email,
        t.purchase.promoter?.name ?? '',
      ])
    );
  } catch (error: unknown) {
    console.error('Export CSV error:', error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
