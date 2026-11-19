'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { FileText, Camera, ShieldCheck, Loader2, Download, RefreshCw, Trash2, Eye, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react'
import { api, ApiClientError } from '../api'
import { IdentityLiveCapture } from './IdentityLiveCapture'
import { kycRequirements, type IdentityDocumentSide, type IdentityDocumentKind } from '@/server/kyc-requirements'

type AutomatedIdentityState = {
  provider: { configured: boolean; enabled: boolean; ready: boolean; mode: string; requirements: string[]; noticeUrl: string | null }
  jobs: { id: string; state: string; createdAt: string; lastCheckedAt?: string | null }[]
  autoApproval: false
  manualReviewAvailable: true
}

type KycKind = IdentityDocumentKind
type Document = { id: string; kind: KycKind; side?: IdentityDocumentSide | null; filename: string; mime: string; size: number; uploadedAt: string }
const LABELS: Record<KycKind, string> = {
  BUSINESS_REGISTRATION: 'Company / organization registration',
  GOVERNMENT_ID: 'Government-issued ID',
  SELFIE: 'Selfie for manual identity review',
}
const labelFor = (doc: Document, orgType = '') => doc.kind === 'BUSINESS_REGISTRATION' && orgType === 'SCHOOL'
  ? 'School registration / authorization'
  : doc.kind === 'GOVERNMENT_ID'
  ? 'Government ID — ' + (doc.side === 'BACK' ? 'back' : 'front' + (doc.side ? '' : ' (earlier upload)'))
  : LABELS[doc.kind]

