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

## hacker-news-csp.txt

The `Content-Security-Policy` header news.ycombinator.com sent on 2026-09-30,
fetched with `curl -s -A "Mozilla/5.0" -D - -o /dev/null
"https://news.ycombinator.com/item?id=8863"` (a HEAD request is answered with
405 and no policy). It allows scripts only from the site itself, inline
scripts, Google reCAPTCHA and cdnjs, so the bookmarklet cannot load its script
from jsDelivr there. One test applies it to record that limit.

## hacker-news-item.html

A synthetic page that reproduces the markup of a Hacker News item page
(`table.fatitem`, `table.comment-tree`, `tr.athing.comtr` with a
`td.ind[indent]`, `.comhead .hnuser`, `a.togg`). The story, the user names
and the comments are invented for the tests. No real user content is
included. The block between the `LATER-START` and `LATER-END` comments is
removed by the test to simulate a first visit, and kept to simulate a
later one.
