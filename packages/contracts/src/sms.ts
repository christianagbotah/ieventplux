const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';
export function smsSegments(content: string): { encoding: 'GSM-7' | 'UCS-2'; segments: number; chars: number } {
  let gsm = true; let units = 0;
  for (const ch of content) { if (GSM7.includes(ch)) units += 1; else if (GSM7_EXT.includes(ch)) units += 2; else { gsm = false; break; } }
  if (gsm) return { encoding: 'GSM-7', chars: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  const len = content.length; return { encoding: 'UCS-2', chars: len, segments: len === 0 ? 0 : len <= 70 ? 1 : Math.ceil(len / 67) };
}
