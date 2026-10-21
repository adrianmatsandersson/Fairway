import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import type {
  CourseForecast,
  CourseSearchResult,
  GolfCourse,
  LocationSuggestion,
} from "./domain";
import { formatForecastDateTime, formatForecastHour } from "./clockFormatting";
import {
  getClockInputOptions,
  getClockInputParts,
  updateClockInputValue,
} from "./clockInput";
import {
  formatDeviceLocalDateTime,
  validateLocalDateTime,
  validateLocalDateTimeFormat,
} from "./forecastTime";
import { CourseForecastRequests } from "./courseForecastRequests";
import {
  CLOCK_FORMAT_OPTIONS,
  COURSE_SEARCH_RADII_KM,
  loadPreferences,
  savePreferences,
  type ClockFormat,
  type CourseSearchRadiusKm,
} from "./preferences";
import { OpenMeteoProvider } from "./providers/openMeteo";
import { OpenStreetMapProvider } from "./providers/openStreetMap";
import { PhotonSuggestionProvider } from "./providers/photonSuggestions";

const courseProvider = new OpenStreetMapProvider();
const suggestionProvider = new PhotonSuggestionProvider();
const weatherProvider = new OpenMeteoProvider();
const SUGGESTION_DEBOUNCE_MS = 1_000;
const MIN_SUGGESTION_LENGTH = 3;

type WeatherState = {
  loading: boolean;
  data?: CourseForecast;
  error?: string;
};

