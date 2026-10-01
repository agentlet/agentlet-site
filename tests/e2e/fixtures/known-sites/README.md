# Known-sites fixtures

Used by tests/e2e/known-sites.spec.ts. The tests serve these files as if they
came from the real sites, through `page.route`, so no test touches the
network.

## wikipedia-article.html

A trimmed copy of the English Wikipedia article "Apollo 11" (infobox, the
first paragraphs of a few sections, four data tables, a short reference
list), wrapped in a minimal page skeleton. Images, scripts and most styles
were removed.

The article text is available under the Creative Commons
Attribution-ShareAlike 4.0 License (CC BY-SA 4.0). Source:
https://en.wikipedia.org/wiki/Apollo_11 (see the page history for the list of
authors). This trimmed copy is shared under the same license.

## wikipedia-csp.txt

The `Content-Security-Policy` response header that en.wikipedia.org sent when
this fixture was made (2026-09-30), fetched with
`curl -sI -A "Mozilla/5.0" https://en.wikipedia.org/wiki/Bookmarklet`.
The test applies it to the fixture page so the bookmarklet runs under the
same policy as on the real site.

## arxiv-csp.txt

The `Content-Security-Policy` header arxiv.org sent on 2026-09-30 for
`/list/cs.AI/recent`, `/abs/...` and `/search/...`, fetched with
`curl -s -A "Mozilla/5.0" -D - -o /dev/null <url>`. It is only
`frame-ancestors 'none'`, with no script-src, so scripts from jsDelivr load.

## arxiv-list.html, arxiv-search.html, arxiv-abs.html

Synthetic pages reproducing arXiv's markup for a listing (`dl#articles`,
`dt` with `a[title="Abstract"]`, `dd` with `.list-title`, `.list-authors`,
`.primary-subject`), a search result page (`li.arxiv-result`) and an abstract
page (`h1.title`, `.authors`, `citation_*` meta tags). The papers, titles and
authors are invented for the tests. No real paper data is included.

## w3c-wcag.html, w3c-csp.txt

A trimmed copy of "Web Content Accessibility Guidelines (WCAG) 2.2" from
https://www.w3.org/TR/WCAG22/: the conformance paragraph with its
`em.rfc2119` keywords, Guideline 1.1 with Success Criterion 1.1.1, Guideline
1.4 with Success Criteria 1.4.3 and 1.4.6, and the obsolete 4.1.1, wrapped in
a minimal page skeleton. Text and markup are copied unchanged from the
original, so the file stays under the W3C Document License
(https://www.w3.org/copyright/document-license/). Copyright W3C (MIT, ERCIM,
Keio, Beihang). The test uses it only as a sample.

`w3c-csp.txt` is the `Content-Security-Policy` header www.w3.org sent for that
page on 2026-10-01, fetched with
`curl -s -L -D - -o /dev/null -A "Mozilla/5.0" https://www.w3.org/TR/WCAG22/`.
It has no script-src.

## w3c-tr.html

A short invented document in the markup style of ReSpec (`section` with a
`bdi.secno` heading, `em.rfc2119` keywords, a `div.note`, a `pre.example`).
It stands in for any W3C Technical Report that is not WCAG. Nothing in it is
copied from a real specification. It is served with the same policy as above.

## rfc-editor-rfc9110.html

Five sections (2.2, 2.4, 5.4, 5.6.3 and 15.5.2) of RFC 9110, "HTTP
Semantics", from https://www.rfc-editor.org/rfc/rfc9110.html, copied
unchanged inside a minimal page skeleton. RFC 9110 is by R. Fielding, M.
Nottingham and J. Reschke (IETF, June 2022). RFCs may be reproduced freely
under the IETF Trust's Legal Provisions (TLP) 5, and the copyright notice of
the original is: Copyright (c) 2022 IETF Trust and the persons identified as
the document authors. All rights reserved.

rfc-editor.org sent no `Content-Security-Policy` header for that page on
2026-10-01 (same `curl` command as above), so the test serves it without one.

## eur-lex-gdpr.html, eur-lex-csp.txt

Articles 1, 5 and 99 of Regulation (EU) 2016/679 (the GDPR), from
https://eur-lex.europa.eu/eli/reg/2016/679/oj, with the OJ markup kept
(`div.eli-subdivision`, `p.oj-ti-art`, numbered paragraph `div`s). The legal
texts of the European Union are reusable under Commission Decision
2011/833/EU, with the source acknowledged: (c) European Union,
http://eur-lex.europa.eu/, 1998-2026.

`eur-lex-csp.txt` is the `Content-Security-Policy` header eur-lex.europa.eu
sent on 2026-10-01. A plain `curl` gets an Amazon WAF challenge there (status
202, no body), so the header was read from the real page in a Chromium
session, after the challenge. It is only `frame-ancestors`, with no
script-src.
