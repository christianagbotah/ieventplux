import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { envValidation, integrationStatuses } from '@/server/env'
import { handle, jsonOk } from '@/server/api'

export async function GET(req: NextRequest) {
  return handle(async () => {
    void req
    let database = 'up'
    try {
      await db.$queryRaw`SELECT 1`
    } catch {
      database = 'down'
    }
    const validation = envValidation()
    const integrations = await integrationStatuses()
    return jsonOk({
      status: database === 'up' && validation.errors.length === 0 ? 'healthy' : 'degraded',
      service: 'ieventplux-api',
      version: 'v1',
      database,
      validation,
      integrations,
      timestamp: new Date().toISOString(),
    })
  })
}