function App() {
  const [query, setQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [result, setResult] = useState<CourseSearchResult | null>(null);
  const [resultRadiusKm, setResultRadiusKm] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [weather, setWeather] = useState<Record<string, WeatherState>>({});
  const [forecastDateTime, setForecastDateTime] = useState<string | undefined>();
  const [targetDate, setTargetDate] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [forecastError, setForecastError] = useState("");
  const [preferences, setPreferences] = useState(loadPreferences);
  const searchSequence = useRef(0);
  const forecastSequence = useRef(0);
  const forecastRequests = useRef(new CourseForecastRequests<void>());
  const searchInProgress = useRef(false);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const value = query.trim();
    if (!suggestionsOpen || value.length < MIN_SUGGESTION_LENGTH) {
      setSuggestions([]);
      setSuggestionLoading(false);
      setSuggestionError("");
      return;
    }

    const controller = new AbortController();
    setSuggestionLoading(true);
    setSuggestionError("");
    const timer = window.setTimeout(() => {
      suggestionProvider.suggest(value, controller.signal).then(
        (found) => {
          if (controller.signal.aborted) return;
          setSuggestions(found);
          setActiveSuggestion(-1);
          setSuggestionLoading(false);
        },
        (cause: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setSuggestionError(errorMessage(cause));
          setSuggestionLoading(false);
        },
      );
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, suggestionsOpen]);

  async function runSearch(
    value: string,
    targetInstant: string | undefined,
    location?: LocationSuggestion,
  ) {
    if (!value || searchInProgress.current) return;
    const radiusKm = preferences.radiusKm;
    searchInProgress.current = true;
    const sequence = ++searchSequence.current;
    forecastSequence.current += 1;
    forecastRequests.current.clear();
    setSuggestionsOpen(false);
    setSuggestions([]);
    setSearching(true);
    setError("");
    setResult(null);
    setResultRadiusKm(null);
    setWeather({});
    setForecastDateTime(targetInstant);
    setForecastError("");
    try {
      const found = await courseProvider.search(value, {
        radiusKm,
        selectedLocation: location,
      });
      if (sequence !== searchSequence.current) return;
      setResult(found);
      setResultRadiusKm(radiusKm);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      searchInProgress.current = false;
      setSearching(false);
    }
  }

  function loadForecast(course: GolfCourse, forceRefresh = false) {
    if (!forceRefresh && weather[course.id]) return;
    const sequence = forecastSequence.current;
    void forecastRequests.current.run(course.id, async () => {
      setWeather((previous) => ({
        ...previous,
        [course.id]: { loading: true, data: previous[course.id]?.data },
      }));
      try {
        const data = await weatherProvider.forecast({
          latitude: course.latitude,
          longitude: course.longitude,
          dateTime: forecastDateTime,
        });
        if (sequence === forecastSequence.current) {
          setWeather((previous) => ({
            ...previous,
            [course.id]: { loading: false, data },
          }));
        }
      } catch (cause) {
        if (sequence === forecastSequence.current) {
          setWeather((previous) => ({
            ...previous,
            [course.id]: {
              loading: false,
              data: previous[course.id]?.data,
              error: errorMessage(cause),
            },
          }));
        }
      }
    });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForecastError("");
    const hasDate = Boolean(targetDate);
    const hasTime = Boolean(targetTime);
    if (hasDate !== hasTime) {
      setForecastError("Choose both a date and a time, or clear both for current conditions.");
      return;
    }
    let targetInstant: string | undefined;
    if (hasDate && hasTime) {
      const localValue = `${targetDate}T${targetTime}`;
      const validation = validateLocalDateTimeFormat(localValue);
      if (validation.error) {
        setForecastError(validation.error);
        return;
      }
      targetInstant = validation.instant;
    }
    void runSearch(query.trim(), targetInstant, selectedLocation ?? undefined);
  }

  function validateSelectedTime(date: string, time: string) {
    if (!date || !time) {
      setForecastError("");
      return;
    }
    const validation = validateLocalDateTime(`${date}T${time}`);
    setForecastError(validation.error ?? "");
  }

  function selectSuggestion(suggestion: LocationSuggestion) {
    setQuery(suggestion.displayName);
    setSelectedLocation(suggestion);
    setSuggestionsOpen(false);
    setSuggestions([]);
    setActiveSuggestion(-1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      setActiveSuggestion(-1);
    } else if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
    } else if (
      event.key === "Enter" &&
      activeSuggestion >= 0 &&
      suggestions[activeSuggestion]
    ) {
      event.preventDefault();
      selectSuggestion(suggestions[activeSuggestion]);
    }
  }

  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "device timezone";
  const now = new Date();
  const minimumLocalDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#" aria-label="Fairway home">
          <span className="brand-mark"><Icon name="flag" /></span>
          <span>fairway<span className="brand-period">.</span></span>
        </a>
        <div className="nav-note"><span className="live-dot" /> YOUR NEXT ROUND, FORECAST</div>
        <a className="about-link" href="#how-it-works">How it works <Icon name="arrow-up-right" /></a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> A BETTER DAY ON THE COURSE</div>
          <h1>Golf, in the<br /><em>forecast.</em></h1>
          <p className="hero-description">Find your next course and see what the sky has in store. Good golf starts before the first tee.</p>
          <form className="search-planner" onSubmit={search}>
            <div className="search-control">
              <div className="search-form">
              <Icon name="search" />
              <input
                id="course-search"
                type="text"
                role="combobox"
                aria-label="Search town or golf course"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && query.trim().length >= MIN_SUGGESTION_LENGTH}
                aria-controls={suggestions.length ? "course-search-suggestions" : undefined}
                aria-activedescendant={
                  activeSuggestion >= 0 ? `course-suggestion-${activeSuggestion}` : undefined
                }
                aria-describedby={
                  suggestionsOpen && query.trim().length >= MIN_SUGGESTION_LENGTH
                    ? "search-suggestion-status"
                    : undefined
                }
                autoComplete="off"
                placeholder="Search a town or course name"
                value={query}
                onFocus={() => setSuggestionsOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedLocation(null);
                  setSuggestionsOpen(true);
                  setSuggestions([]);
                  setActiveSuggestion(-1);
                }}
                onKeyDown={handleSearchKeyDown}
              />
              <button type="submit" disabled={searching || !query.trim()}>
                {searching ? <span className="button-spinner" /> : <>Find courses <Icon name="arrow-right" /></>}
              </button>
              </div>
            {suggestionsOpen && query.trim().length >= MIN_SUGGESTION_LENGTH && (
              <div className="suggestion-dropdown">
                {suggestions.length > 0 && (
                  <ul
                    id="course-search-suggestions"
                    className="suggestion-list"
                    role="listbox"
                    aria-label="Place and golf course suggestions"
                  >
                    {suggestions.map((suggestion, index) => (
                      <li
                        id={`course-suggestion-${index}`}
                        className={`suggestion-option${index === activeSuggestion ? " is-active" : ""}`}
                        role="option"
                        aria-selected={index === activeSuggestion}
                        key={suggestion.placeId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectSuggestion(suggestion)}
                      >
                        <span className="suggestion-icon"><Icon name={suggestion.kind === "course" ? "golf" : "pin"} /></span>
                        <span className="suggestion-copy">
                          <strong>{suggestion.name}</strong>
                          <small>{suggestion.displayName}</small>
                        </span>
                        <span className="suggestion-kind">{suggestion.kind === "course" ? "COURSE" : "LOCATION"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div id="search-suggestion-status" className="suggestion-status" role="status" aria-live="polite">
                  {suggestionLoading
                    ? "Searching places and courses…"
                    : suggestionError
                      ? `Suggestions unavailable: ${suggestionError} You can still search this text.`
                      : !suggestions.length
                        ? "No matches found. You can still search this text."
                        : ""}
                </div>
              </div>
            )}
            </div>
            <div className="search-settings" role="group" aria-label="Display and search settings">
              <strong className="settings-heading">Display &amp; search settings</strong>
              <label htmlFor="clock-format">
                Clock format
                <select
                  id="clock-format"
                  value={preferences.clockFormat}
                  disabled={searching}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      clockFormat: event.target.value as ClockFormat,
                    }))
                  }
                >
                  {CLOCK_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="search-radius">
                Course search radius
                <select
                  id="search-radius"
                  value={preferences.radiusKm}
                  disabled={searching}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      radiusKm: Number(event.target.value) as CourseSearchRadiusKm,
                    }))
                  }
                >
                  {COURSE_SEARCH_RADII_KM.map((radius) => (
                    <option key={radius} value={radius}>{radius} km</option>
                  ))}
                </select>
              </label>
              <span className="settings-note">
                Clock format updates immediately. Settings are saved on this device; search radius applies to your next search.
              </span>
            </div>
            <div className="search-time-controls">
              <div className="search-time-heading">
                <strong>Optional tee time</strong>
                <span>Uses your device/browser local time ({deviceTimeZone}); courses get the same moment.</span>
              </div>
              <div className="search-time-fields">
                <label htmlFor="search-date">
                  Date
                  <input
                    id="search-date"
                    type="date"
                    value={targetDate}
                    min={minimumLocalDate}
                    disabled={searching}
                    onChange={(event) => {
                      const date = event.target.value;
                      setTargetDate(date);
                      validateSelectedTime(date, targetTime);
                    }}
                    aria-describedby="search-time-help"
                    aria-invalid={Boolean(forecastError)}
                  />
                </label>
                <fieldset
                  className="time-select-group"
                  disabled={searching}
                  aria-describedby="search-time-help"
                  aria-invalid={Boolean(forecastError)}
                >
                  <legend>Time</legend>
                  {(() => {
                    const parts = getClockInputParts(targetTime, preferences.clockFormat);
                    const clockOptions = getClockInputOptions(preferences.clockFormat);
                    const updatePart = (part: "hour" | "minute" | "period", value: string) => {
                      const time = updateClockInputValue(
                        targetTime,
                        preferences.clockFormat,
                        part,
                        value,
                      );
                      setTargetTime(time);
                      validateSelectedTime(targetDate, time);
                    };
                    return (
                      <div className="clock-selects">
                        <select
                          aria-label="Hour"
                          value={parts.hour}
                          onChange={(event) => updatePart("hour", event.target.value)}
                        >
                          <option value="" disabled>Select hour</option>
                          {clockOptions.hours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                        </select>
                        <span aria-hidden="true">:</span>
                        <select
                          aria-label="Minute"
                          value={parts.minute}
                          onChange={(event) => updatePart("minute", event.target.value)}
                        >
                          <option value="" disabled>Select minute</option>
                          {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"))
                            .map((minute) => <option key={minute} value={minute}>{minute}</option>)}
                        </select>
                        {clockOptions.showPeriod && (
                          <select
                            aria-label="AM or PM"
                            value={parts.period}
                            onChange={(event) => updatePart("period", event.target.value)}
                          >
                            <option value="" disabled>Select AM or PM</option>
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        )}
                      </div>
                    );
                  })()}
                </fieldset>
                <button
                  type="button"
                  className="now-time-button"
                  disabled={searching}
                  onClick={() => {
                    const [date, time] = formatDeviceLocalDateTime(new Date()).split("T");
                    setTargetDate(date);
                    setTargetTime(time);
                    setForecastError("");
                  }}
                >
                  Now
                </button>
              </div>
              <span id="search-time-help" className="search-time-help">
                Leave both blank for current conditions. Select both for a future forecast; Now fills the current date and time. Search to apply.
              </span>
              {forecastError && <div className="forecast-validation" role="alert">{forecastError}</div>}
            </div>
          </form>
          <div className="search-hint"><Icon name="pin" /> Try “Portland, Oregon” or “St Andrews”</div>
          {error && <div className="error-message" role="alert"><Icon name="alert" />{error}</div>}
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun" />
          <div className="course-illustration">
            <div className="hill hill-back" /><div className="hill hill-mid" /><div className="hill hill-front" />
            <div className="green" /><div className="green-shadow" />
            <div className="flagpole"><div className="flag" /></div>
            <span className="art-grass grass-a"><Icon name="sparkle" /></span><span className="art-grass grass-b"><Icon name="sparkle" /></span>
          </div>
          <div className="art-caption">THE ONLY FORECAST THAT MATTERS <span className="caption-arrow"><Icon name="arrow-up-right" /></span></div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        </div>
      </section>

      <section className="results-section" aria-live="polite">
        <div className="section-heading">
          <div>
            <div className="eyebrow section-eyebrow"><span /> YOUR COURSE SHORTLIST</div>
            <h2>{result ? `Around ${result.location.name}` : "Find your fairway"}</h2>
          </div>
          {result && (
            <div className="result-meta">
              <Icon name="pin" />
              <span>{result.location.displayName}<small>Courses within {resultRadiusKm ?? preferences.radiusKm} km</small></span>
            </div>
          )}
        </div>
        {searching ? (
          <div className="empty-state"><span className="loader" /><p>Finding the local fairways…</p></div>
        ) : result?.courses.length ? (
          <div className="course-grid">
            {result.courses.map((course, index) => (
              <CourseCard
                key={course.id}
                course={course}
                index={index}
                state={weather[course.id]}
                clockFormat={preferences.clockFormat}
                onNeedForecast={loadForecast}
              />
            ))}
          </div>
        ) : result ? (
          <div className="empty-state"><Icon name="golf" /><p>No courses found nearby. Try another town or a course name.</p></div>
        ) : (
          <div className="welcome-row">
            <div className="welcome-icon"><Icon name="sun" /></div>
            <div><strong>Your next round is out there.</strong><p>Search any town or course to compare nearby greens and their local forecast.</p></div>
            <div className="welcome-sparkle"><Icon name="sparkle" /></div>
          </div>
        )}
      </section>

      <footer id="how-it-works">
        <div><span className="footer-brand">fairway<span>.</span></span><span className="footer-copy">A little more sunshine in your golf plans.</span></div>
        <div className="credits">SUGGESTIONS BY <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">PHOTON</a><span>·</span> DATA © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OPENSTREETMAP</a><span>·</span> WEATHER BY <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">OPEN-METEO</a></div>
      </footer>
    </main>
  );
}