export function VerificationDocuments({ orgId, reviewerMode = false, onSubmitted }: {
  orgId: string
  reviewerMode?: boolean
  onSubmitted?: () => void
}) {
  const { toast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [orgType, setOrgType] = useState('INDIVIDUAL')
  const [status, setStatus] = useState('')
  const [reviewNote, setReviewNote] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [kind, setKind] = useState<KycKind>('GOVERNMENT_ID')
  const [file, setFile] = useState<File | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Document | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [automated, setAutomated] = useState<AutomatedIdentityState | null>(null)
  const [checkingJob, setCheckingJob] = useState('')
  const [liveCaptureOpen, setLiveCaptureOpen] = useState(false)
  const [reviewerProviderJobs, setReviewerProviderJobs] = useState<{ id: string; state: string; createdAt: string }[]>([])

  const load = useCallback(async () => {
    try {
      const payload = await api.get<{ documents: Document[]; orgType: string; status: string; reviewNote?: string | null; providerJobs?: { id: string; state: string; createdAt: string }[] }>('/orgs/' + orgId + '/kyc')
      setDocuments(payload.documents)
      setReviewerProviderJobs(payload.providerJobs ?? [])
      setOrgType(payload.orgType)
      setKind((previous) => payload.orgType === 'INDIVIDUAL' && previous === 'BUSINESS_REGISTRATION' ? 'GOVERNMENT_ID' : previous)
      setStatus(payload.status)
      setReviewNote(payload.reviewNote ?? null)
      setLoadError('')
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message : 'Could not load verification documents.'
      setLoadError(msg)
      toast({ title: 'Documents unavailable', description: msg, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [orgId, toast])
  useEffect(() => { void load() }, [load])
  const loadAutomated = useCallback(async () => {
    try {
      const status = await api.get<AutomatedIdentityState>('/orgs/' + orgId + '/identity-checks')
      setAutomated(status)
    } catch { setAutomated(null) }
  }, [orgId])
  useEffect(() => { if (!reviewerMode) void loadAutomated() }, [reviewerMode, loadAutomated])
  const refreshJob = async (jobId: string) => {
    setCheckingJob(jobId)
    try {
      await api.post('/orgs/' + orgId + '/identity-checks/' + jobId, {})
      await loadAutomated()
    } catch (error) {
      toast({ title: 'Could not refresh provider check', description: error instanceof ApiClientError ? error.message : 'Please try again later.', variant: 'destructive' })
    } finally { setCheckingJob('') }
  }

  const requirements = useMemo(() => kycRequirements(orgType, documents), [orgType, documents])
  const missing = requirements.filter((req) => !req.complete)
  const isPersonal = orgType === 'INDIVIDUAL'
  const fileUrl = (doc: Document) => '/api/v1/orgs/' + encodeURIComponent(orgId) + '/kyc/' + encodeURIComponent(doc.id)

  const upload = async (selected: File | null, side?: IdentityDocumentSide) => {
    if (!selected || !consent || busy || documents.length >= 10) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', selected)
      body.append('kind', kind)
      if (side) body.append('side', side)
      body.append('consent', 'yes')
      await api.upload('/orgs/' + orgId + '/kyc', body)
      if (side === 'FRONT') setFrontFile(null)
      else if (side === 'BACK') setBackFile(null)
      else setFile(null)
      setNonce((value) => value + 1)
      toast({ title: (side ? 'ID ' + side.toLowerCase() : LABELS[kind]) + ' uploaded', description: 'Encrypted and available to authorized manual reviewers.' })
      await load()
      onSubmitted?.()
    } catch (error) {
      toast({ title: 'Secure upload failed', description: error instanceof ApiClientError ? error.message : 'Please try again.', variant: 'destructive' })
    } finally { setBusy(false) }
  }
  const remove = async (documentId: string) => {
    if (busy || !window.confirm('Remove this verification document? You can upload a corrected copy. Encrypted backup copies expire under the retention policy.')) return
    setBusy(true)
    try {
      await api.delete('/orgs/' + orgId + '/kyc/' + documentId)
      toast({ title: 'Document removed', description: 'The active encrypted document has been revoked.' })
      await load()
      onSubmitted?.()
    } catch (error) {
      toast({ title: 'Could not remove document', description: error instanceof ApiClientError ? error.message : 'Please retry.', variant: 'destructive' })
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Private KYC documents</p>
        <Badge variant="secondary">{status || (loading ? 'Checking…' : 'PENDING')}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Documents remain encrypted outside the public website. Only organization administrators and authorized finance reviewers can view them. Review is manual; no biometric face matching is performed.
      </p>
      <div className="space-y-2 rounded-lg border border-border/70 bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">Smile ID biometric verification: {automated?.provider.ready ? `${automated.provider.mode === 'sandbox' ? 'Sandbox' : 'Production'} connected` : 'Not activated'}</p>
        <p>{automated?.provider.ready
          ? automated.provider.mode === 'sandbox' ? 'Test environment connected. The guided camera is available, but sandbox checks do not establish real identity. Use manual KYC for actual approvals.' : 'Live camera verification is available. A separate biometric consent is required before capture, and you decide when to submit images. Manual review remains available.'
          : 'Automated identity matching and liveness verification require an active Smile ID account, a published biometric privacy notice and a separately consented live-camera capture. A normal selfie upload is not an automated identity check.'}</p>
        {!reviewerMode && automated && !automated.provider.ready && status !== 'APPROVED' && (
          <div className="pt-1">
            <Button type="button" size="sm" variant="outline" className="gap-2" disabled title="Requires an activated Smile ID account and biometric privacy notice">
              <Camera className="size-4" /> Guided selfie and ID verification · Activation required
            </Button>
          </div>
        )}
        {!reviewerMode && automated?.provider.ready && automated.provider.noticeUrl && status !== 'APPROVED' && (
          <div className="pt-1">
            <Button type="button" size="sm" className="gap-2" disabled={automated.jobs.some((job) => ['SUBMITTING','PROCESSING'].includes(job.state))} onClick={() => setLiveCaptureOpen(true)}>
              <Camera className="size-4" /> Start guided selfie and ID verification
            </Button>
            {automated.jobs.some((job) => ['SUBMITTING','PROCESSING'].includes(job.state)) && <p className="mt-1 text-xs">An existing identity check is in progress. Review its status before starting another.</p>}
          </div>
        )}
        {!reviewerMode && automated && automated.provider.requirements.length > 0 && (
          <p>Setup outstanding: {automated.provider.requirements.join(' · ')}. No biometric images have been sent to Smile ID by this screen.</p>
        )}
        {!reviewerMode && automated && automated.jobs.length > 0 && <div className="space-y-2 border-t pt-2">
          <p className="font-semibold text-foreground">Provider check history</p>
          {automated.jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{job.state.replaceAll('_', ' ').toLowerCase()} · {new Date(job.createdAt).toLocaleDateString()}</span>
            {job.state === 'PROCESSING' && <Button type="button" size="sm" variant="outline" disabled={checkingJob !== ''} onClick={() => void refreshJob(job.id)}>
              {checkingJob === job.id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Check status
            </Button>}
          </div>)}
          <p>Even a clear provider result requires human review before the organizer is approved.</p>
        </div>}
      </div>
      {reviewerMode && reviewerProviderJobs.length > 0 && <div className="rounded-lg border border-amber-400/40 p-3 text-xs">
        <p className="font-semibold">Automated provider checks — reviewer information</p>
        {reviewerProviderJobs.map((job) => <p key={job.id} className="mt-1">{new Date(job.createdAt).toLocaleString()}: {job.state.replaceAll('_', ' ')}</p>)}
        <p className="mt-1 text-muted-foreground">Provider decisions require manual assessment; an unsuccessful or inconclusive check must be documented if approval is granted.</p>
      </div>}
      {reviewNote && status === 'REJECTED' && <p className="rounded-lg border border-amber-400/30 bg-amber-50/70 p-3 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-200"><strong>Reviewer instructions:</strong> {reviewNote}</p>}
      {loading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading secure evidence…</p>
        : loadError ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}<Button type="button" variant="outline" size="sm" className="ml-3" onClick={() => void load()}>Retry</Button></div>
        : (
          <>
            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Verification checklist</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {requirements.map((req) => (
                  <div key={req.key} className="flex items-center gap-2 text-xs">
                    {req.complete ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden />}
                    <span className={req.complete ? 'text-foreground' : 'font-semibold text-amber-800 dark:text-amber-200'}>{req.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{req.complete ? 'Uploaded' : 'Missing'}</span>
                  </div>
                ))}
              </div>
              {missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{missing.length} required item{missing.length === 1 ? '' : 's'} outstanding. Approval is unavailable until all evidence is uploaded and manually inspected.</p>}
            </div>
            {documents.length === 0 ? <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">No documents uploaded yet.</p> : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                    {doc.kind === 'SELFIE' ? <Camera className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <div className="min-w-[110px] flex-1">
                      <p className="truncate text-xs font-semibold">{labelFor(doc, orgType)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{doc.filename} · {Math.ceil(doc.size / 1024).toLocaleString()} KB · {doc.mime === 'application/pdf' ? 'PDF' : 'Image'}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPreview(doc)} aria-label={'View ' + labelFor(doc, orgType)}>
                      <Eye className="size-3.5" aria-hidden /> View
                    </Button>
                    <a href={fileUrl(doc)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-secondary" aria-label={'Download ' + labelFor(doc, orgType)}><Download className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Download</span></a>
                    {!reviewerMode && status !== 'APPROVED' && (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void remove(doc.id)} aria-label={'Remove ' + labelFor(doc, orgType)} className="h-8 px-2 text-destructive"><Trash2 className="size-3.5" aria-hidden /></Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      {!reviewerMode && !loading && !loadError && status !== 'APPROVED' && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">Upload verification evidence</p>
          {isPersonal && <p className="text-xs text-muted-foreground">Personal organizers only need a government ID (front and back) and a selfie; business registration is not required.</p>}
          <label htmlFor="kyc-kind" className="block text-xs font-semibold">Document category</label>
          <select id="kyc-kind" value={kind} onChange={(e) => { setKind(e.target.value as KycKind); setFile(null); setFrontFile(null); setBackFile(null) }} className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
            {(Object.keys(LABELS) as KycKind[]).filter((value) => !(isPersonal && value === 'BUSINESS_REGISTRATION')).map((value) => <option key={value} value={value}>{value === 'BUSINESS_REGISTRATION' && orgType === 'SCHOOL' ? 'School registration / authorization' : LABELS[value]}</option>)}
          </select>
          {kind === 'GOVERNMENT_ID' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['FRONT', 'BACK'] as const).map((side) => {
                const selected = side === 'FRONT' ? frontFile : backFile
                const alreadyUploaded = documents.some((doc) => doc.kind === 'GOVERNMENT_ID' && (side === 'FRONT' ? !doc.side || doc.side === 'FRONT' : doc.side === 'BACK'))
                return <div key={side} className="space-y-2 rounded-lg border border-border p-3">
                  <label htmlFor={'kyc-id-' + side} className="flex items-center gap-2 text-xs font-semibold">
                    <CreditCard className="size-4" aria-hidden /> ID {side.toLowerCase()}
                    {alreadyUploaded && <span className="ml-auto text-[10px] text-emerald-700 dark:text-emerald-300">Uploaded</span>}
                  </label>
                  <Input key={side + '-' + nonce} id={'kyc-id-' + side} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => side === 'FRONT' ? setFrontFile(event.target.files?.[0] ?? null) : setBackFile(event.target.files?.[0] ?? null)} />
                  <Button type="button" size="sm" variant="outline" className="w-full" disabled={!selected || !consent || busy || documents.length >= 10} onClick={() => void upload(selected, side)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Upload {side.toLowerCase()}</Button>
                </div>
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="kyc-file" className="block text-xs font-semibold">{kind === 'SELFIE' ? 'Take or select a selfie' : 'Select registration document'}</label>
              <Input key={kind + '-' + nonce} id="kyc-file" type="file" accept={kind === 'SELFIE' ? 'image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp'} capture={kind === 'SELFIE' ? 'user' : undefined} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <Button type="button" size="sm" disabled={!file || !consent || busy || documents.length >= 10} onClick={() => void upload(file)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Secure upload</Button>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">Accepted: PDF, PNG, JPG, WebP; up to 8 MB per document and 10 documents per organization. On a phone, the selfie field can open the front camera.</p>
          <label className="flex items-start gap-2 text-xs leading-relaxed">
            <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
            <span>I am authorized to submit these documents and consent to encrypted storage for manual identity verification. Removed documents may remain in encrypted backups until backup retention expires.</span>
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="size-3.5" /> Refresh evidence</Button>
        </div>
      )}

      {liveCaptureOpen && automated?.provider.ready && automated.provider.noticeUrl && (
        <IdentityLiveCapture orgId={orgId} noticeUrl={automated.provider.noticeUrl} onClose={() => setLiveCaptureOpen(false)} onSubmitted={() => { void loadAutomated(); void load(); onSubmitted?.() }} />
      )}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="pr-8 text-base">{preview ? labelFor(preview) : 'Document preview'}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Private in-browser preview. Access is restricted and logged. Close this window when finished reviewing.</p>
          {preview && (preview.mime === 'application/pdf'
            ? <iframe key={preview.id} src={fileUrl(preview) + '?preview=1'} title={'Secure preview of ' + labelFor(preview)} className="h-[65dvh] min-h-[260px] w-full rounded-lg border bg-muted" />
            : <div className="flex min-h-[240px] max-h-[70dvh] items-center justify-center overflow-auto rounded-lg border bg-muted/40 p-2">
                <img key={preview.id} src={fileUrl(preview) + '?preview=1'} alt={'Private preview of ' + labelFor(preview)} className="max-h-[65dvh] max-w-full object-contain" />
              </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>Close preview</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
