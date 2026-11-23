# Video tutorial page (maintainers)

`index.html` + `tutorial.css` + `tutorial.js` form a static, dependency-free player for the walkthrough chapters.
Published with GitHub Pages at <https://iam-udit.github.io/aem-orbit/tutorial/> (Settings, Pages, Source: branch `main`, folder `/docs`).

- **Videos are not in git.** They are assets of the release `tutorial-videos` (`https://github.com/iam-udit/aem-orbit/releases/tag/tutorial-videos`);
  `tutorial.js` reads `https://github.com/iam-udit/aem-orbit/releases/download/tutorial-videos/<id>.mp4`.
- **Posters** (`posters/<id>.jpg`, 800 px wide) are in git. Make one with
  `ffmpeg -ss 6 -i video/out/<id>.mp4 -frames:v 1 -vf scale=800:-1 -q:v 4 docs/tutorial/posters/<id>.jpg`.
- **Add or replace a chapter:** record it (`video/HANDOFF.md`), upload `video/out/<id>.mp4` to the release (same file name replaces it),
  add the poster, and add/adjust the entry in `CHAPTERS` in `tutorial.js` (title, duration in seconds, description, topics).
- **Video Naming & Versioning Lifecycle:**
  - Release assets use canonical filenames (`<id>.mp4`, e.g. `00-intro.mp4`, `01-orb.mp4`, ..., `11-shortcuts.mp4`).
  - This ensures release asset URLs and `tutorial.js` metadata remain permanent without breaking bookmarks or requiring code changes on every re-record.
  - When recording a new iteration in the future: record to `<id>-v<N>.mp4`, verify it, archive the previous release file with its version tag (e.g. `<id>-v2.mp4`), and promote the new approved file to `<id>.mp4` for release upload.
- **Preview locally:** `mkdir -p docs/tutorial/videos && ln -sf "$PWD"/video/out/*.mp4 docs/tutorial/videos/ && python3 -m http.server 8991 --bind 127.0.0.1 --directory docs`
  then open <http://127.0.0.1:8991/tutorial/>. On localhost / `file://` the page reads `videos/` instead of the release (that folder is git-ignored).
- The page has a strict Content-Security-Policy (no inline scripts or styles, media only from itself and GitHub).
