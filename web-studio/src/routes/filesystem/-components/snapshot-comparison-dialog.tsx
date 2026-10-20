import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { formatDateTime } from '#/i18n/format'

import {
  createDataManagementClient,
  diffSnapshot,
  listSnapshots,
} from '../-lib/data-management'
import type { SnapshotCommit } from '../-lib/data-management'
import { SnapshotDiffViewer } from './snapshot-diff-viewer'

interface Props {
  onClose: () => void
  uri: string
}

function versionLabel(commit: SnapshotCommit): string {
  const date = commit.author?.time_seconds
    ? ` · ${formatDateTime(new Date(commit.author.time_seconds * 1000))}`
    : ''
  return `${commit.message} · ${commit.oid.slice(0, 12)}${date}`
}

export function SnapshotComparisonDialog({ onClose, uri }: Props) {
  const { t } = useTranslation('dataManagement')
  const source = useMemo(createDataManagementClient, [])
  const controller = useRef(new AbortController())
  const [commits, setCommits] = useState<SnapshotCommit[] | null>(null)
  const [base, setBase] = useState('')
  const [target, setTarget] = useState('')
  const [diff, setDiff] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const signal = controller.current.signal
    void listSnapshots(source, uri, signal, 500)
      .then((items) => {
        if (signal.aborted) return
        setCommits(items)
        setTarget(items[0]?.oid ?? '')
        setBase(items[1]?.oid ?? '')
      })
      .catch((cause: unknown) => {
        if (!signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => controller.current.abort()
  }, [source, uri])

  useEffect(() => {
    setDiff(null)
    setError('')
    if (!commits || !target || base === target) {
      setBusy(false)
      return
    }

    const request = new AbortController()
    setBusy(true)
    void diffSnapshot(source, uri, target, base || undefined, request.signal)
      .then((result) => {
        if (!request.signal.aborted) setDiff(result)
      })
      .catch((cause: unknown) => {
        if (!request.signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!request.signal.aborted) setBusy(false)
      })

    return () => request.abort()
  }, [base, commits, source, target, uri])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('diffComparison')}</DialogTitle>
          <DialogDescription className="min-w-0 break-all">
            {uri}
          </DialogDescription>
        </DialogHeader>

        {commits === null && !error ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : commits?.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSnapshots')}</p>
        ) : commits ? (
          <div className="min-w-0 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 space-y-1.5 text-sm font-medium">
                <span>{t('previousVersion')}</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-background px-3 py-2 font-normal"
                  onChange={(event) => {
                    setBase(event.target.value)
                    setDiff(null)
                  }}
                  value={base}
                >
                  <option value="">{t('emptyVersion')}</option>
                  {commits.map((commit) => (
                    <option key={commit.oid} value={commit.oid}>
                      {versionLabel(commit)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 space-y-1.5 text-sm font-medium">
                <span>{t('selectedVersion')}</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-background px-3 py-2 font-normal"
                  onChange={(event) => {
                    setTarget(event.target.value)
                    setDiff(null)
                  }}
                  value={target}
                >
                  {commits.map((commit) => (
                    <option key={commit.oid} value={commit.oid}>
                      {versionLabel(commit)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('comparingVersions')}
              </p>
            )}
            {base === target && (
              <p className="text-sm text-muted-foreground">
                {t('selectDifferentVersions')}
              </p>
            )}
            {diff !== null && <SnapshotDiffViewer diff={diff} />}
          </div>
        ) : null}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
