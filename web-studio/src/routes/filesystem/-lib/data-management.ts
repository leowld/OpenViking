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
import { getContentRead } from '#/gen/ov-client/sdk.gen'
import { normalizeReadContent } from '#/routes/resources/-lib/normalize'
import { createPatch } from 'diff'

export interface SnapshotCommit {
  oid: string
  message: string
  author?: { name?: string; time_seconds?: number }
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
  limit = 20,
): Promise<SnapshotCommit[]> {
  try {
    return await getOvResult<SnapshotCommit[]>(
      source.client.get({
        url: '/api/v1/snapshot/log',
        query: { branch: 'main', limit, paths: [uri] },
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
  try {
    const result = await getOvResult<{ diff_text: string }>(
      source.client.get({
        url: '/api/v1/snapshot/diff',
        query: { path: uri, to, ...(from ? { from } : {}) },
        signal,
      }),
    )
    return result.diff_text
  } catch (error) {
    // Hosted connections expose snapshot/show but may not route snapshot/diff.
    if (normalizeOvClientError(error).statusCode !== 404) throw error
    const [older, newer] = await Promise.all([
      from ? readSnapshotFile(source, uri, from, signal) : Promise.resolve(''),
      readSnapshotFile(source, uri, to, signal),
    ])
    return createPatch(uri, older, newer)
  }
}

async function readSnapshotFile(
  source: OvClientAdapter,
  uri: string,
  ref: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await source.client.get({
    url: '/api/v1/snapshot/show',
    query: { target_ref: ref, path: uri, raw: true },
    responseType: 'blob',
    signal,
  })
  if (!(response.data instanceof Blob))
    throw new Error(i18n.t('dataManagement:invalidSnapshotContent'))
  return response.data.text()
}

export async function diffSnapshotWithCurrent(
  source: OvClientAdapter,
  uri: string,
  from: string,
  signal: AbortSignal,
): Promise<string> {
  const [savedContent, current] = await Promise.all([
    from ? readSnapshotFile(source, uri, from, signal) : Promise.resolve(''),
    getOvResult<unknown>(
      getContentRead({
        client: source.client,
        query: { uri, offset: 0, limit: -1, raw: true } as Parameters<
          typeof getContentRead
        >[0]['query'] & { raw: boolean },
        signal,
      }),
    ),
  ])
  return createPatch(uri, savedContent, normalizeReadContent(current))
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
