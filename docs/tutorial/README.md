# Video tutorial page (maintainers)

`index.html` + `tutorial.css` + `tutorial.js` form a static, dependency-free player for the walkthrough chapters.
Published with GitHub Pages at <https://iam-udit.github.io/aem-orbit/tutorial/> (Settings, Pages, Source: branch `main`, folder `/docs`).

- **Videos are not in git.** They are assets of the release `tutorial-videos` (`https://github.com/iam-udit/aem-orbit/releases/tag/tutorial-videos`);
  `tutorial.js` reads `https://github.com/iam-udit/aem-orbit/releases/download/tutorial-videos/<id>-v4.mp4`.
- **Posters** (`posters/<id>.jpg`, 800 px wide) are in git. Make one with
  `ffmpeg -ss 6 -i video/out/<id>-v4.mp4 -frames:v 1 -vf scale=800:-1 -q:v 4 docs/tutorial/posters/<id>.jpg`.
- **Add or replace a chapter:** record it (`video/HANDOFF.md`), upload `video/out/<id>-v4.mp4` to the release,
  add the poster, and add/adjust the entry in `CHAPTERS` in `tutorial.js` (title, duration in seconds, description, topics).
- **Video Release Assets:**
  - Release assets use the latest versioned filenames (`<id>-v4.mp4`, e.g. `00-intro-v4.mp4`, `01-orb-v4.mp4`, ..., `11-shortcuts-v4.mp4`), plus `orbit-for-aem-walkthrough.mp4`, `orbit-for-aem-walkthrough-v4.mp4`, `orbit-for-aem-highlights.mp4`, `orbit-for-aem-highlights-v4.mp4`, and `orbit-for-aem-teaser-1min.mp4` (legacy `-v3.mp4` assets are preserved intact).
- **Preview locally:** `mkdir -p docs/tutorial/videos && ln -sf "$PWD"/video/out/*.mp4 docs/tutorial/videos/ && python3 -m http.server 8991 --bind 127.0.0.1 --directory docs`
  then open <http://127.0.0.1:8991/tutorial/>. On localhost / `file://` the page reads `videos/` instead of the release (that folder is git-ignored).
- **Demo Content:** Tutorial chapters demonstrate workflows against Adobe's open-source [AEM Guides WKND](https://github.com/adobe/aem-guides-wknd) reference project (Apache License 2.0).
- The page has a strict Content-Security-Policy (no inline scripts or styles, media only from itself and GitHub).
