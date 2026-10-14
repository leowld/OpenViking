import { expect, it } from 'vitest'
import type { ConnectionProfile } from '#/lib/connection/profiles'
import { visibleConnectionProfiles } from './connection-profiles'

const hosted = (
  id: string,
  accountId: string,
  userId = 'wld2',
): ConnectionProfile => ({
  id,
  name: id,
  connection: {
    serviceSelection: 'volcengine',
    baseUrl: 'https://api.vikingdb.cn-beijing.volces.com/openviking',
    apiKey: 'key',
    adminApiKey: '',
    accountId,
    userId,
  },
})

it('shows one connection per service, workspace and user, preferring the active record', () => {
  const profiles = [
    hosted('duplicate', 'study'),
    hosted('active', 'study'),
    hosted('other-user', 'study', 'alice'),
    hosted('other-space', 'production'),
  ]
  expect(
    visibleConnectionProfiles(profiles, 'active').map((profile) => profile.id),
  ).toEqual(['active', 'other-user', 'other-space'])
})
