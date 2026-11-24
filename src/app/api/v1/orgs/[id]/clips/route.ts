import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'
import { MAX_PRIVATE_CLIP_BYTES, MAX_PENDING_CLIPS_PER_ORG, privateVideoIntakeEnabled } from '@/server/private-video-intake'

/** Staff-scoped submission list. Never returns the quarantined filename or
 * raw storage path and never accepts public publish/moderation mutations. */
export async function GET(_req: NextRequest, ctx:{params:Promise<{id:string}>}){
  return handle(async()=>{
    const {id}=await ctx.params
    const user=await requireUser()
    const membership=await membershipFor(user.id,id)
    if (!membership || !orgCan(membership.role,'media:manage'))
      throw errors.forbidden('Only organization media managers may view creator uploads.')
    const [events,clips]=await Promise.all([
      db.event.findMany({
        where:{orgId:id,deletedAt:null,status:{not:'CANCELLED'}},
        orderBy:{startsAt:'desc'},take:80,
        select:{id:true,title:true,status:true,visibility:true},
      }),
      db.mediaAsset.findMany({
        where:{orgId:id,kind:'CLIP',eventId:{not:null}},
        orderBy:{createdAt:'desc'},take:50,
        select:{id:true,eventId:true,caption:true,status:true,createdAt:true,
          event:{select:{title:true,status:true,visibility:true}}},
      }),
    ])
    const response=jsonOk({
      enabled:privateVideoIntakeEnabled()&&membership.orgStatus==='ACTIVE',
      maxBytes:MAX_PRIVATE_CLIP_BYTES,maxPending:MAX_PENDING_CLIPS_PER_ORG,
      events,clips,
    })
    response.headers.set('Cache-Control','private, no-store')
    return response
  })
}
