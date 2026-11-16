'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { FileText, Camera, ShieldCheck, Loader2, Download, RefreshCw } from 'lucide-react'
import { api, ApiClientError } from '../api'

type KycKind = 'BUSINESS_REGISTRATION' | 'GOVERNMENT_ID' | 'SELFIE'
type Document = { id: string; kind: KycKind; filename: string; mime: string; size: number; uploadedAt: string }
const LABELS: Record<KycKind, string> = {
  BUSINESS_REGISTRATION: 'Company / organization registration',
  GOVERNMENT_ID: 'National ID / passport / driving licence',
  SELFIE: 'Selfie for manual identity review',
}
export function VerificationDocuments({ orgId, reviewerMode = false, onSubmitted }: {
  orgId: string
  reviewerMode?: boolean
  onSubmitted?: () => void
}) {
  const { toast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<KycKind>('BUSINESS_REGISTRATION')
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const payload = await api.get<{ documents: Document[]; status: string }>('/orgs/' + orgId + '/kyc')
      setDocuments(payload.documents)
      setStatus(payload.status)
    } catch (error) {
      toast({ description: error instanceof ApiClientError ? error.message : 'Could not load verification documents.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [orgId, toast])
  useEffect(() => { void load() }, [load])
  const upload = async () => {
    if (!file || !consent || busy) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('kind', kind)
      body.append('consent', 'yes')
      await api.upload('/orgs/' + orgId + '/kyc', body)
      setFile(null)
      toast({ title: 'Document secured', description: 'Submitted for restricted manual verification. No identity decision has been made.' })
      await load()
      onSubmitted?.()
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof ApiClientError ? error.message : 'Try again.', variant: 'destructive' })
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Private KYC documents</p>
        <Badge variant="secondary">{status || 'PENDING'}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Documents are stored encrypted outside the public website and accessed only by organization administrators or authorized finance reviewers. Selfies are reviewed manually, not automatically matched.
      </p>
      {loading ? <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading documents…</span> : documents.length === 0 ? (
        <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div className="flex items-center gap-2 rounded-lg border p-2" key={doc.id}>
              {doc.kind === 'SELFIE' ? <Camera className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{LABELS[doc.kind]}</p>
                <p className="truncate text-[11px] text-muted-foreground">{doc.filename} · {Math.ceil(doc.size / 1024).toLocaleString()} KB</p>
              </div>
              <a href={'/api/v1/orgs/' + orgId + '/kyc/' + doc.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-secondary" aria-label={'Download ' + LABELS[doc.kind]}><Download className="h-3.5 w-3.5" /> Download</a>
            </div>
          ))}
        </div>
      )}
      {!reviewerMode && (
        <div className="space-y-3 rounded-xl border p-3">
          <label htmlFor="kyc-kind" className="text-xs font-semibold">Document category</label>
          <select id="kyc-kind" value={kind} onChange={(e) => { setKind(e.target.value as KycKind); setFile(null) }} className="block h-10 w-full rounded-md border bg-background px-3 text-sm">
            {(Object.keys(LABELS) as KycKind[]).map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
          </select>
          <label htmlFor="kyc-file" className="block text-xs font-semibold">{kind === 'SELFIE' ? 'Take or choose a selfie' : 'Choose a document'}</label>
          <Input key={kind} id="kyc-file" type="file" accept={kind === 'SELFIE' ? 'image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp'} capture={kind === 'SELFIE' ? 'user' : undefined} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="text-[11px] text-muted-foreground">PDF, PNG, JPG, WebP. Maximum 8 MB per file (10 files per organization). On phones, the selfie field can open the front camera.</p>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            I have authority to submit these documents and consent to storing them for manual organization/identity verification.
          </label>
          <Button size="sm" type="button" disabled={!file || !consent || busy || documents.length >= 10} onClick={() => void upload()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />} Secure upload</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => void load()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh list</Button>
        </div>
      )}
    </div>
  )
}
