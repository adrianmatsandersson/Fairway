# Fairway

A responsive course-and-weather planner built with React, TypeScript, and Vite. Search a town or a golf course to discover nearby courses and compare current conditions or a course-local forecast time.

## Run locally

```sh
npm install
npm run dev
```

Build with `npm run build`; run the provider-independent tests with `npm test`.

## Providers

The UI uses separate `SuggestionProvider`, `CourseDiscoveryProvider`, and
`WeatherProvider` interfaces in `src/domain.ts`.

- **Local settings:** The controls between the search and tee-time inputs let you
  choose 12- or 24-hour forecast times and a golf-course search radius of 5,
  10, 20, 30, or 50 km. Defaults are 24-hour time and 30 km. Clock format
  changes immediately; the radius applies on the next search. Both settings are
  saved in browser `localStorage`. If storage is
  blocked or contains invalid data, the app continues with the defaults.
  Forecast labels and the tee-time selectors use the selected clock format.
  The clock format dropdown uses the concise `12-hour` and `24-hour` labels.
  In 24-hour mode, the hour selector offers `00` through `23` with no AM/PM
  control; in 12-hour mode it offers `1` through `12` and an AM/PM control.
  The tee-time selectors store a canonical 24-hour `HH:mm` value regardless of
  how the hour and period are displayed.
- **Live suggestions:** `PhotonSuggestionProvider` calls the Photon geocoding
  API (`https://photon.komoot.io/api/`). Photon is a separate autocomplete
  source; it provides OSM-based place results, coordinates, and course/location
  classification. Suggestions are debounced in the UI, cached in memory (up to
  100 queries), and limited to at most one outbound request per second in this
  page session. If suggestions fail or have no results, the user can still
  submit the text.
- **Submitted searches and courses:** `OpenStreetMapProvider` uses Nominatim
  only when the user explicitly submits text, then uses Overpass to find nearby
  golf courses. Selecting a suggestion fills the search input and closes the
  list; it does not initiate a course or weather search. The selected name is
  submitted as ordinary text when the user clicks **Find courses** or submits
  the form, so the edited query is always geocoded by Nominatim. Searches
  receive the selected radius through the shared
  `CourseSearchOptions.radiusKm` provider option, converted to meters for the
  Overpass query. Course cards show each course's distance in meters or
  kilometers, and search results indicate the radius used.
- **Weather:** `OpenMeteoProvider` calls Open-Meteo. The optional date and time
  controls are alongside the initial town/course search. They represent one
  time in the user's device/browser local timezone (shown beside the controls),
  and the `Now` action fills both fields with the current device-local date and
  time. Search with both fields blank to request current conditions; after
  setting a time, submit the search to apply it. A selected local date/time is
  validated at minute precision (the displayed current minute is accepted) and
  converted without parsing timezone-free text, then
  `ForecastQuery.dateTime` carries that ISO 8601 instant through course
  discovery to every provider request. Each course provider translates the
  same instant into that course's timezone, so a different course timezone
  changes its displayed wall-clock time but not the intended moment.

  Open-Meteo hourly data is local to each returned timezone. A requested
  instant is converted to the course-local date/time and matched to the nearest
  available hourly point on that local calendar date (an exact tie resolves to
  the later hour). Each card shows six hourly timeline entries starting at the
  matched/current hour, alongside the current-conditions summary. The forecast
  request uses Open-Meteo's 16-day forecast
  horizon. Dates beyond the available horizon, missing hourly values, and
  nonexistent device-local daylight-saving-time values are shown as forecast
  errors instead of being replaced with a plausible-looking default. Both
  date and time must be supplied together. Past dates are excluded from the
  date picker's initial range, and once both fields are selected, edits must
  specify a current or future minute (including the minute set by **Now**).
  Submission and the weather provider validate the input/ISO instant format
  and validity, but deliberately do not re-check whether a once-valid selection
  has become past while a search or network request was delayed.

  For current conditions, the temperature, precipitation, wind, weather code,
  and displayed timestamp come from Open-Meteo's `current` response. Because
  that timestamp may fall between hourly forecast points (for example, 09:43
  with hourly points at 09:00 and 10:00), precipitation probability and the
  hourly context use the nearest point on the same course-local date. The
  matching point must be within 60 minutes; a missing, invalid, cross-date, or
  more distant hourly point is reported as an error rather than silently
  substituting unrelated forecast data.

Set `VITE_PHOTON_API_URL` at build time to use a different Photon-compatible
endpoint. It defaults to the public Photon endpoint above. This is a public
client-side endpoint setting, not a place for secrets.

## Attribution and public-service caveats

The footer credits Photon and OpenStreetMap. Photon results and the course
listings are based on OpenStreetMap data, provided under the
[Open Database License](https://www.openstreetmap.org/copyright). Weather is
credited to [Open-Meteo](https://open-meteo.com/).

These adapters use public services with independent availability, fair-use,
and attribution requirements. Before deploying at scale, review the current
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/),
[Overpass API guidance](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances),
and the policy/terms published for the specific Photon endpoint being used.
Nominatim is deliberately not used for keystroke autocomplete; its public usage
policy disallows autocomplete use. The public Photon endpoint is used here as a
replaceable suggestion backend, but its current policy and suitability for a
production autocomplete workload have not been independently verified here.
Use a hosted/managed instance if the public service terms or capacity are not
suitable. No external API behavior is established by the mocked tests: in
particular, they assert that partial text such as `Nässj` is sent unchanged to
Photon, but do not validate whether the live service returns `Nässjö`.