function CourseCard({
  course,
  index,
  state,
  clockFormat,
  onNeedForecast,
}: {
  course: GolfCourse;
  index: number;
  state?: WeatherState;
  clockFormat: ClockFormat;
  onNeedForecast: (course: GolfCourse, forceRefresh?: boolean) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const onNeedForecastRef = useRef(onNeedForecast);
  onNeedForecastRef.current = onNeedForecast;

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (typeof IntersectionObserver === "undefined") {
      const checkVisibility = () => {
        const bounds = card.getBoundingClientRect();
        if (bounds.bottom >= -200 && bounds.top <= window.innerHeight + 200) {
          window.removeEventListener("scroll", checkVisibility);
          window.removeEventListener("resize", checkVisibility);
          onNeedForecastRef.current(course);
        }
      };
      window.addEventListener("scroll", checkVisibility, { passive: true });
      window.addEventListener("resize", checkVisibility);
      checkVisibility();
      return () => {
        window.removeEventListener("scroll", checkVisibility);
        window.removeEventListener("resize", checkVisibility);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.unobserve(card);
          onNeedForecastRef.current(course);
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [course.id]);

  const forecast = state?.data;
  const current = forecast?.current;
  const details = current ? describeWeather(current.weatherCode) : null;
  return (
    <article className="course-card" ref={cardRef}>
      <div className={`card-cover cover-${index % 4}`}>
        <div className="cover-sun" />
        <div className="cover-course"><span /><span /><span /></div>
        <span className="cover-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="cover-badge"><Icon name="pin" /> {formatDistance(course.distanceKm)}</span>
      </div>
      <div className="card-content">
        <div className="course-title-row">
          <div><div className="course-kicker">GOLF COURSE</div><h3>{course.name}</h3></div>
          <div className="course-actions">
            <button
              type="button"
              className="refresh-forecast"
              disabled={Boolean(state?.loading)}
              aria-label={`${state?.loading ? "Refreshing" : "Refresh"} forecast for ${course.name}`}
              title={`${state?.loading ? "Refreshing" : "Refresh"} forecast`}
              onClick={() => onNeedForecastRef.current(course, true)}
            >
              {state?.loading ? <span className="loader tiny" aria-hidden="true" /> : <Icon name="refresh" />}
            </button>
            <a className="map-link" href={`https://www.openstreetmap.org/?mlat=${course.latitude}&mlon=${course.longitude}#map=14/${course.latitude}/${course.longitude}`} target="_blank" rel="noreferrer" aria-label={`View ${course.name} on OpenStreetMap`}><Icon name="arrow-up-right" /></a>
          </div>
        </div>
        <div className="course-location"><Icon name="pin" /> {course.address || "Location details unavailable"}</div>
        <div className="course-timezone">
          <Icon name="clock" /> Course time: <strong>{forecast?.timezone || "Timezone unavailable"}</strong>
        </div>
        <div className="weather-panel" aria-busy={Boolean(state?.loading)}>
          {state?.loading && !state.data ? <div className="weather-loading"><span className="loader small" /> Loading local forecast…</div> : !state ? (
            <div className="weather-loading">Forecast loads as you browse…</div>
          ) : state.error ? (
            <div className="weather-error" role="alert"><Icon name="cloud" /> {state.error}</div>
          ) : current && forecast ? (
            <>
              <div className="weather-current">
                <div className="weather-icon"><WeatherIcon code={current.weatherCode} /></div>
                <div>
                  <span className="weather-label">
                    {current.time ? `${formatForecastDateTime(current.time, clockFormat)} · COURSE TIME` : "RIGHT NOW"}
                  </span>
                  <div className="temperature">{Math.round(current.temperatureC)}°<small>C</small></div>
                </div>
                <div className="condition">{details?.label}<span>{details?.golfNote}</span></div>
              </div>
              <div className="weather-stats">
                <WeatherStat icon="drop" label="RAIN" value={`${current.precipitationProbability}%`} />
                <WeatherStat icon="wind" label="WIND" value={`${Math.round(current.windSpeedKmh / 3.6)} m/s`} />
              </div>
              <div className="hourly-row">
                {forecast.hours.map((hour) => (
                  <div className="hour-item" key={hour.time}>
                    <span>{formatForecastHour(hour.time, clockFormat)}</span>
                    <span className="hour-weather-icon"><WeatherIcon code={hour.weatherCode} /></span>
                    <b>{Math.round(hour.temperatureC)}°</b>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function WeatherStat({ icon, label, value }: { icon: "drop" | "wind"; label: string; value: string }) {
  return <div className="weather-stat"><Icon name={icon} /><span>{label}</span><b>{value}</b></div>;
}

function formatDistance(distance: number) {
  return distance < 1 ? `${Math.round(distance * 1000)} m away` : `${distance.toFixed(1)} km away`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function describeWeather(code: number) {
  if (code === 0) return { label: "Clear skies", golfNote: "Perfect for a round" };
  if (code <= 3) return { label: "Partly cloudy", golfNote: "A lovely day to play" };
  if (code <= 48) return { label: "Foggy", golfNote: "Keep an eye on visibility" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: "Rain nearby", golfNote: "Pack a waterproof layer" };
  if (code >= 71 && code <= 77) return { label: "Snowfall", golfNote: "Maybe save it for another day" };
  if (code >= 95) return { label: "Thunderstorms", golfNote: "Best to stay off the course" };
  return { label: "Mixed conditions", golfNote: "Check again before you go" };
}

function WeatherIcon({ code }: { code: number }) {
  const name = code === 0 ? "sun" : code <= 3 ? "partly-cloudy" : code >= 51 ? "rain" : "cloud";
  return <Icon name={name} />;
}

function Icon({ name }: { name: string }) {
  const shared = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    flag: <><path d="M4 21V5" /><path d="M4 5c6-4 10 4 16 0v11c-6 4-10-4-16 0" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4.9 9A7.5 7.5 0 0 1 18 6.2L20 12" /><path d="M4 17v-5h5" /><path d="M19.1 15A7.5 7.5 0 0 1 6 17.8L4 12" /></>,
    "arrow-right": <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
    sparkle: <path d="M12 2.5 14 9.2 21 12l-7 2.8-2 6.7-2-6.7L3 12l7-2.8 2-6.7Z" />,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5h.01" /></>,
    golf: <><path d="M12 21V4" /><path d="M12 4c3-2 5 2 8 0v6c-3 2-5-2-8 0" /><path d="M5 21h14" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    cloud: <><path d="M20 16.2a4 4 0 0 0-1.7-7.6A6.5 6.5 0 0 0 5.5 10a3.5 3.5 0 0 0 .5 7h13" /></>,
    "partly-cloudy": <><path d="M12 2v2m-7.1.9 1.4 1.4M2 12h2m12-7.1-1.4 1.4" /><path d="M9 8a4 4 0 0 1 6.8 2.8" /><path d="M19.5 18a3.5 3.5 0 0 0-.8-6.9A5 5 0 0 0 9 13a2.5 2.5 0 0 0 .5 5Z" /></>,
    rain: <><path d="M20 15.5a4 4 0 0 0-1.7-7.6A6.5 6.5 0 0 0 5.5 9.3a3.5 3.5 0 0 0 .5 7h13" /><path d="m8 19-1 2m6-2-1 2m6-2-1 2" /></>,
    drop: <><path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7Z" /></>,
    wind: <><path d="M3 8h12a3 3 0 1 0-3-3" /><path d="M2 12h17a3 3 0 1 1-3 3" /><path d="M4 16h5a2 2 0 1 1-2 2" /></>,
  };
  return <svg {...shared}>{paths[name] ?? paths.cloud}</svg>;
}

export default App;
