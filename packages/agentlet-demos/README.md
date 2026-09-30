# agentlet-demos

Agentlet demos that run on well-known sites, loaded by one bookmarklet through
[jsDelivr](https://www.jsdelivr.com/). Part of
[agentlet.io](https://agentlet.io), the site for the
[agentlet](https://github.com/agentlet/agentlet-core) framework.

Read only, no AI, no backend. Nothing leaves your browser.

## Use it

Drag the bookmarklet from <https://agentlet.io/try/known-sites/> to your
bookmarks bar, then click it on a supported page. It is a script tag that points
at:

```
https://cdn.jsdelivr.net/npm/agentlet-demos@1/dist/loader.js
```

| Site | Demos |
| --- | --- |
| Wikipedia (`*.wikipedia.org/wiki/...`) | Tables to spreadsheet, Date timeline |
| Hacker News (`news.ycombinator.com/item?id=...`) | Thread navigator (see the limits below) |

On any other page the bookmarklet opens a list of the supported sites.

## Limits

A site's Content Security Policy decides whether a bookmarklet can run. On
30 September 2026 Wikipedia allowed it. GitHub, MDN, Stack Overflow and
YouTube did not allow scripts added by a bookmarklet at all. Hacker News allowed
inline scripts but not scripts from jsDelivr, so its demo cannot start there
today. See the
[known-sites page](https://agentlet.io/try/known-sites/) for details.

## What is in the package

Only `dist/`:

- `loader.js`: the script the bookmarklet adds. It bakes in the exact version of
  this package and of `agentlet-core`, and loads everything else from those exact
  versions, never from the `@1` range. `agentlet-core` is not bundled here. It is
  loaded from jsDelivr.
- `registry.js`: the demo registry, in agentlet-core's script-injection format.
- `agentlets/<id>.js`: one bundle per demo, and the launcher.

## Build and publish

This package is built from the agentlet-site repository, not from this folder:

```bash
npm ci
npm run build:known-sites   # writes packages/agentlet-demos/dist/
```

Pushing a tag named `demos-v<version>` runs the `publish-demos` workflow, which
checks that the tag matches the `version` in this `package.json` and publishes
with provenance. See the
[documentation](https://agentlet.io/docs/guides/known-sites/) for how it works and
how to add a site.

## License

MIT, see `LICENSE`.
