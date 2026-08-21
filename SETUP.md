# DRAPER Review — setup

Static files. No build step. Open `index.html` and it runs.

## Two modes

| URL | Who | Can do |
|---|---|---|
| `index.html` | anyone on the link | read frames, write feedback, write the idea copy |
| `index.html?studio=draper` | us | the same, plus the feedback summary |

Change the word `draper` in `config.js` → `studioKey`.

## Shared feedback

Out of the box the board shares everything between everyone on the link —
feedback, the idea copy, and who wrote what — using a single Netlify
function backed by Netlify Blobs. There is no account to create, no keys to
paste, and nothing to configure. Deploy the folder to Netlify and it works.

The moving parts:

| file | what it does |
|---|---|
| `netlify/functions/entries.mjs` | reads and writes entries, one blob per entry |
| `netlify.toml` | points Netlify at the function; no build step |
| `package.json` | the one dependency, `@netlify/blobs` |

Opened straight off disk, or served from anything that is not Netlify, the
first read gets a 404, the board quietly drops to this-device-only storage
and everything still works. The save toast tells you which you are in:
"saved — the team can see it" or "saved on this device only".

### Moving to Supabase later

The Supabase path is still in `store.js` and takes precedence the moment it
is configured — useful when this moves to its own domain. Create a project,
run this in the SQL editor:

```sql
create table entries (
  id          bigint generated always as identity primary key,
  project_id  text not null,
  target_id   text not null,
  kind        text not null check (kind in ('feedback','idea')),
  body        text,
  updated_at  timestamptz default now(),
  unique (project_id, target_id, kind)
);

alter table entries enable row level security;

-- the board is unlisted; anyone with the link may read and write
create policy "read"  on entries for select using (true);
create policy "write" on entries for insert with check (true);
create policy "edit"  on entries for update using (true);
```

Then paste the Project URL and the anon key into `config.js`. Nothing else
changes.

### Who can do what

Anyone with the link can read every frame, write feedback, and write or
rewrite the idea copy — the board is a working surface for the whole team,
not a one-way delivery. Nothing is attributed: entries carry no names, only
a timestamp. `?studio=draper` adds only the feedback summary view.

The link is the security. Anyone who has it can read and write, so put a
site password on the Netlify deploy if that matters.

## How saving behaves

- Feedback saves as you type and confirms with a toast when you leave the field.
- The idea is different: it is only written when you press Save, so a rewrite
  in progress is never half-published. Clicking away leaves the editor open.
- Writes go to memory first so the UI never stalls — including mid-dictation.
- Every 15s the board picks up other people's changes, but never while a field is focused, so it cannot overwrite someone mid-sentence.
- If the network drops it keeps working and pushes the backlog when it returns.

## Images

Each project needs two copies of every frame:

- `images/<name>.jpg` — **the untouched export**, shown when a frame is opened
- `images/thumbs/<name>.jpg` — long edge 700px, quality 80, shown in the grid

Do not recompress the file in `images/` — it is what the client actually
studies, at roughly 1.5× its own pixels on a Retina screen, so every artifact
shows. Copy the export in as-is and let the thumbnail carry the savings; the
full file is only fetched when a frame is opened. Generate thumbs *from the
originals*, never from an already-compressed copy.

The grid is the whole payload, so this matters: for The Boulders it takes the
browsing load from 173 MB to 7.6 MB. Generate them with:

```bash
cd projects/<client>/images && mkdir -p thumbs
python3 - <<'PY'
import glob, os
from PIL import Image
for f in sorted(glob.glob("*.jpg")):
    with Image.open(f) as im:
        im = im.convert("RGB"); im.thumbnail((700, 700), Image.LANCZOS)
        im.save(os.path.join("thumbs", f), "JPEG", quality=80, optimize=True, progressive=True)
PY
```

## Switching brands

`config.js` → `projects` lists every board in `projects/`. The first entry is
what loads by default. In studio mode the client name at the top of the nav
becomes a picker; choosing another brand reloads on `?project=<folder>` and
keeps the studio key. Clients see the same box with no picker.

## Motion frames

A frame can be a video instead of a still. Videos live next to the images:

- `videos/<id>.webm` — the original, shown when the frame is opened
- `videos/thumbs/<id>.webm` — 700px re-encode, what the grid plays
- `videos/posters/<id>.jpg` — first frame, held until playback starts

The grid re-encode matters as much as the image thumbnails do: for The
Boulders it takes the motion payload from 83 MB to 2 MB. Generate both with:

```bash
cd projects/<client>/videos && mkdir -p thumbs posters
for f in *.webm; do b="${f%.webm}"
  ffmpeg -y -v error -i "$f" \
    -vf "scale='if(gt(iw,ih),700,-2)':'if(gt(iw,ih),-2,700)'" \
    -c:v libvpx-vp9 -crf 38 -b:v 0 -deadline good -cpu-used 4 -row-mt 1 -an \
    "thumbs/$b.webm"
  ffmpeg -y -v error -i "$f" -frames:v 1 \
    -vf "scale='if(gt(iw,ih),700,-2)':'if(gt(iw,ih),-2,700)'" -q:v 5 "posters/$b.jpg"
done
```

In the manifest a motion frame carries `video` and `poster` instead of
`image`, and its own `w`/`h` — a video is often cropped differently from its
still, so do not copy the still's dimensions.

Grid videos are muted, looped and play only while on screen; a
`prefers-reduced-motion` setting leaves the poster in place.

### Frames that exist as both

Where a frame has a motion *and* a still version, both get their own card in
the grid. Point them at each other and the open view gains a Video / Still
switch, so either card can show both:

```js
{ id: "web-preloader-1",        image: "web-preloader-1.jpg", motion: "web-preloader-1-motion", … }
{ id: "web-preloader-1-motion", video: "web-preloader-1-motion.webm",
  poster: "web-preloader-1-motion.jpg", still: "web-preloader-1", … }
```

Feedback stays with the card that was opened — switching the stage changes
what you are looking at, not what you are commenting on. So a frame with both
versions can carry separate notes on the motion and on the still.

## New client

1. Copy `projects/_example` to `projects/<client>/`
2. Drop the exported frames into `projects/<client>/images/`
3. Name them `Lane - Group - N.jpg` and the manifest can be generated from the filenames
4. Add it to `projects` in `config.js` (put it first to make it the default)
5. Set a fresh `project.id` — that is what keeps each client's feedback separate

## Deploy

Drag the folder onto Netlify or Vercel. Add a site password there if the work
should not be publicly linkable — the `studio` key gates the UI, not the files.
