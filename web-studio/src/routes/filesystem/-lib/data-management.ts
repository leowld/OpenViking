import {
  createOvClient,
  getOvResult,
  normalizeOvClientError,
  ovClient,
  postPackImport,
  postResourcesTempUpload,
} from '#/lib/ov-client'
import type { OvClientAdapter } from '#/lib/ov-client/types'
import i18n from '#/i18n/core'

export interface SnapshotCommit {
  oid: string
  message: string
  author?: { name?: string; time_seconds?: number }
}

export interface RestorePlan {
  result: 'dry_run'
  head: string
  source: string
  diff: {
    to_write: Array<{ path: string }>
    to_delete: string[]
    unchanged: string[]
  }
}

export interface RestoreResult {
  result: 'applied' | 'noop'
  new_commit_oid?: string
  task_id?: string
}

export function createDataManagementClient(): OvClientAdapter {
  return createOvClient({
    ...ovClient.getOptions(),
    apiKeyStorageKey: '',
    connection: ovClient.getConnection(),
  })
}

export async function listSnapshots(
  source: OvClientAdapter,
  uri: string,
  signal: AbortSignal,
): Promise<SnapshotCommit[]> {
  try {
    return await getOvResult<SnapshotCommit[]>(
      source.client.get({
        url: '/api/v1/snapshot/log',
        query: { branch: 'main', limit: 20, paths: [uri] },
        signal,
      }),
    )
  } catch (error) {
    if (normalizeOvClientError(error).statusCode === 404) return []
    throw error
  }
}

export async function commitSnapshot(
  source: OvClientAdapter,
  uri: string,
  message: string,
  signal: AbortSignal,
): Promise<{ result: string; commit_oid: string }> {
  return getOvResult(
    source.client.post({
      url: '/api/v1/snapshot/commit',
      body: { message, paths: [uri], branch: 'main' },
      signal,
    }),
  )
}

export async function diffSnapshot(
  source: OvClientAdapter,
  uri: string,
  to: string,
  from: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const result = await getOvResult<{ diff_text: string }>(
    source.client.get({
      url: '/api/v1/snapshot/diff',
      query: { path: uri, to, ...(from ? { from } : {}) },
      signal,
    }),
  )
  return result.diff_text
}

export async function previewRestore(
  source: OvClientAdapter,
  uri: string,
  commit: string,
  signal: AbortSignal,
): Promise<RestorePlan> {
  return getOvResult(
    source.client.post({
      url: '/api/v1/snapshot/restore',
      body: { project_dir: uri, source_commit: commit, dry_run: true },
      signal,
    }),
  )
}

export async function restoreSnapshot(
  source: OvClientAdapter,
  uri: string,
  plan: RestorePlan,
  signal: AbortSignal,
): Promise<RestoreResult> {
  // Recheck HEAD so a later write cannot silently invalidate the preview.
  const current = await previewRestore(source, uri, plan.source, signal)
  if (current.head !== plan.head)
    throw new Error(i18n.t('dataManagement:headChanged'))
  return getOvResult(
    source.client.post({
      url: '/api/v1/snapshot/restore',
      body: { project_dir: uri, source_commit: plan.source, dry_run: false },
      signal,
    }),
  )
}

export async function exportOvpack(
  source: OvClientAdapter,
  uri: string,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await source.client.post({
    url: '/api/v1/pack/export',
    body: { uri, include_vectors: false },
    responseType: 'blob',
    signal,
  })
  const data: unknown = response.data
  if (!(data instanceof Blob) || data.size === 0) {
    throw new Error(i18n.t('dataManagement:invalidExport'))
  }
  return data
}

export async function importOvpack(
  source: OvClientAdapter,
  parent: string,
  file: File,
  onConflict: 'fail' | 'skip' | 'overwrite',
  signal: AbortSignal,
): Promise<{ uri: string }> {
  const upload = await getOvResult<{ temp_file_id: string }>(
    postResourcesTempUpload({
      client: source.client,
      body: { file },
      signal,
    }),
  )
  if (!upload.temp_file_id)
    throw new Error(i18n.t('dataManagement:missingUploadId'))
  return getOvResult(
    postPackImport({
      client: source.client,
      body: {
        temp_file_id: upload.temp_file_id,
        parent,
        on_conflict: onConflict,
        vector_mode: 'auto',
      },
      signal,
    }),
  )
}
