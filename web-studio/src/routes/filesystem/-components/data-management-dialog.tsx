import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { formatDateTime } from '#/i18n/format'

import {
  commitSnapshot,
  createDataManagementClient,
  exportOvpack,
  importOvpack,
  listSnapshots,
  previewRestore,
  restoreSnapshot,
} from '../-lib/data-management'
import type { RestorePlan, SnapshotCommit } from '../-lib/data-management'

interface Props {
  mode: 'history' | 'transfer'
  onClose: () => void
  onCompare: () => void
  onChanged: () => void
  uri: string
  isDirectory: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function downloadBlob(blob: Blob, uri: string): void {
  const name = uri.replace(/\/$/, '').split('/').at(-1) || 'openviking'
  const safeName = name.replace(/[^\w.-]+/g, '_')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName}.ovpack`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function DataManagementDialog({
  mode,
  onClose,
  onCompare,
  onChanged,
  uri,
  isDirectory,
}: Props) {
  const { t } = useTranslation('dataManagement')
  const source = useMemo(createDataManagementClient, [])
  const controller = useRef(new AbortController())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [commits, setCommits] = useState<SnapshotCommit[] | null>(null)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<SnapshotCommit | null>(null)
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [conflict, setConflict] = useState<'fail' | 'skip' | 'overwrite'>(
    'fail',
  )

  useEffect(() => {
    const signal = controller.current.signal
    if (mode === 'history') {
      void listSnapshots(source, uri, signal)
        .then((items) => {
          if (!signal.aborted) setCommits(items)
        })
        .catch((cause) => {
          if (!signal.aborted) setError(errorMessage(cause))
        })
    }
    return () => controller.current.abort()
  }, [mode, source, uri])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      if (!controller.current.signal.aborted) {
        setError(errorMessage(cause))
      }
    } finally {
      if (!controller.current.signal.aborted) setBusy(false)
    }
  }

  const signal = controller.current.signal
  const hasChanges = Boolean(
    plan && (plan.diff.to_write.length || plan.diff.to_delete.length),
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(mode === 'history' ? 'historyTitle' : 'transferTitle')}
          </DialogTitle>
          <DialogDescription className="break-all">{uri}</DialogDescription>
        </DialogHeader>

        {mode === 'history' ? (
          <div className="min-w-0 space-y-5">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!message.trim() || busy) return
                void run(async () => {
                  await commitSnapshot(source, uri, message.trim(), signal)
                  setCommits(await listSnapshots(source, uri, signal))
                  setMessage('')
                  onChanged()
                  toast.success(t('snapshotSaved'))
                })
              }}
            >
              <input
                aria-label={t('message')}
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                maxLength={200}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t('message')}
                value={message}
              />
              <Button disabled={busy || !message.trim()} type="submit">
                {t('saveSnapshot')}
              </Button>
            </form>
            <div className="text-xs text-muted-foreground">
              {t('snapshotScope')}
            </div>
            {commits === null ? (
              <p>{t('loading')}</p>
            ) : commits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('noSnapshots')}
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {commits.map((commit) => (
                  <li
                    className="flex items-center justify-between gap-2 rounded-md border p-3"
                    key={commit.oid}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {commit.message}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {commit.oid.slice(0, 12)}
                        {commit.author?.time_seconds
                          ? ` · ${formatDateTime(new Date(commit.author.time_seconds * 1000))}`
                          : ''}
                      </p>
                    </div>
                    {isDirectory && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            setSelected(commit)
                            setPlan(null)
                            setPlan(
                              await previewRestore(
                                source,
                                uri,
                                commit.oid,
                                signal,
                              ),
                            )
                          })
                        }
                        size="sm"
                        variant="outline"
                      >
                        {t('previewRestore')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!isDirectory && commits && commits.length > 0 && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={onCompare}>
                  {t('diffComparison')}
                </Button>
              </div>
            )}
            {selected && plan && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">{t('restorePreview')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('restoreCounts', {
                    written: plan.diff.to_write.length,
                    deleted: plan.diff.to_delete.length,
                  })}
                </p>
                <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {[
                    ...plan.diff.to_write.map((item) => `+ ${item.path}`),
                    ...plan.diff.to_delete.map((path) => `- ${path}`),
                  ].join('\n') || t('noChanges')}
                </pre>
                <p className="text-xs text-muted-foreground">
                  {t('restoreNotice')}
                </p>
                <Button
                  disabled={busy || !hasChanges}
                  onClick={() =>
                    void run(async () => {
                      const result = await restoreSnapshot(
                        source,
                        uri,
                        plan,
                        signal,
                      )
                      setPlan(null)
                      setCommits(await listSnapshots(source, uri, signal))
                      onChanged()
                      toast.success(
                        t(result.result === 'noop' ? 'noChanges' : 'restored'),
                      )
                    })
                  }
                  variant="destructive"
                >
                  {t('confirmRestore')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2 rounded-md border p-4">
              <h3 className="font-medium">{t('exportTitle')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('exportDescription')}
              </p>
              <Button
                disabled={busy || !isDirectory}
                onClick={() =>
                  void run(async () => {
                    const blob = await exportOvpack(source, uri, signal)
                    if (signal.aborted) return
                    downloadBlob(blob, uri)
                    toast.success(t('exported'))
                  })
                }
              >
                {t('exportAction')}
              </Button>
            </section>
            <section className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">{t('importTitle')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('importDescription')}
              </p>
              <input
                accept=".ovpack"
                aria-label={t('chooseFile')}
                disabled={busy || !isDirectory}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <label className="flex items-center gap-2 text-sm">
                {t('conflict')}
                <select
                  className="rounded-md border bg-background px-2 py-1"
                  disabled={busy}
                  onChange={(event) =>
                    setConflict(event.target.value as typeof conflict)
                  }
                  value={conflict}
                >
                  <option value="fail">{t('conflictFail')}</option>
                  <option value="skip">{t('conflictSkip')}</option>
                  <option value="overwrite">{t('conflictOverwrite')}</option>
                </select>
              </label>
              <Button
                disabled={busy || !isDirectory || !file}
                onClick={() =>
                  void run(async () => {
                    if (!file) return
                    await importOvpack(source, uri, file, conflict, signal)
                    if (signal.aborted) return
                    onChanged()
                    setFile(null)
                    toast.success(t('imported'))
                  })
                }
              >
                {t('importAction')}
              </Button>
            </section>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
