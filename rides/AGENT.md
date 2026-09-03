# TASK: Build a Desktop Ride Data Curator for El Nino historical rides

## Goal

Build a completely separate local-only desktop web app whose only purpose is to curate and clean historical Garmin ride data before we later import selected rides into the real El Nino application.

This is NOT part of the production El Nino app.

Do not connect it to:
- elnino-server
- production database
- production APIs
- authentication
- deployment

For now this tool must work only on PC/Desktop and only with local files.

---

# Existing data structure

We already have historical Garmin ride data.

## CSV master file

Main ride list:

```text
All-new.csv

This CSV already contains ride metadata and now also has a gpx column for matched rides.

A backup also exists:

All-new.before-gpx-match.csv

Do not modify the backup.

GPX files

Historical GPX files are stored here:

elnino-client/rides

There are currently about 978 GPX files.

Typical filename:

10030403971.gpx

The gpx column in All-new.csv points to the relevant GPX filename when a ride has a matched track.

The GPX files contain the real route points and may contain:

latitude
longitude
elevation
timestamp
heart rate
cadence
temperature

Do not delete or modify original GPX files.

What to build

Create a new standalone app, for example:

elnino-ride-curator/

Preferred stack:

React
Vite
TypeScript
Leaflet
PapaParse
localStorage

No backend.

No database.

No login.

No server API.

Main UI

The app is Desktop/PC only.

Use a wide desktop layout.

At the top:

El Nino Ride Curator
[All] [Keep] [Deleted] [Missing Name]
                              743 / 761
                              [? Help]

Show ride cards in a scrollable grid.

Preferred:

2 or 3 columns depending on screen width

Each card should show a real map using the GPX route.

Example card:

-------------------------------------------------
|                 MAP                           |
|                                               |
-------------------------------------------------

Date:        2017-05-12
Distance:    82.4 km
Elevation:   1,340 m
Duration:    03:21
Avg speed:   24.6 km/h

Name:
[ Jerusalem Hills Ride                    ]

Region:
[ Jerusalem                               ]

Type:
[ Road ▼ ]

Notes:
[ optional notes                          ]

                         🗑
Important workflow

The tool is for reviewing hundreds of rides quickly.

For each ride I must be able to:

visually inspect the route on the map
see its metadata
decide if the ride is worth importing
give it a proper ride name
assign a region
optionally assign a ride type
optionally add notes
mark the ride as "do not upload"
Delete behavior

The trash icon must NOT delete the CSV row.

The trash icon must NOT delete the GPX file.

It should only mark the ride as excluded from future import.

Add/use a field such as:

upload

Values:

true
false

When pressing trash:

upload = false

Do it immediately.

No confirmation popup.

The card may visually become faded or move out of the active view.

It must be possible to restore it later from the Deleted filter.

Editable fields

Add/edit these curation fields:

name
region
type
notes
upload

Possible type values:

road
mtb
gravel
other

Do not overcomplicate the classification.

Metadata shown on card

Show at least:

date
start time
distance
elevation gain
duration
average speed

If available, also show useful secondary fields such as:

heart rate
calories
moving time

Do not clutter the card with too much Garmin data.

Metadata source

Use the existing CSV metadata first.

For rides with GPX files, also parse the GPX.

Validate or derive when possible:

track start/end time
track distance
elevation gain
duration

If GPX-derived metadata and CSV metadata differ significantly, show a small warning.

Example:

⚠ Distance differs: CSV 84.1 km / GPX 82.7 km

Do not automatically overwrite CSV metadata without an explicit reason.

Map

Use Leaflet with OpenStreetMap.

The route must be drawn from the GPX points.

Maps must be efficient.

There may be hundreds of rides, so do NOT create hundreds of active Leaflet instances at once.

Use viewport-based mounting:

IntersectionObserver

Only create the Leaflet map when a card is near/in the viewport.

Destroy the map when the card is far outside the viewport.

Avoid the previous map lifecycle bug:

requestAnimationFrame(...)

Any scheduled animation frame must be cancelled on unmount.

Persistence

No backend.

All edits must be automatically persisted locally.

Use:

localStorage

Every edit should save immediately:

name change
region change
type change
notes change
upload flag

If the browser closes and reopens, work must still be there.

Use a versioned storage key, for example:

elnino-ride-curator-v1
Export

Add a clear button:

Export Curated CSV

The exported file should be something like:

All-new-curated.csv

It must contain the original ride metadata plus the new curation fields.

At minimum:

ride_id
gpx
date
distance
elevation
duration
avg_speed
name
region
type
notes
upload

Preserve all existing original CSV columns too.

Do not discard source data.

Filters

Add top filters:

All
Keep
Deleted
Missing Name

Definitions:

All
= all rides

Keep
= upload = true

Deleted
= upload = false

Missing Name
= upload = true AND name is empty

Optional useful filters:

Missing Region
Road
MTB
Gravel

Do not add complex search/filter logic before the core workflow works.

Keyboard shortcuts

This tool is Desktop/PC only, so keyboard navigation is important.

Implement:

N
focus ride Name

R
focus Region

T
focus Type

Delete
mark current ride upload=false

Enter
save current edit and move/focus next ride

Left Arrow
previous ride

Right Arrow
next ride

Esc
leave current edit / close popup

Ctrl+S
force local save

Do not let keyboard shortcuts fire while the user is actively typing inside a text input unless the shortcut is specifically relevant.

Help

At the top-right add:

? Help

Clicking it opens a small modal/popup:

Keyboard shortcuts

N         Edit ride name
R         Edit region
T         Change ride type
Delete    Mark ride as do not upload
Enter     Save and go to next ride
←         Previous ride
→         Next ride
Esc       Close / cancel
Ctrl+S    Save locally

Keep Help minimal.

Selection / active card

There should be one "active ride" while navigating by keyboard.

Visually mark the active card with a subtle outline.

Clicking a card makes it active.

Arrow keys move active selection.

When moving selection, scroll the active card into view.

Performance

The dataset may contain around 1,000 rides.

Avoid:

rendering all Leaflet maps simultaneously
reparsing all GPX files on every render
unnecessary large state copies
loading full GPX data repeatedly

Suggested design:

CSV metadata
    ↓
ride list
    ↓
lazy GPX load per visible card
    ↓
cache parsed GPX result

If practical, cache parsed GPX metadata in memory.

Data safety

Never modify:

All-new.before-gpx-match.csv
original Garmin export
original ZIP files
original GPX files

The curation app should only:

read source CSV
read GPX
store local edits in localStorage
export a new curated CSV
Suggested structure
elnino-ride-curator/
  src/
    app/
      App.tsx

    components/
      RideCard.tsx
      RideMap.tsx
      Filters.tsx
      HelpDialog.tsx
      Toolbar.tsx

    hooks/
      useRideData.ts
      useLocalCuration.ts
      useKeyboardNavigation.ts
      useLazyMap.ts

    lib/
      csv.ts
      gpx.ts
      rideMetrics.ts
      storage.ts

    types/
      ride.ts

  public/
    data/
      All-new.csv

    rides/
      *.gpx

If linking directly to the existing files is easier during local development, use that, but do not duplicate hundreds of GPX files unnecessarily unless required by Vite/static serving.

Data model suggestion

Use something similar to:

type Ride = {
  id: string;
  gpx?: string;

  date?: string;
  startTime?: string;

  distanceKm?: number;
  elevationGainM?: number;
  durationSec?: number;
  avgSpeedKmh?: number;

  name?: string;
  region?: string;

  type?: 'road' | 'mtb' | 'gravel' | 'other';

  notes?: string;

  upload: boolean;

  original: Record<string, string>;
};

Keep all original CSV data under original or equivalent so nothing is lost.

UX priority

This is not a customer-facing application.

Optimize for:

speed of reviewing rides
fast keyboard editing
large maps
minimal clicks
safe data handling

Do not spend time on fancy branding, animations or mobile responsiveness.

Use a clean utilitarian UI.

Important behavior

When editing:

Name
Region
Type
Notes

save automatically on blur/change.

I should not need to press a Save button for every ride.

The workflow should feel like:

look at map
↓
decide
↓
type name
↓
type region
↓
next ride

or:

look at map
↓
Delete
↓
next ride
First implementation milestone

Build only:

CSV loading
GPX loading
map rendering
card metadata
name/region/type/notes editing
upload true/false
localStorage persistence
filters
keyboard shortcuts
Help popup
curated CSV export

Do NOT build import into the real El Nino app yet.

That will be a separate task after the data has been reviewed.

Before coding

First inspect the actual files and report:

exact path of All-new.csv
exact existing columns in the CSV
exact path of the GPX folder
number of GPX files
number of CSV rows with a GPX reference
whether the GPX files are accessible directly from Vite or need a copy/symlink/static mapping
which CSV columns already contain:
date
distance
elevation
duration
average speed
ride name
ride id / gpx reference

Then propose the smallest clean implementation.

After that, implement it.

Do not change the existing El Nino production client unless absolutely necessary.
Prefer a completely separate project/folder.


הייתי גם מוסיף לו משפט אחד מחוץ לפרומפט:

```text
Do not overengineer this. This is a temporary desktop data-curation tool, not a produ




      The CSV being updated is:

      C:\dev2026\ElNino\GARMIN\All-new.csv

      with a one-time backup written before the first modification at:

      C:\dev2026\ElNino\GARMIN\All-new.before-gpx-match.csv

      Note there is also an identical copy at elnino-client\rides\All-new.csv — that one is not touched by the script.

      On average speed: no, I did not add it — and it was already there.

      The Garmin export already has average speed as column 10, תעצוממ תוריהמ (and max speed as column 11, תיברמ תוריהמ). The script reads that data but never writes to it.