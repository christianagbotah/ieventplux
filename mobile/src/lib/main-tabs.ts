/**
 * Mobile primary navigation mirrors the public web portal's six destinations.
 * Live remains discoverable in the top bar and discovery shortcut (as on web).
 */
export const MAIN_TABS = [
  { route: 'Discover', label: 'Discover', icon: 'compass' },
  { route: 'Following', label: 'Feed', icon: 'users' },
  { route: 'Reels', label: 'Reels', icon: 'film' },
  { route: 'Marketplace', label: 'Shop', icon: 'bag' },
  { route: 'MyTickets', label: 'Tickets', icon: 'ticket' },
  { route: 'Account', label: 'Account', icon: 'person' },
] as const
export type MainTabRoute = (typeof MAIN_TABS)[number]['route']
export function isMainTabRoute(route: string | undefined): route is MainTabRoute {
  return MAIN_TABS.some(tab => tab.route === route)
}
export function requiresAuthentication(route: MainTabRoute): boolean {
  return route === 'MyTickets' || route === 'Account'
}
