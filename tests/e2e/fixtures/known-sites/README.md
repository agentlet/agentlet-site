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
