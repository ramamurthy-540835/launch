# LunchBox school-to-apartment research

This module identifies **publicly listed apartment and residential-community locations near schools** for LunchBox neighbourhood planning. It creates no resident or child profiles and does not collect personal phone numbers, email addresses, flat numbers, or private contact information. Contact fields are restricted to official school-office and apartment association/property-management/developer-office numbers published by the organisation itself.

## Architecture

```text
School CSV or OSM/Overpass
          |
          v
 public location normalization ---> source audit log
          |
          v
 normalized name + address + coordinates deduplication
          |
          v
 Haversine school/apartment matching (configurable radius)
          |
          v
 explainable priority scoring + locality aggregation
          |
          v
 local CSV + dependency-free XLSX + research_log.csv
          |
          v
 optional timestamped GCS run folder
```

The Python research package is intentionally separate from the existing Next.js marketing UI. Its exports can later be uploaded to the existing `gs://chennaifood/marketing/` prefix or loaded into the existing BigQuery marketing tables after review.

## Data sources and permitted use

- **User-supplied school CSV:** preferred for an approved pilot-school list. Every row must include coordinates and a source URL.
- **OpenStreetMap through Overpass:** the default public-location provider. Records retain their OSM object URL and source type. OSM data is available under the Open Database License (ODbL); preserve attribution and review share-alike obligations before distribution.
- **Synthetic fixture:** offline tests and sample output only. It is deliberately labelled synthetic and must not be treated as market research.

Google Places is not used to build this persistent export. Google Places policy generally restricts caching/storage of Places content beyond stated exceptions; Place IDs are the principal indefinite-storage exception. The existing web UI can continue using separately governed live map/place integrations with required attribution.

The public Nominatim service is not used. Its policy prohibits systematic POI downloads and imposes strict request limits. Overpass requests use a configurable identifying User-Agent, serial rate limiting, timeouts, and exponential retries. For production or scheduled collection, use an appropriately provisioned OSM/Overpass provider or self-hosted service rather than imposing load on a donated public endpoint.

Official policy references:

- OSM API policy: https://operations.osmfoundation.org/policies/api/
- Nominatim policy: https://operations.osmfoundation.org/policies/nominatim/
- Google Places policies: https://developers.google.com/maps/documentation/places/web-service/policies

## Requirements

- Python 3.10 or newer
- No third-party Python packages
- Internet access only for `--provider osm`

On this Windows machine, Google Cloud CLI's bundled Python can also run the module:

```powershell
& "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe" collect.py --provider fixture
```

## Configuration

Edit or copy [`config.example.json`](config.example.json):

```json
{
  "overpass_endpoint": "https://overpass-api.de/api/interpreter",
  "user_agent": "LunchBoxResearch/1.0 (https://github.com/Kapi1801/launch)",
  "rate_limit_seconds": 2.0,
  "timeout_seconds": 45,
  "retries": 2,
  "max_schools": 25,
  "gcs_upload": {
    "enabled": true,
    "project": "chennaifood",
    "bucket": "chennaifood",
    "prefix": "marketing/research/runs"
  }
}
```

Use a real contact in the User-Agent before a live production run. Keep `max_schools` conservative and prefer a specific locality or supplied school list.

## Usage

Discover a limited set of Chennai schools, then named residential communities within 3 km:

```powershell
python collect.py --city "Chennai" --radius 3
```

Constrain the pilot to a locality:

```powershell
python collect.py --city "Chennai" --locality "Adyar" --radius 3 --max-schools 10
```

For a locality that is not represented as an OSM administrative boundary, provide its researched centre coordinate:

```powershell
python collect.py --city "Chennai" --locality "Adyar" --center-lat 13.0067 --center-lon 80.2575 --school-search-radius 5 --radius 3 --max-schools 10
```

The centre coordinate is a search origin only. Exported schools and apartments retain their own source coordinates and OSM source URLs.

Use an approved school list:

```powershell
python collect.py --schools research/sample/schools.csv --radius 3

# Citywide bulk mode (bbox = south,west,north,east)
python collect.py --bulk-bbox "12.85,80.05,13.25,80.35" --max-schools 5000 --max-apartments 15000 --radius 3
```

Generate deterministic sample output without network access:

```powershell
python collect.py --provider fixture --city "Chennai" --radius 3 --output-dir research/sample/output
```

Keep a test run local without uploading it:

```powershell
python collect.py --provider fixture --radius 3 --no-gcs-upload
```

School CSV columns accepted:

```text
School Name,School Address,Locality,PIN Code,Latitude,Longitude,School Type,Source URL,Source Type
```

Coordinates and a source URL are mandatory. Unknown public fields are written as `Not publicly available`; the collector does not invent them.

## Outputs

The selected output directory receives:

- `apartments_near_schools.csv` — one apartment-to-school relationship per row
- `apartments_near_schools.xlsx` — Excel workbook with relationship and locality-summary sheets
- `locality_summary.csv` — locality-level school/apartment overlap
- `research_log.csv` — provider, operation, source endpoint, query summary, attempt, duration, result count, and error

`School Distance KM` is straight-line Haversine distance. `Estimated Travel Distance KM` is explicitly labelled as a rough `straight-line × 1.25` estimate, not a routed journey. A future routing adapter may replace it with a licensed routing source.

## Local and GCP storage

When `gcs_upload.enabled` is `true`, the collector always writes and closes every local output first. It then uploads the same four files to a unique UTC run directory:

```text
gs://chennaifood/marketing/research/runs/2026-08-08T073045Z/
```

This prevents one run from overwriting another and keeps the local files available if cloud upload fails. GCS upload uses the authenticated Google Cloud CLI account and configured project. Use `--no-gcs-upload` for tests, offline work, or intentionally local-only runs.

Verify authentication before a production run:

```powershell
gcloud auth list
gcloud config set project chennaifood
gcloud storage ls gs://chennaifood/marketing/research/runs/
```

## Deduplication and scoring

Apartments are deduplicated using normalized name + normalized address + coordinates rounded to five decimal places.

Priority score (maximum 100):

- nearest school: 40 points within 1 km, 30 within 2 km, 20 within 3 km, 5 beyond 3 km
- schools within 3 km: 5 points each, maximum 25
- publicly tagged gated/private/residential-complex status: 15
- publicly available unit count: 10
- public website/contact route: 10

The score uses only available public attributes. The school-count component covers selected/discovered schools within 3 km; a narrow input list may therefore undercount other schools. Missing units, school board, website, or gated status remain `Not publicly available` and receive no points.

## Privacy and research guardrails

- Collect place/business/location information only.
- Never collect resident names, children, flat numbers, personal phone numbers, or email addresses.
- Record a phone only when its official source URL is retained. Broker, resident, personal WhatsApp, and scraped directory numbers are out of scope.
- Treat OpenStreetMap phone tags as leads requiring verification; the export labels them accordingly.
- Do not crawl websites, CAPTCHAs, login systems, paywalls, or access-controlled pages.
- Review source terms and attribution requirements before every production run.
- Manually verify high-priority records before using them in marketing.
- Market to parents/guardians and school decision-makers, never directly to children.

## Tests

```powershell
python -m unittest discover -s research/tests -v
```

The suite covers distance calculation, estimated-distance labelling, normalization/deduplication, coordinate validation, required provenance, and public-signal-only scoring.

## Sample data warning

Everything under `research/sample/` uses invented names and `example.invalid` URLs. The sample proves the pipeline and export formats only; it is not verified Chennai research.
