import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement as h } from 'react';
import { FileBrowser } from '@openviking/react/modules/file-browser';
import { OpenVikingProvider } from '@openviking/react/client';
import { mount, ok, recordingFetch, settle } from './helpers/module-dom.mjs';

HTMLElement.prototype.scrollIntoView = () => {};
globalThis.CSS ??= { escape: (value) => value };

test('failed result navigation preserves the search and retries the same resource', async () => {
  const root = 'viking://~/resources';
  const alias = `${root}/notes.png`;
  const canonical = 'viking://user/default/resources/notes.png';
  let fail = true;
  const fetch = recordingFetch((call) => {
    if (call.path === '/api/v1/search/find')
      return ok({ resources: [{ uri: canonical }] });
    if (call.path === '/api/v1/fs/ls') return ok([{ uri: alias }]);
    if (call.path === '/api/v1/fs/stat' && call.uri === 'viking://~')
      return fail
        ? Response.json(
            {
              status: 'error',
              error: {
                code: 'PERMISSION_DENIED',
                message: 'Alias lookup failed',
              },
            },
            { status: 403 },
          )
        : ok({ uri: 'viking://user/default', isDir: true });
    if (call.path === '/api/v1/fs/stat')
      return ok({ uri: call.uri, isDir: false });
    return ok('');
  });
  const view = await mount(
    h(
      OpenVikingProvider,
      { fetch },
      h(FileBrowser, { rootUri: root, dashboardKinds: [] }),
    ),
  );
  const modal = () => document.querySelector('.ov-file-browser-search');
  try {
    await act(async () =>
      view.container.querySelector('.ov-file-browser__search-trigger').click(),
    );
    const input = modal().querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set.call(input, 'notes');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    await act(async () =>
      input.dispatchEvent(
        new window.KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await settle();
    assert.match(
      modal().querySelector('[role="alert"]').textContent,
      /Alias lookup failed/,
    );
    assert.equal(input.value, 'notes');
    fail = false;
    const retry = [...modal().querySelectorAll('button')].find(
      (node) => node.textContent === 'Retry',
    );
    await act(async () => retry.click());
    await settle();
    await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
    assert.equal(modal(), null);
    assert.equal(
      view.container
        .querySelector('[aria-selected="true"]')
        .getAttribute('data-file-tree-row-id'),
      alias,
    );
    assert.equal(
      fetch.calls.filter((call) => call.uri === 'viking://~').length,
      2,
    );
    assert.equal(fetch.countOf('/api/v1/search/find'), 1);
  } finally {
    await view.unmount();
  }
});
