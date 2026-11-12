'use client'

import { create } from 'zustand'

export interface SessionUser {
  id: string
  email: string
  displayName: string
  role: string
  avatarUrl: string | null
  phone: string | null
  country: string
  city: string | null
  timezone: string
  notifPrefs: Record<string, boolean>
  status: string
  elevated: boolean
}

export interface MembershipInfo {
  orgId: string
  role: string
  orgName: string
  orgSlug: string
  orgStatus: string
}

interface PortalState {
  user: SessionUser | null
  memberships: MembershipInfo[]
  activeOrgId: string | null
  unread: number
  realtimeConnected: boolean
  assistantOpen: boolean
  /** True once the first /auth/me bootstrap has resolved — private views must
   * not redirect to /signin while the session is still being checked. */
  booted: boolean
  setUser: (user: SessionUser | null) => void
  setMemberships: (m: MembershipInfo[]) => void
  setActiveOrg: (orgId: string | null) => void
  setUnread: (n: number) => void
  setRealtimeConnected: (v: boolean) => void
  setAssistantOpen: (v: boolean) => void
  setBooted: (v: boolean) => void
}

export const usePortal = create<PortalState>((set) => ({
  user: null,
  memberships: [],
  activeOrgId: null,
  unread: 0,
  realtimeConnected: false,
  assistantOpen: false,
  booted: false,
  setUser: (user) => set({ user }),
  setBooted: (booted) => set({ booted }),
  setMemberships: (memberships) =>
    set((state) => ({
      memberships,
      activeOrgId: memberships.length === 0 ? null : memberships.some((m) => m.orgId === state.activeOrgId) ? state.activeOrgId : memberships[0].orgId,
    })),
  setActiveOrg: (activeOrgId) => set({ activeOrgId }),
  setUnread: (unread) => set({ unread }),
  setRealtimeConnected: (realtimeConnected) => set({ realtimeConnected }),
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
}))

export function isOrganizer(user: SessionUser | null, memberships: MembershipInfo[]): boolean {
  return Boolean(user && memberships.length > 0)
}

export function isPlatformStaff(user: SessionUser | null): boolean {
  return Boolean(user && ['SUPPORT', 'MODERATOR', 'FINANCE_ADMIN', 'SUPER_ADMIN'].includes(user.role))
}
