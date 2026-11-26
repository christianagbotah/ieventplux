import type { Prisma } from '@prisma/client'

/** Profile editor access is independent of ordinary team membership. */
export function editableOrganizer(userId:string):Prisma.OrganizationWhereInput {
 return {deletedAt:null,status:{not:'SUSPENDED'},OR:[
  {ownerId:userId},
  {memberships:{some:{userId,acceptedAt:{not:null},role:{in:['OWNER','ADMIN']}}}},
 ]}
}
