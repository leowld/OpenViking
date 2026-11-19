import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import picomatch from 'picomatch';
import {
  card,
  click,
  input,
  mountHitl,
  settle,
} from './helpers/console-hitl.mjs';

const systemSkill = 'viking://system/compile/example-skills/llm-wiki/SKILL.md';
const personalSkill = 'viking://user/alice/skills/notes/SKILL.md';
const sourceDirectory = 'viking://resources/report-source';
const files = [systemSkill, personalSkill, `${sourceDirectory}/report.md`];
const nodes = new Map();
for (const uri of files) {
  const parts = uri.slice('viking://'.length).split('/');
  for (let index = 1; index <= parts.length; index++) {
    const path = `viking://${parts.slice(0, index).join('/')}`;
    nodes.set(path, { uri: path, isDir: index < parts.length });
  }
}
const prefixOf = (uri) => {
  const canonical = uri.replace(/^viking:\/\/~(?=\/|$)/, 'viking://user/alice');
  return canonical === 'viking://' ? canonical : `${canonical}/`;
};
const picker = () => document.querySelector('.ov-context-picker [role=dialog]');
const row = (uri) =>
  picker()?.querySelector(`[data-file-tree-row-id="${uri}"]`);
const button = (name) =>
  [...picker().querySelectorAll('button')].find(
    (node) => node.textContent === name,
  );

function fixtureFetch({ systemInGlobalIndex = true } = {}) {
  const calls = [];
  const fetch = async (input, options) => {
    const url = new URL(input);
    const body = options?.body ? JSON.parse(options.body) : undefined;
    calls.push({ path: url.pathname, body });
    let result = [];
    if (url.pathname === '/api/v1/fs/ls') {
      const prefix = prefixOf(url.searchParams.get('uri'));
      result = [...nodes.values()].filter(
        ({ uri }) =>
          uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'),
      );
    } else if (url.pathname === '/api/v1/search/glob') {
      const prefix = prefixOf(body.uri);
      const matches = [...nodes.values()]
        .filter(
          ({ uri }) =>
            uri.startsWith(prefix) &&
            (systemInGlobalIndex ||
              body.uri !== 'viking://' ||
              !uri.startsWith('viking://system/')) &&
            picomatch(body.pattern)(uri.slice(prefix.length)),
        )
        .slice(0, body.node_limit ?? Infinity)
        .map(({ uri, isDir }) => `${uri}${isDir ? '/' : ''}`);
      result = { matches, count: matches.length };
    }
    return Response.json({ status: 'ok', result });
  };
  return { fetch, calls };
}

async function open(view, type = 'skill') {
  await view.start();
  await click(
    view.container.querySelector(
      `.ov-viking-bot__compile-${type} [aria-haspopup="dialog"]`,
    ),
  );
  await settle();
}

async function search(value) {
  await input(picker().querySelector('input[type="search"]'), value);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  await settle();
}

test('a Skill directory name finds its system SKILL.md outside the global index', async () => {
  const api = fixtureFetch({ systemInGlobalIndex: false });
  const view = await mountHitl([card('compile_skill', 'Compile Skill')], {
    locale: 'en-US',
    fetch: api.fetch,
  });
  try {
    await open(view);
    await search('llm');
    assert.ok(
      api.calls.some(({ path }) => path === '/api/v1/search/glob'),
      'search must reach the filesystem search API',
    );
    assert.ok(
      row(systemSkill),
      'a matching Skill directory must expose its SKILL.md',
    );
    await search('viking://system/compile/example-skills/llm-wiki');
    assert.ok(
      row(systemSkill),
      'a full system directory URI must find the same Skill',
    );
    await click(row(systemSkill));
    assert.equal(row(systemSkill).getAttribute('aria-selected'), 'true');
    assert.equal(button('Confirm').disabled, false);
    await click(button('Confirm'));
    assert.equal(picker(), null);
    assert.ok(
      view.container
        .querySelector('.ov-viking-bot__compile-skill [aria-haspopup="dialog"]')
        .textContent.includes(systemSkill),
      'confirmation must retain the actual system Skill URI',
    );
  } finally {
    await view.unmount();
  }
});

test('Skill filenames remain searchable and an unknown name has no matches', async () => {
  const api = fixtureFetch();
  const view = await mountHitl([card('compile_skill', 'Compile Skill')], {
    locale: 'en-US',
    fetch: api.fetch,
  });
  try {
    await open(view);
    await search('SKILL.md');
    assert.ok(row(systemSkill));
    assert.ok(row(personalSkill));
    await search('no-such-skill-7398246614');
    assert.equal(picker().querySelectorAll('[data-kind="entry"]').length, 0);
    assert.equal(button('Confirm').disabled, true);
  } finally {
    await view.unmount();
  }
});

test('source selection still searches and confirms ordinary directories', async () => {
  const api = fixtureFetch();
  const view = await mountHitl([card('compile_source', 'Compile Source')], {
    locale: 'en-US',
    fetch: api.fetch,
  });
  try {
    await open(view, 'source');
    await search('report');
    assert.ok(row(sourceDirectory));
    assert.equal(row(systemSkill), null);
    await click(row(sourceDirectory));
    assert.equal(row(sourceDirectory).getAttribute('aria-selected'), 'true');
    assert.equal(button('Confirm').disabled, false);
    await click(button('Confirm'));
    assert.equal(picker(), null);
    assert.ok(
      view.container
        .querySelector('.ov-viking-bot__compile-source-tags')
        .textContent.includes(sourceDirectory),
    );
  } finally {
    await view.unmount();
  }
});
