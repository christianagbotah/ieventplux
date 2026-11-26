/** Provider data is only a route hint. It never supplies an account or URL. */
export function isActivityHint(data:unknown):boolean {
 return !!data&&typeof data==='object'&&(data as Record<string,unknown>).kind==='activity'
}
export function activityDestination(authenticated:boolean):'Notifications'|'Login'{
 return authenticated?'Notifications':'Login'
}
