# Paper collage sources

The two documents behind the landing-page background (`/welcome`).

- `NewspaperFinancePage.dc.html` — The Basis Point, Section D Page 4. Every
  headline, column, agate row and notice is about cost basis.
- `Form1099B.dc.html` — a 1099-B whose box 1e reads NOT PROVIDED and whose
  acquired/sold dates are 353 days apart: sold twelve days short of long-term.
- `ScrapCollage.dc.html` — the original 59-scrap static arrangement, kept for
  reference. The app builds its own arrangement procedurally instead.

## Regenerating the images

The app consumes flattened images (`apps/app/public/paper-{news,1099}.jpg`)
rather than live DOM — 60+ copies of a full document is far too much markup
for a background. To regenerate after editing a source:

    python3 -m http.server 8899          # from this directory
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless --disable-gpu --force-device-scale-factor=2 \
      --window-size=850,1100 --virtual-time-budget=4000 \
      --screenshot=news.png http://127.0.0.1:8899/NewspaperFinancePage.dc.html
    sips -s format jpeg -s formatOptions 60 -Z 1400 news.png --out paper-news.jpg

Crop windows in `paper-collage.tsx` assume 1082×1400 output; update `SOURCES`
if that changes.
