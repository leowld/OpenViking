import assert from 'node:assert/strict';
import test from 'node:test';
import {
  act,
  button,
  click,
  fixture,
  mount,
  ok,
  rootUri,
  tree,
  workflow,
} from './helpers/preview-native-dom.mjs';

const uri = `${rootUri}/notes.md`;
const original = '# Notes\nBefore\n';
const latest = '# Notes\nAfter\n';
const oldOid = 'a'.repeat(40);
const newOid = 'b'.repeat(40);

for (const rewrite of [false, true]) {
  test(`large comparisons keep bounded DOM (${rewrite ? 'rewritten file' : 'one changed line'})`, async () => {
    const before = Array.from(
      { length: 20_000 },
      (_, index) => `before ${index}\n`,
    );
    const after = before
      .map((line, index) =>
        rewrite || index === 10_000 ? `after ${index}\n` : line,
      )
      .join('');
    const source = before.join('');
    const fetch = fixture(uri, false, (call) => {
      if (call.path.endsWith('/snapshot/log'))
        return ok([
          {
            oid: newOid,
            message: 'Current',
            author: { time_seconds: 1794268900 },
          },
          {
            oid: oldOid,
            message: 'Previous',
            author: { time_seconds: 1794268800 },
          },
        ]);
      if (call.path.endsWith('/snapshot/show'))
        return Promise.resolve(
          new Response(call.query.target_ref === oldOid ? source : after),
        );
      if (call.path.endsWith('/content/read'))
        return ok(call.query.limit === '-1' ? after : '');
    });
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value) {
          copied.push(value);
        },
      },
    });
    const view = await mount(tree(fetch, uri));
    try {
      await click(
        view.container.querySelector('[aria-label="Version history"]'),
      );
      await click(workflow().querySelectorAll('aside li button')[1]);
      await click(workflow().querySelector('[role="switch"]'));
      const list = workflow().querySelector('.ov-file-history__diff');
      assert.ok(list.querySelectorAll('li').length < 50);
      assert.match(list.textContent, rewrite ? /before 0/ : /before 10000/);
      if (!rewrite) {
        assert.match(list.textContent, /unchanged lines/);
        await click(button('Show unchanged lines', workflow()));
        assert.ok(list.querySelectorAll('li').length < 50);
      }
      await act(async () => {
        list.scrollTop = (rewrite ? 40_000 : 20_001) * 24;
        list.dispatchEvent(new window.Event('scroll', { bubbles: true }));
      });
      assert.ok(list.querySelectorAll('li').length < 50);
      assert.match(list.textContent, rewrite ? /after 19999/ : /before 19999/);
      await click(button('Copy source', workflow()));
      assert.deepEqual(copied, [source]);
      assert.equal(fetch.countOf('/api/v1/content/write'), 0);
    } finally {
      delete navigator.clipboard;
      await view.unmount();
    }
  });
}

test('history previews, compares, and copies a revision without writing', async () => {
  const fetch = fixture(uri, false, (call) => {
    if (call.path.endsWith('/snapshot/log'))
      return ok([
        {
          oid: newOid,
          message: 'Latest note',
          author: { time_seconds: 1794268900 },
        },
        {
          oid: oldOid,
          message: 'Earlier note',
          author: { time_seconds: 1794268800 },
        },
      ]);
    if (call.path.endsWith('/snapshot/show'))
      return Promise.resolve(
        new Response(call.query.target_ref === oldOid ? original : latest),
      );
    if (call.path.endsWith('/content/read'))
      return ok(call.query.limit === '-1' ? latest : '');
  });
  const writes = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      async writeText(value) {
        writes.push(value);
      },
    },
  });
  const view = await mount(tree(fetch, uri));
  try {
    await click(view.container.querySelector('[aria-label="Version history"]'));
    const versions = workflow().querySelectorAll('aside li button');
    assert.equal(versions.length, 2);
    assert.match(versions[1].textContent, /Earlier note/);
    await click(versions[1]);
    assert.equal(
      fetch.calls.some(
        (call) =>
          call.path.endsWith('/content/read') && call.query.limit === '-1',
      ),
      false,
    );
    await click(workflow().querySelector('[role="switch"]'));
    assert.match(
      workflow().querySelector('li[data-change="removed"]').textContent,
      /Before/,
    );
    assert.match(
      workflow().querySelector('li[data-change="added"]').textContent,
      /After/,
    );
    assert.equal(fetch.countOf('/api/v1/snapshot/diff'), 0);
    await click(button('Copy source', workflow()));
    assert.deepEqual(writes, [original]);
    assert.equal(button('Restore this version', workflow()), undefined);
    assert.equal(fetch.countOf('/api/v1/snapshot/restore'), 0);
    assert.equal(fetch.countOf('/api/v1/content/write'), 0);
  } finally {
    delete navigator.clipboard;
    await view.unmount();
  }
});
