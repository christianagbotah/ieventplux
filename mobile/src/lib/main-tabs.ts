/** The mobile shell's five real destinations, all backed by native screens. */
export const MAIN_TABS = [
  { route: 'Discover', label: 'Explore', icon: 'compass' },
  { route: 'LiveHub', label: 'Live', icon: 'live' },
  { route: 'Marketplace', label: 'Shops', icon: 'bag' },
  { route: 'MyTickets', label: 'Tickets', icon: 'ticket' },
  { route: 'Account', label: 'You', icon: 'person' },
] as const
export type MainTabRoute = (typeof MAIN_TABS)[number]['route']
export function isMainTabRoute(route: string | undefined): route is MainTabRoute {
  return MAIN_TABS.some(tab => tab.route === route)
}
