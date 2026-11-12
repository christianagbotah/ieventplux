import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { env } from '@/server/env'
import { formatMoneyPlain } from '@/server/money'
import { intakeCallback } from '@/server/services/payments'

/**
 * GET  /api/v1/payments/simulator/[reference] — Hubtel DEVELOPMENT SIMULATOR page.
 *
 * Explicit, isolated, development-only: this route only executes when
 * env.paymentsSimulator is true (credentials absent or dev force). It mirrors a
 * hosted-checkout experience so the full order → callback → reconciliation →
 * ledger workflow runs for real. It CANNOT run in production (env.ts refuses
 * simulator flags when NODE_ENV=production).
 *
 * POST outcomes (each exercises a documented acceptance case):
 *  - success            → callback with ResponseCode 0000 (amount matches)
 *  - failure            → callback with ResponseCode 0002
 *  - forged-amount      → callback claiming a different amount (must be rejected)
 *  - late-success       → success but after a manual reservation-expiry wait
 *  - duplicate-callback → the same callback posted twice (must fulfil once)
 *  - pending-forever    → no callback (reconciliation must resolve safely)
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params
  const { resolveHubtelCreds, paymentsSimulatorActive } = await import('@/server/hubtel/credentials')
  if (!paymentsSimulatorActive(await resolveHubtelCreds())) {
    return new NextResponse('The payment simulator is disabled because real Hubtel credentials are configured.', { status: 403 })
  }
  const attempt = await db.paymentAttempt.findUnique({ where: { reference }, include: { order: { include: { event: true } } } })
  if (!attempt) return new NextResponse('Unknown payment reference.', { status: 404 })

  const order = attempt.order
  const title = order?.event.title ?? 'Subscription invoice'
  const amountLabel = formatMoneyPlain(attempt.amountMinor, attempt.currency)
  const alreadyPaid = attempt.status === 'SUCCESS'
  const cancelled = new URL(req.url).searchParams.get('cancelled') === '1'

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Hubtel Dev Simulator — ${escapeHtml(reference)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  body { background: #f6f7f9; color: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .sheet { width: 100%; max-width: 420px; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(2,6,23,.12); overflow: hidden; }
  .head { background: linear-gradient(135deg, #065f46, #10b981); color: #fff; padding: 20px 22px; }
  .badge { display:inline-block; background: rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.35); padding: 3px 10px; border-radius: 999px; font-size: 11px; letter-spacing:.08em; text-transform: uppercase; }
  .head h1 { font-size: 18px; margin-top: 10px; }
  .body { padding: 20px 22px 24px; }
  .row { display:flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
  .row b { font-weight: 600; }
  .total { display:flex; justify-content: space-between; padding: 14px 0 4px; font-size: 18px; font-weight: 700; color: #065f46; }
  .actions { display: grid; gap: 10px; margin-top: 18px; }
  button { width: 100%; padding: 13px 14px; border-radius: 11px; border: 0; font-size: 14.5px; font-weight: 600; cursor: pointer; transition: transform .06s ease, filter .15s ease; }
  button:active { transform: scale(.985); }
  .pay { background: #10b981; color: #fff; }
  .fail { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
  .odd { background: #fff; color: #92400e; border: 1px solid #fde68a; font-size: 13px; }
  .cancel { background: #f1f5f9; color: #334155; }
  .note { margin-top: 16px; font-size: 12px; color: #64748b; line-height: 1.5; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 10px; }
  .state { margin-top: 14px; padding: 10px 12px; border-radius: 10px; font-size: 13.5px; display: none; }
  .state.ok { display:block; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; }
  .state.err { display:block; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
  .done { text-align:center; padding: 8px 0 2px; }
  .done .tick { width: 54px; height: 54px; border-radius: 50%; background:#ecfdf5; color:#059669; display:flex; align-items:center; justify-content:center; font-size: 26px; margin: 0 auto 10px; }
</style>
</head>
<body>
  <main class="sheet" role="main">
    <div class="head">
      <span class="badge">Hubtel Checkout · Dev Simulator</span>
      <h1>${escapeHtml(title)}</h1>
    </div>
    <div class="body">
      ${alreadyPaid ? `
      <div class="done">
        <div class="tick">✓</div>
        <p style="font-size:15px;font-weight:600">This payment was already completed.</p>
        <p style="font-size:13px;color:#64748b;margin-top:6px">Reference ${escapeHtml(reference)} · ${escapeHtml(amountLabel)}</p>
      </div>` : `
      <div class="row"><span>Reference</span><b>${escapeHtml(reference)}</b></div>
      <div class="row"><span>Method</span><b>Mobile Money / Card (simulated)</b></div>
      <div class="row"><span>Buyer</span><b>${escapeHtml(order?.buyerName ?? 'Organization')}</b></div>
      <div class="total"><span>Total</span><span>${escapeHtml(amountLabel)}</span></div>
      <div class="actions">
        <button class="pay" data-outcome="success">Approve payment (₵ simulated)</button>
        <button class="fail" data-outcome="failure">Decline payment</button>
        <button class="odd" data-outcome="forged-amount">Send forged amount callback</button>
        <button class="odd" data-outcome="late-success">Pay late (after hold expiry)</button>
        <button class="odd" data-outcome="duplicate-callback">Pay twice (duplicate callback)</button>
        <button class="odd" data-outcome="pending-forever">Walk away (no callback)</button>
        <button class="cancel" onclick="location.href='${env.appUrl}/api/v1/payments/return/${escapeHtml(reference)}?cancelled=1'">Cancel checkout</button>
      </div>
      <div id="state" class="state" role="status" aria-live="polite"></div>`}
      <p class="note">
        <strong>Development simulator.</strong> Isolated from production: it only runs while Hubtel credentials are absent
        and NODE_ENV is development. The order, callback, reconciliation, ticket issuance and ledger that follow are
        the real production code paths — only the provider boundary is simulated.
        ${cancelled ? '<br/><strong>This checkout was cancelled.</strong> No money moved; the order hold expires automatically.' : ''}
      </p>
    </div>
  </main>
  <script>
    const REF = ${JSON.stringify(reference)};
    const AMOUNT = ${(attempt.amountMinor / 100).toFixed(2)};
    const TX = 'SIM-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    function show(msg, ok) {
      const el = document.getElementById('state');
      el.textContent = msg;
      el.className = 'state ' + (ok ? 'ok' : 'err');
    }
    function payload(responseCode, amount) {
      return { ResponseCode: responseCode, TransactionId: TX, Amount: amount, Currency: 'GHS', Description: 'Dev simulator payment', ClientReference: REF };
    }
    document.querySelectorAll('button[data-outcome]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const outcome = btn.dataset.outcome;
        const send = (p) => fetch('/api/v1/payments/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (outcome === 'success' || outcome === 'duplicate-callback') {
          await send(payload('0000', AMOUNT));
          if (outcome === 'duplicate-callback') { await send(payload('0000', AMOUNT)); }
          show('Payment callback delivered. Fulfilment is processing…', true);
          setTimeout(function(){ location.href = '/api/v1/payments/return/' + REF; }, 900);
        } else if (outcome === 'failure') {
          await send(payload('0002', AMOUNT));
          show('Failure callback delivered — the order stays unpaid and can be retried.', false);
        } else if (outcome === 'forged-amount') {
          await send(payload('0000', (AMOUNT * 3).toFixed(2)));
          show('Forged amount sent — the callback will be REJECTED by amount verification.', false);
        } else if (outcome === 'late-success') {
          show('Waiting 16s for the ticket hold to expire, then paying late…', true);
          setTimeout(async function () {
            await send(payload('0000', AMOUNT));
            show('Late callback delivered — the exception/refund policy decides the outcome.', true);
            setTimeout(function(){ location.href = '/api/v1/payments/return/' + REF; }, 900);
          }, 16000);
        } else if (outcome === 'pending-forever') {
          show('No callback will be sent. Reconciliation checks after 5 minutes keep the order safely unresolved.', true);
        }
      });
    });
  </script>
</body>
</html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
