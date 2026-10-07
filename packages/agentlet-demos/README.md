# @agentlet/demos

Agentlet demos that run on well-known sites, loaded by one bookmarklet through
[jsDelivr](https://www.jsdelivr.com/). Part of
[agentlet.io](https://agentlet.io), the site for the
[agentlet](https://github.com/agentlet/agentlet-core) framework.

Read only, no AI, no backend. Nothing leaves your browser, except one demo's lookup of public facts on Wikidata (see the table).

## Use it

Drag the bookmarklet from <https://agentlet.io/try/known-sites/> to your
bookmarks bar, then click it on a supported page. It is a script tag that points
at:

```
https://cdn.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js?d=YYYYMMDD
```

The bookmarklet fills in `d` with the current UTC date when it is clicked, so a
browser fetches a fresh loader at most once a day. jsDelivr refreshes the `@1`
range within 12 hours, or right away with its purge API. A new release then
reaches a browser on its first click of the next day.

| Site | Demos |
| --- | --- |
| Wikipedia (`*.wikipedia.org/wiki/...`) | Tables to spreadsheet, Date timeline, Copy a company as a record |
| Wikidata (`www.wikidata.org/wiki/Q...`) | Copy a company as a record |
| arXiv (`arxiv.org/list/...`, `/search/...`, `/abs/...`) | Papers to spreadsheet, and a citation line on abstract pages |
| W3C Technical Reports (`www.w3.org/TR/...`), RFC Editor (`www.rfc-editor.org/rfc/rfc<number>.html`), EUR-Lex (`eur-lex.europa.eu/eli/...`, `/legal-content/...`) | Spec to checklist: requirements with a status and a note, exported to Excel |

"Copy a company as a record" builds an `organization` record with `window.agentlet.records` (agentlet-core 2.3.0) from a company's infobox or Wikidata item, and copies it to the clipboard. A page that runs agentlet, such as the supplier form on <https://agentlet.io>, pastes it into a form. It asks the Wikidata API for the SIREN (on Wikipedia) or the country of the headquarters (on Wikidata). If that request fails, the record is built without the field.

On any other page the bookmarklet opens a list of the supported sites.

## Limits

A site's Content Security Policy decides whether a bookmarklet can run. On
30 September 2026 Wikipedia and arXiv allowed it, on 1 October 2026 so did W3C, RFC Editor and EUR-Lex, and on 4 October 2026 Wikidata. GitHub, MDN, Stack Overflow and
YouTube did not allow scripts added by a bookmarklet at all, and Hacker News
allowed inline scripts but not scripts from jsDelivr. See the
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
checks that the tag matches the `version` in this `package.json` and stages it
on npm through trusted publishing, with npm provenance. A maintainer approves
each staged version with 2FA before it becomes public. See the
[documentation](https://agentlet.io/docs/guides/known-sites/) for how it works and
how to add a site.

## License

MIT, see `LICENSE`.
