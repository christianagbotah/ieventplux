import { NextRequest, NextResponse } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { membershipFor, orgCan } from '@/server/permissions'
import { merchandiseReconciliation, merchandiseReportCsv } from '@/server/services/merchandise-reconciliation'

type Context = { params: Promise<{ id: string }> }

/** Scoped, authenticated organizer reporting. CSV has the same permission
 * checks as the JSON view; numbers are never fabricated for non-paid orders. */
export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const user = await requireUser()
    const { id } = await ctx.params
    const member = await membershipFor(user.id, id)
    if (!member || !orgCan(member.role, 'orders:view')) throw errors.forbidden('Organizer order reporting permission required.')
    const eventId = req.nextUrl.searchParams.get('eventId')
    const finance = orgCan(member.role, 'org:view_finance')
    const result = await merchandiseReconciliation(id, eventId, finance)
    if (req.nextUrl.searchParams.get('format') === 'csv') {
      if (!eventId) throw errors.badRequest('Choose an event before exporting a report.')
      return new NextResponse(merchandiseReportCsv(result), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ieventplux-merchandise-reconciliation.csv"',
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
      })
    }
    return jsonOk(result, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
