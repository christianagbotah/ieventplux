/** Deployment-only loopback mode: never accept a relay address from HTTP or DB settings. */
export function localMailRelayEnabled(mode: string | undefined, from: string): boolean {
  return mode === 'loopback' && /^[A-Za-z0-9._%+-]+@lightworldtech\.com$/i.test(from)
}
export function mailTransportOptions(config: {host:string;port:number;user:string;pass:string;transport?:'loopback'|'authenticated'}) {
  const timeouts = {connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000}
  if (config.transport === 'loopback') return {host:'127.0.0.1',port:25,secure:false,ignoreTLS:true,...timeouts}
  return {host:config.host,port:config.port,secure:config.port===465,requireTLS:config.port!==465,auth:{user:config.user,pass:config.pass},...timeouts}
}
