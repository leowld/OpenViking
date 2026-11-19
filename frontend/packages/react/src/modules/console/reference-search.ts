import { OV_PATHS } from '../../client/paths.js';
import type { OvClient, OvRequestOptions } from '../../client/types.js';
import {
  mentionPattern,
  mentionSearchRows,
  MENTION_ROOT,
} from './mention-search.js';

export async function searchReferencePaths(
  client: OvClient,
  keyword: string,
  options: OvRequestOptions,
  skillOnly: boolean,
) {
  const search = (uri: string, pattern: string) =>
    client.request<{ matches: unknown }>({
      method: 'POST',
      path: OV_PATHS.searchGlob,
      body: { uri, pattern, node_limit: 100 },
      options,
    });
  if (!skillOnly)
    return (await search(MENTION_ROOT, mentionPattern(keyword))).matches;

  // Built-in Skills must not depend on the global index containing system files.
  const results = await Promise.all(
    [MENTION_ROOT, 'viking://system'].flatMap((uri) => {
      const query =
        uri === 'viking://system'
          ? keyword.replace(/^system(?:\/|$)/i, '')
          : keyword;
      const patterns = query
        ? [
            `${mentionPattern(query)}/**/SKILL.md`,
            ...('skill.md'.includes(query.toLowerCase())
              ? ['**/SKILL.md']
              : query.includes('/')
                ? [mentionPattern(query)]
                : []),
          ]
        : ['**/SKILL.md'];
      return patterns.map((pattern) => search(uri, pattern));
    }),
  );
  return [
    ...new Set(
      results.flatMap(({ matches }) =>
        mentionSearchRows(matches)
          .filter((row) => row.type === 'file' && row.name === 'SKILL.md')
          .map((row) => row.uri),
      ),
    ),
  ];
}
