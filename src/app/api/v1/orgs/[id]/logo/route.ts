import { NextRequest, NextResponse } from 'next/server'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { membershipFor, orgCan } from '@/server/permissions'
import { db } from '@/lib/db'
type Context = { params: Promise<{ id: string }> }
function logoDir() {
  const dir = process.env.ORG_LOGO_PRIVATE_DIR || (process.env.NODE_ENV === 'production' ? '' : path.join(process.cwd(), '.private', 'org-logos'))
  if (!dir || !path.isAbsolute(dir) || dir.startsWith(path.join(process.cwd(), 'public'))) throw errors.unavailable('LOGO_STORAGE_UNAVAILABLE', 'Logo storage not configured.')
  return dir
}
function filePath(orgId: string) {
  if (!/^[a-z0-9_-]{8,80}$/i.test(orgId)) throw errors.badRequest('Invalid organization.')
  return path.join(logoDir(), orgId + '.webp')
}
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'org-logo', 10, 60_000)
    const { id } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership || !orgCan(membership.role, 'org:manage')) throw errors.forbidden('Organization administrator required.')
    const form = await req.formData().catch(() => null)
    const input = form?.get('file')
    if (!(input instanceof File)) throw errors.badRequest('Select a logo image.')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(input.type) || input.size > 3 * 1024 * 1024 || input.size === 0) {
      throw errors.badRequest('Logo must be PNG, JPEG or WebP, maximum 3 MB.')
    }
    let image: Buffer
    try {
      const raw = Buffer.from(await input.arrayBuffer())
      const meta = await sharp(raw, { limitInputPixels: 15_000_000 }).metadata()
      if (!meta.width || !meta.height) throw new Error('Invalid image')
      image = await sharp(raw).rotate().resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).webp({ quality: 86 }).toBuffer()
    } catch { throw errors.badRequest('Logo image is unreadable.') }
    const filepath = filePath(id)
    await mkdir(logoDir(), { recursive: true, mode: 0o700 })
    const tmp = filepath + '.' + randomUUID() + '.tmp'
    await writeFile(tmp, image, { flag: 'wx', mode: 0o600 })
    await rename(tmp, filepath)
    const logoUrl = '/api/v1/orgs/' + id + '/logo'
    await db.organization.update({ where: { id }, data: { logoUrl } })
    return jsonOk({ logoUrl }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const org = await db.organization.findUnique({ where: { id }, select: { logoUrl: true, deletedAt: true } })
    if (!org || org.deletedAt || org.logoUrl !== '/api/v1/orgs/' + id + '/logo') throw errors.notFound('Logo not found.')
    const data = await readFile(filePath(id)).catch(() => null)
    if (!data) throw errors.notFound('Logo not found.')
    return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
  })
}
