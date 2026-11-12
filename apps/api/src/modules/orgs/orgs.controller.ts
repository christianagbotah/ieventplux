import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import type { z } from 'zod';
import { createOrgSchema, updateOrgSchema, inviteMemberSchema, updateMemberSchema } from '@ieventplux/contracts';
import { Auth, Public, type AuthContext } from '../../common/auth.js';
import { Z } from '../../common/zod.pipe.js';
import { OrgsService } from './orgs.service.js';

@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}
  @Post() create(@Auth() auth: AuthContext, @Body(Z(createOrgSchema)) body: z.infer<typeof createOrgSchema>) { return this.orgs.create(auth, body); }
  @Get('mine') mine(@Auth() auth: AuthContext) { return this.orgs.mine(auth); }
  @Get('invites') invites(@Auth() auth: AuthContext) { return this.orgs.pendingInvites(auth); }
  @Post('invites/:membershipId/accept') @HttpCode(200) accept(@Auth() auth: AuthContext, @Param('membershipId') id: string) { return this.orgs.acceptInvite(auth, id); }
  @Public() @Get('by-slug/:slug') bySlug(@Param('slug') slug: string) { return this.orgs.publicProfile(slug); }
  @Get(':orgId') get(@Auth() auth: AuthContext, @Param('orgId') orgId: string) { return this.orgs.get(auth, orgId); }
  @Put(':orgId') update(@Auth() auth: AuthContext, @Param('orgId') orgId: string, @Body(Z(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>) { return this.orgs.update(auth, orgId, body); }
  @Get(':orgId/members') members(@Auth() auth: AuthContext, @Param('orgId') orgId: string) { return this.orgs.members(auth, orgId); }
  @Post(':orgId/members') invite(@Auth() auth: AuthContext, @Param('orgId') orgId: string, @Body(Z(inviteMemberSchema)) body: z.infer<typeof inviteMemberSchema>) { return this.orgs.invite(auth, orgId, body); }
  @Put(':orgId/members/:membershipId') updateMember(@Auth() auth: AuthContext, @Param('orgId') orgId: string, @Param('membershipId') id: string, @Body(Z(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>) { return this.orgs.updateMember(auth, orgId, id, body); }
  @Delete(':orgId/members/:membershipId') async remove(@Auth() auth: AuthContext, @Param('orgId') orgId: string, @Param('membershipId') id: string) { await this.orgs.removeMember(auth, orgId, id); return { ok: true }; }
  @Post(':orgId/transfer-ownership/:membershipId') @HttpCode(200) async transfer(@Auth() auth: AuthContext, @Param('orgId') orgId: string, @Param('membershipId') id: string) { await this.orgs.transferOwnership(auth, orgId, id); return { ok: true }; }
}
