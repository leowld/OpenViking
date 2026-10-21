import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  diffSnapshot,
  diffSnapshotWithCurrent,
  exportOvpack,
  importOvpack,
  listSnapshots,
  restoreSnapshot,
} from './data-management'
import type { RestorePlan } from './data-management'
import type { OvClientAdapter } from '#/lib/ov-client/types'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  tempUpload: vi.fn(),
  packImport: vi.fn(),
}))

vi.mock('#/lib/ov-client', () => ({
  createOvClient: vi.fn(),
  ovClient: { getOptions: vi.fn(), getConnection: vi.fn() },
  normalizeOvClientError: (error: unknown) => error,
  getOvResult: async (request: Promise<unknown>) => {
    const response = (await request) as { data?: { result?: unknown } }
    return response.data?.result
  },
  postResourcesTempUpload: mocks.tempUpload,
  postPackImport: mocks.packImport,
}))

const uri = 'viking://resources/docs/'
const signal = new AbortController().signal
const source = {
  client: { get: mocks.get, post: mocks.post },
} as unknown as OvClientAdapter

beforeEach(() => {
  vi.clearAllMocks()
})

describe('data management API', () => {
  it('scopes snapshot history to the selected path', async () => {
    mocks.get.mockResolvedValue({ data: { result: [{ oid: 'one' }] } })

    await expect(listSnapshots(source, uri, signal)).resolves.toEqual([
      { oid: 'one' },
    ])
    expect(mocks.get).toHaveBeenCalledWith({
      url: '/api/v1/snapshot/log',
      query: { branch: 'main', limit: 20, paths: [uri] },
      signal,
    })
  })

  it('loads more history for version selection and compares chosen refs', async () => {
    mocks.get.mockResolvedValue({ data: { result: [] } })
    await listSnapshots(source, uri, signal, 500)
    expect(mocks.get).toHaveBeenCalledWith({
      url: '/api/v1/snapshot/log',
      query: { branch: 'main', limit: 500, paths: [uri] },
      signal,
    })

    mocks.get.mockResolvedValue({ data: { result: { diff_text: 'diff' } } })
    await expect(
      diffSnapshot(source, uri, 'target-oid', 'base-oid', signal),
    ).resolves.toBe('diff')
    expect(mocks.get).toHaveBeenLastCalledWith({
      url: '/api/v1/snapshot/diff',
      query: { path: uri, to: 'target-oid', from: 'base-oid' },
      signal,
    })
  })

  it('compares a saved snapshot with the live file content', async () => {
    mocks.get
      .mockResolvedValueOnce({ data: new Blob(['old\n']) })
      .mockResolvedValueOnce({ data: { result: { content: 'new\n' } } })
    const diff = await diffSnapshotWithCurrent(
      source,
      'viking://resources/docs/a.md',
      'saved-oid',
      signal,
    )
    expect(diff).toContain('-old')
    expect(diff).toContain('+new')
    expect(mocks.get).toHaveBeenNthCalledWith(1, {
      url: '/api/v1/snapshot/show',
      query: {
        target_ref: 'saved-oid',
        path: 'viking://resources/docs/a.md',
        raw: true,
      },
      responseType: 'blob',
      signal,
    })
  })

  it('previews restore before writing and rejects a changed HEAD', async () => {
    const plan: RestorePlan = {
      result: 'dry_run',
      head: 'old-head',
      source: 'commit-1',
      diff: { to_write: [], to_delete: [], unchanged: [] },
    }
    mocks.post.mockResolvedValue({
      data: { result: { ...plan, head: 'new-head' } },
    })

    await expect(restoreSnapshot(source, uri, plan, signal)).rejects.toThrow()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledWith({
      url: '/api/v1/snapshot/restore',
      body: { project_dir: uri, source_commit: 'commit-1', dry_run: true },
      signal,
    })
  })

  it('applies only the selected subtree after a matching preview', async () => {
    const plan: RestorePlan = {
      result: 'dry_run',
      head: 'head-1',
      source: 'commit-1',
      diff: { to_write: [{ path: 'a.md' }], to_delete: [], unchanged: [] },
    }
    mocks.post
      .mockResolvedValueOnce({ data: { result: plan } })
      .mockResolvedValueOnce({ data: { result: { result: 'applied' } } })

    await restoreSnapshot(source, uri, plan, signal)
    expect(mocks.post).toHaveBeenLastCalledWith({
      url: '/api/v1/snapshot/restore',
      body: { project_dir: uri, source_commit: 'commit-1', dry_run: false },
      signal,
    })
  })

  it('downloads binary OVPack and imports through the same source client', async () => {
    const blob = new Blob(['pack'], { type: 'application/zip' })
    mocks.post.mockResolvedValue({ data: blob })
    await expect(exportOvpack(source, uri, signal)).resolves.toBe(blob)
    expect(mocks.post).toHaveBeenCalledWith({
      url: '/api/v1/pack/export',
      body: { uri, include_vectors: false },
      responseType: 'blob',
      signal,
    })

    const file = new File(['pack'], 'docs.ovpack')
    mocks.tempUpload.mockResolvedValue({
      data: { result: { temp_file_id: 'temp-1' } },
    })
    mocks.packImport.mockResolvedValue({
      data: { result: { uri: 'viking://resources/docs/' } },
    })
    await importOvpack(source, uri, file, 'fail', signal)
    expect(mocks.tempUpload).toHaveBeenCalledWith({
      client: source.client,
      body: { file },
      signal,
    })
    expect(mocks.packImport).toHaveBeenCalledWith({
      client: source.client,
      body: {
        temp_file_id: 'temp-1',
        parent: uri,
        on_conflict: 'fail',
        vector_mode: 'auto',
      },
      signal,
    })
  })
})
