'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export type ConfirmOptions = {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'warning' | 'normal'
}
type Confirm = (options: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<Confirm | null>(null)

/** One accessible, focus-trapped, touch-friendly confirmation UI for the portal. */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null)
  const pending = useRef<((value: boolean) => void) | null>(null)

  const resolve = useCallback((accepted: boolean) => {
    const done = pending.current
    pending.current = null
    setRequest(null)
    done?.(accepted)
  }, [])

  const confirm = useCallback<Confirm>((options) => {
    pending.current?.(false)
    return new Promise<boolean>((done) => {
      pending.current = done
      setRequest(options)
    })
  }, [])

  const danger = request?.tone === 'danger'
  const warning = request?.tone === 'warning'

  return <ConfirmContext.Provider value={confirm}>
    {children}
    <AlertDialog open={!!request} onOpenChange={(open) => { if (!open) resolve(false) }}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-[450px] gap-5 rounded-[26px] border-border/65 bg-card p-5 shadow-[0_24px_90px_rgba(0,0,0,0.35)] sm:p-7">
        <div className={`flex size-14 items-center justify-center rounded-2xl border ${danger ? 'border-destructive/20 bg-destructive/10 text-destructive' : warning ? 'border-amber-500/20 bg-amber-500/10 text-amber-600' : 'border-primary/20 bg-primary/10 text-primary'}`}>
          {danger ? <ShieldAlert className="size-7" aria-hidden /> : warning ? <AlertTriangle className="size-7" aria-hidden /> : <CheckCircle2 className="size-7" aria-hidden />}
        </div>
        <AlertDialogHeader className="gap-2 text-left">
          <AlertDialogTitle className="text-xl font-extrabold tracking-tight sm:text-2xl">{request?.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-muted-foreground sm:text-[15px]">{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="!flex-row gap-2 sm:justify-end">
          <Button variant="outline" type="button" className="min-h-12 min-w-0 flex-1 rounded-xl sm:flex-none" onClick={() => resolve(false)}>{request?.cancelLabel || 'Cancel'}</Button>
          <Button variant={danger ? 'destructive' : 'premium'} type="button" className="min-h-12 min-w-0 flex-1 rounded-xl sm:flex-none" onClick={() => resolve(true)}>
            {request?.confirmLabel || 'Confirm'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </ConfirmContext.Provider>
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('Confirmation dialog provider is unavailable.')
  return confirm
}
