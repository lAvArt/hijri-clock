// Prayer times for the clock's calendar panel and bar label.
//
// Everything here is computed offline from the sun's position, so the widget
// needs no network and no location service. Like Model.js it is free of Qt, so
// it can be unit tested under node (test/prayer-test.js).
//
// The maths is the standard one used by PrayTimes.org and most prayer-time
// software: the sun's declination and the equation of time give solar noon,
// and each prayer is the time the sun reaches a given angle below (or, for
// Asr, a shadow length above) the horizon.

var MS_PER_MINUTE = 60000
var MS_PER_HOUR = 3600000

// ---- Calculation methods. Angles are degrees below the horizon. `isha` is
//      either an angle or { minutes } after Maghrib; `maghrib` is only set
//      for the methods that define it by angle instead of at sunset.
//      `ramadanMinutes` is the longer gap Umm al-Qura keeps in Ramadan, and
//      `adjust` is the fixed number of minutes an authority publishes on top
//      of the astronomical time (Diyanet and the UAE add a few minutes of
//      caution to some prayers); the user's own offsets stack on these.
//
//      Labels are exactly the options in manifest.json's `prayerMethod`
//      enum; test/prayer-test.js checks the two lists agree.
var AUTO_METHOD_LABEL = "Auto (by region)"

var METHODS = {
  mwl:       { label: "Muslim World League",                fajr: 18,   isha: 17 },
  isna:      { label: "ISNA (North America)",               fajr: 15,   isha: 15 },
  egypt:     { label: "Egyptian General Authority",         fajr: 19.5, isha: 17.5 },
  makkah:    { label: "Umm al-Qura (Makkah)",               fajr: 18.5, isha: { minutes: 90, ramadanMinutes: 120 } },
  karachi:   { label: "Karachi (Islamic Sciences)",         fajr: 18,   isha: 18 },
  tehran:    { label: "Tehran (Institute of Geophysics)",   fajr: 17.7, isha: 14,  maghrib: 4.5 },
  jafari:    { label: "Jafari (Shia Ithna-Ashari)",         fajr: 16,   isha: 14,  maghrib: 4 },
  gulf:      { label: "Gulf Region",                        fajr: 19.5, isha: { minutes: 90 } },
  kuwait:    { label: "Kuwait",                             fajr: 18,   isha: 17.5 },
  qatar:     { label: "Qatar",                              fajr: 18,   isha: { minutes: 90 } },
  dubai:     { label: "Dubai (UAE)",                        fajr: 18.2, isha: 18.2, adjust: { dhuhr: 3, maghrib: 3 } },
  singapore: { label: "Singapore / Malaysia / Indonesia",   fajr: 20,   isha: 18 },
  turkey:    { label: "Turkey (Diyanet)",                   fajr: 18,   isha: 17, adjust: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } },
  france:    { label: "France (UOIF)",                      fajr: 12,   isha: 12 },
  russia:    { label: "Russia (Spiritual Administration)",  fajr: 16,   isha: 15 },
  jordan:    { label: "Jordan",                             fajr: 18,   isha: 18, adjust: { maghrib: 5 } },
  tunisia:   { label: "Tunisia",                            fajr: 18,   isha: 18 },
  algeria:   { label: "Algeria",                            fajr: 18,   isha: 17 },
  morocco:   { label: "Morocco",                            fajr: 19,   isha: 17, adjust: { dhuhr: 5, maghrib: 5 } }
}

var METHOD_IDS = Object.keys(METHODS)

// Sunrise and sunset sit at -0.833 degrees: the sun's radius plus average
// atmospheric refraction.
var RISE_SET_ANGLE = 0.833

// ---- Regions. Each city carries the method its country's authority uses,
//      so picking a city sets the right method with no further choices.
//      [name, country, latitude, longitude, IANA time zone, method id]
var CITIES = [
  ["Makkah", "Saudi Arabia", 21.4225, 39.8262, "Asia/Riyadh", "makkah"],
  ["Madinah", "Saudi Arabia", 24.4686, 39.6142, "Asia/Riyadh", "makkah"],
  ["Riyadh", "Saudi Arabia", 24.7136, 46.6753, "Asia/Riyadh", "makkah"],
  ["Jeddah", "Saudi Arabia", 21.4858, 39.1925, "Asia/Riyadh", "makkah"],
  ["Dammam", "Saudi Arabia", 26.4207, 50.0888, "Asia/Riyadh", "makkah"],
  ["Kuwait City", "Kuwait", 29.3759, 47.9774, "Asia/Kuwait", "kuwait"],
  ["Doha", "Qatar", 25.2854, 51.531, "Asia/Qatar", "qatar"],
  ["Manama", "Bahrain", 26.2285, 50.586, "Asia/Bahrain", "gulf"],
  ["Muscat", "Oman", 23.588, 58.3829, "Asia/Muscat", "gulf"],
  ["Dubai", "United Arab Emirates", 25.2048, 55.2708, "Asia/Dubai", "dubai"],
  ["Abu Dhabi", "United Arab Emirates", 24.4539, 54.3773, "Asia/Dubai", "dubai"],
  ["Sanaa", "Yemen", 15.3694, 44.191, "Asia/Aden", "mwl"],
  ["Amman", "Jordan", 31.9454, 35.9284, "Asia/Amman", "jordan"],
  ["Jerusalem", "Palestine", 31.7683, 35.2137, "Asia/Jerusalem", "egypt"],
  ["Gaza", "Palestine", 31.5, 34.4667, "Asia/Gaza", "egypt"],
  ["Beirut", "Lebanon", 33.8938, 35.5018, "Asia/Beirut", "egypt"],
  ["Damascus", "Syria", 33.5138, 36.2765, "Asia/Damascus", "egypt"],
  ["Baghdad", "Iraq", 33.3152, 44.3661, "Asia/Baghdad", "egypt"],
  ["Cairo", "Egypt", 30.0444, 31.2357, "Africa/Cairo", "egypt"],
  ["Alexandria", "Egypt", 31.2001, 29.9187, "Africa/Cairo", "egypt"],
  ["Khartoum", "Sudan", 15.5007, 32.5599, "Africa/Khartoum", "egypt"],
  ["Tripoli", "Libya", 32.8872, 13.1913, "Africa/Tripoli", "egypt"],
  ["Tunis", "Tunisia", 36.8065, 10.1815, "Africa/Tunis", "tunisia"],
  ["Algiers", "Algeria", 36.7538, 3.0588, "Africa/Algiers", "algeria"],
  ["Casablanca", "Morocco", 33.5731, -7.5898, "Africa/Casablanca", "morocco"],
  ["Rabat", "Morocco", 34.0209, -6.8416, "Africa/Casablanca", "morocco"],
  ["Nouakchott", "Mauritania", 18.0735, -15.9582, "Africa/Nouakchott", "mwl"],
  ["Dakar", "Senegal", 14.7167, -17.4677, "Africa/Dakar", "mwl"],
  ["Lagos", "Nigeria", 6.5244, 3.3792, "Africa/Lagos", "mwl"],
  ["Kano", "Nigeria", 12.0022, 8.592, "Africa/Lagos", "mwl"],
  ["Addis Ababa", "Ethiopia", 9.03, 38.74, "Africa/Addis_Ababa", "mwl"],
  ["Mogadishu", "Somalia", 2.0469, 45.3182, "Africa/Mogadishu", "mwl"],
  ["Nairobi", "Kenya", -1.2921, 36.8219, "Africa/Nairobi", "mwl"],
  ["Johannesburg", "South Africa", -26.2041, 28.0473, "Africa/Johannesburg", "mwl"],
  ["Cape Town", "South Africa", -33.9249, 18.4241, "Africa/Johannesburg", "mwl"],
  ["Istanbul", "Turkey", 41.0082, 28.9784, "Europe/Istanbul", "turkey"],
  ["Ankara", "Turkey", 39.9334, 32.8597, "Europe/Istanbul", "turkey"],
  ["Izmir", "Turkey", 38.4237, 27.1428, "Europe/Istanbul", "turkey"],
  ["Bursa", "Turkey", 40.1885, 29.061, "Europe/Istanbul", "turkey"],
  ["Konya", "Turkey", 37.8746, 32.4932, "Europe/Istanbul", "turkey"],
  ["Tehran", "Iran", 35.6892, 51.389, "Asia/Tehran", "tehran"],
  ["Mashhad", "Iran", 36.2605, 59.6168, "Asia/Tehran", "tehran"],
  ["Baku", "Azerbaijan", 40.4093, 49.8671, "Asia/Baku", "mwl"],
  ["Tashkent", "Uzbekistan", 41.2995, 69.2401, "Asia/Tashkent", "mwl"],
  ["Almaty", "Kazakhstan", 43.222, 76.8512, "Asia/Almaty", "mwl"],
  ["Kabul", "Afghanistan", 34.5553, 69.2075, "Asia/Kabul", "karachi"],
  ["Karachi", "Pakistan", 24.8607, 67.0011, "Asia/Karachi", "karachi"],
  ["Lahore", "Pakistan", 31.5204, 74.3587, "Asia/Karachi", "karachi"],
  ["Islamabad", "Pakistan", 33.6844, 73.0479, "Asia/Karachi", "karachi"],
  ["Delhi", "India", 28.6139, 77.209, "Asia/Kolkata", "karachi"],
  ["Mumbai", "India", 19.076, 72.8777, "Asia/Kolkata", "karachi"],
  ["Hyderabad", "India", 17.385, 78.4867, "Asia/Kolkata", "karachi"],
  ["Dhaka", "Bangladesh", 23.8103, 90.4125, "Asia/Dhaka", "karachi"],
  ["Colombo", "Sri Lanka", 6.9271, 79.8612, "Asia/Colombo", "karachi"],
  ["Kuala Lumpur", "Malaysia", 3.139, 101.6869, "Asia/Kuala_Lumpur", "singapore"],
  ["Singapore", "Singapore", 1.3521, 103.8198, "Asia/Singapore", "singapore"],
  ["Jakarta", "Indonesia", -6.2088, 106.8456, "Asia/Jakarta", "singapore"],
  ["Surabaya", "Indonesia", -7.2575, 112.7521, "Asia/Jakarta", "singapore"],
  ["Bandar Seri Begawan", "Brunei", 4.9031, 114.9398, "Asia/Brunei", "singapore"],
  ["Bangkok", "Thailand", 13.7563, 100.5018, "Asia/Bangkok", "mwl"],
  ["London", "United Kingdom", 51.5074, -0.1278, "Europe/London", "mwl"],
  ["Birmingham", "United Kingdom", 52.4862, -1.8904, "Europe/London", "mwl"],
  ["Manchester", "United Kingdom", 53.4808, -2.2426, "Europe/London", "mwl"],
  ["Paris", "France", 48.8566, 2.3522, "Europe/Paris", "france"],
  ["Marseille", "France", 43.2965, 5.3698, "Europe/Paris", "france"],
  ["Brussels", "Belgium", 50.8503, 4.3517, "Europe/Brussels", "mwl"],
  ["Amsterdam", "Netherlands", 52.3676, 4.9041, "Europe/Amsterdam", "mwl"],
  ["Berlin", "Germany", 52.52, 13.405, "Europe/Berlin", "mwl"],
  ["Madrid", "Spain", 40.4168, -3.7038, "Europe/Madrid", "mwl"],
  ["Rome", "Italy", 41.9028, 12.4964, "Europe/Rome", "mwl"],
  ["Vienna", "Austria", 48.2082, 16.3738, "Europe/Vienna", "mwl"],
  ["Stockholm", "Sweden", 59.3293, 18.0686, "Europe/Stockholm", "mwl"],
  ["Oslo", "Norway", 59.9139, 10.7522, "Europe/Oslo", "mwl"],
  ["Copenhagen", "Denmark", 55.6761, 12.5683, "Europe/Copenhagen", "mwl"],
  ["Reykjavik", "Iceland", 64.1466, -21.9426, "Atlantic/Reykjavik", "mwl"],
  ["Sarajevo", "Bosnia and Herzegovina", 43.8563, 18.4131, "Europe/Sarajevo", "mwl"],
  ["Moscow", "Russia", 55.7558, 37.6173, "Europe/Moscow", "russia"],
  ["Kazan", "Russia", 55.7887, 49.1221, "Europe/Moscow", "russia"],
  ["New York", "United States", 40.7128, -74.006, "America/New_York", "isna"],
  ["Chicago", "United States", 41.8781, -87.6298, "America/Chicago", "isna"],
  ["Houston", "United States", 29.7604, -95.3698, "America/Chicago", "isna"],
  ["Dearborn", "United States", 42.3223, -83.1763, "America/Detroit", "isna"],
  ["Los Angeles", "United States", 34.0522, -118.2437, "America/Los_Angeles", "isna"],
  ["Toronto", "Canada", 43.6532, -79.3832, "America/Toronto", "isna"],
  ["Montreal", "Canada", 45.5017, -73.5673, "America/Toronto", "isna"],
  ["Vancouver", "Canada", 49.2827, -123.1207, "America/Vancouver", "isna"],
  ["Sao Paulo", "Brazil", -23.5505, -46.6333, "America/Sao_Paulo", "mwl"],
  ["Sydney", "Australia", -33.8688, 151.2093, "Australia/Sydney", "mwl"],
  ["Melbourne", "Australia", -37.8136, 144.9631, "Australia/Melbourne", "mwl"],
  ["Auckland", "New Zealand", -36.8485, 174.7633, "Pacific/Auckland", "mwl"]
]

function cityEntry(row) {
  return { name: row[0], country: row[1], lat: row[2], lon: row[3], timezone: row[4], method: row[5] }
}

function normalizeName(value) {
  return String(value === undefined || value === null ? "" : value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// "Istanbul", "istanbul", "Istanbul, Turkey" and "İstanbul" all find the same
// row; a bare country name is not a city, so it finds nothing.
function findCity(name) {
  var wanted = normalizeName(String(name || "").split(",")[0])
  if (wanted === "") return null
  for (var i = 0; i < CITIES.length; i++)
    if (normalizeName(CITIES[i][0]) === wanted) return cityEntry(CITIES[i])
  return null
}

function cityForTimezone(timezone) {
  var wanted = String(timezone || "")
  if (wanted === "") return null
  for (var i = 0; i < CITIES.length; i++)
    if (CITIES[i][4] === wanted) return cityEntry(CITIES[i])
  return null
}

// A method for a place that is not in the table, from its time zone's region:
// ISNA across the Americas, the League everywhere else.
function methodForTimezone(timezone) {
  var zone = String(timezone || "")
  if (zone.indexOf("America/") === 0) return "isna"
  return "mwl"
}

function methodLabels() {
  var labels = [AUTO_METHOD_LABEL]
  for (var i = 0; i < METHOD_IDS.length; i++) labels.push(METHODS[METHOD_IDS[i]].label)
  return labels
}

// The id for a setting value: a label from the enum, or the id itself so a
// hand-written "karachi" in shell.json works too. null means "choose for me".
function methodId(value) {
  var text = String(value === undefined || value === null ? "" : value).trim()
  if (text === "" || text === AUTO_METHOD_LABEL || text.toLowerCase() === "auto") return null
  for (var i = 0; i < METHOD_IDS.length; i++) {
    var id = METHOD_IDS[i]
    if (text === METHODS[id].label || text.toLowerCase() === id) return id
  }
  return null
}

// ---- Settings parsing. These take the raw values from shell.json, which may
//      be strings typed by hand, and never throw.

// "41.0082", "41,0082" (decimal comma) and "41.0082 N" / "28.9784 W" all
// parse. Out-of-range or empty input is null, not 0: 0,0 is a real place in
// the Gulf of Guinea, and a typo must not silently put anyone there.
function parseCoordinate(value, limit) {
  if (value === undefined || value === null) return null
  var text = String(value).trim().replace(",", ".")
  var match = /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([nsew])?$/i.exec(text)
  if (!match) return null
  var number = parseFloat(match[1])
  var hemisphere = (match[2] || "").toLowerCase()
  if (hemisphere === "s" || hemisphere === "w") number = -Math.abs(number)
  if (!isFinite(number) || Math.abs(number) > limit) return null
  return number
}

function parseLatitude(value) { return parseCoordinate(value, 90) }
function parseLongitude(value) { return parseCoordinate(value, 180) }

function parseOffset(value) {
  var n = parseInt(value, 10)
  if (!isFinite(n)) return 0
  return Math.max(-60, Math.min(60, n))
}

var ASR_LABELS = { standard: "Standard (Shafi'i, Maliki, Hanbali)", hanafi: "Hanafi" }
var HIGH_LAT_LABELS = {
  auto: "Auto",
  none: "None",
  middle: "Middle of the night",
  seventh: "One-seventh of the night",
  angle: "Angle-based"
}

function asrId(value) {
  return String(value) === ASR_LABELS.hanafi || String(value).toLowerCase() === "hanafi" ? "hanafi" : "standard"
}

function highLatId(value) {
  var text = String(value === undefined || value === null ? "" : value)
  for (var id in HIGH_LAT_LABELS)
    if (text === HIGH_LAT_LABELS[id] || text.toLowerCase() === id) return id
  return "auto"
}

// Where the prayer times are for: explicit coordinates win, then a named
// city, then the city that matches the system time zone. `source` says which,
// so the panel can tell the user when it is only guessing.
function resolveLocation(city, latitude, longitude, systemTimezone) {
  var lat = parseLatitude(latitude)
  var lon = parseLongitude(longitude)
  var named = findCity(city)
  var cityText = String(city === undefined || city === null ? "" : city).trim()

  if (lat !== null && lon !== null) {
    return {
      name: cityText !== "" ? cityText : "Custom location",
      lat: lat, lon: lon, source: "coordinates",
      method: named ? named.method : methodForTimezone(systemTimezone),
      timezone: String(systemTimezone || "")
    }
  }
  if (named) {
    return { name: named.name, lat: named.lat, lon: named.lon, source: "city", method: named.method, timezone: named.timezone }
  }
  var guess = cityForTimezone(systemTimezone)
  if (guess) {
    return { name: guess.name, lat: guess.lat, lon: guess.lon, source: "timezone", method: guess.method, timezone: guess.timezone }
  }
  return null
}

// ---- Astronomy.
function rad(degrees) { return degrees * Math.PI / 180 }
function deg(radians) { return radians * 180 / Math.PI }
function fixAngle(a) { return a - 360 * Math.floor(a / 360) }
function fixHour(h) { return h - 24 * Math.floor(h / 24) }

// Julian day at 0h UT of a Gregorian date (month 1-12).
function julian(year, month, day) {
  if (month <= 2) { year -= 1; month += 12 }
  var a = Math.floor(year / 100)
  var b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5
}

// Declination (degrees) and equation of time (hours) at a Julian day.
function sunPosition(jd) {
  var d = jd - 2451545.0
  var g = fixAngle(357.529 + 0.98560028 * d)
  var q = fixAngle(280.459 + 0.98564736 * d)
  var l = fixAngle(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)))
  var e = 23.439 - 0.00000036 * d
  var ra = fixHour(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15)
  return {
    declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))),
    equation: q / 15 - ra
  }
}

function midDay(jd, t) {
  return fixHour(12 - sunPosition(jd + t).equation)
}

// Hours from solar noon until the sun is `angle` degrees below the horizon.
// NaN when it never gets that far down (high latitudes in summer).
function angleTime(jd, lat, angle, t, ccw) {
  var decl = sunPosition(jd + t).declination
  var cosine = (-Math.sin(rad(angle)) - Math.sin(rad(lat)) * Math.sin(rad(decl))) /
    (Math.cos(rad(lat)) * Math.cos(rad(decl)))
  var hours = deg(Math.acos(cosine)) / 15
  return midDay(jd, t) + (ccw ? -hours : hours)
}

function asrTime(jd, lat, factor, t) {
  var decl = sunPosition(jd + t).declination
  var angle = -deg(Math.atan(1 / (factor + Math.tan(rad(Math.abs(lat - decl))))))
  return angleTime(jd, lat, angle, t, false)
}

function timeDiff(a, b) { return fixHour(b - a) }

function nightPortion(mode, angle, night) {
  var portion = 1 / 2
  if (mode === "angle") portion = (1 / 60) * angle
  else if (mode === "seventh") portion = 1 / 7
  return portion * night
}

// Where the sun never gets low enough for Fajr or Isha, or does so absurdly
// close to sunrise or sunset, the time is taken as a share of the night.
function adjustHighLatitude(time, base, angle, night, mode, ccw) {
  var portion = nightPortion(mode, angle, night)
  var diff = ccw ? timeDiff(time, base) : timeDiff(base, time)
  if (isNaN(time) || diff > portion) return base + (ccw ? -portion : portion)
  return time
}

function defaultHighLatitudeMode(lat) {
  return Math.abs(lat) > 48 ? "angle" : "none"
}

// All six times for one calendar date at a place, as Dates (null when the sun
// does not rise or set that day). `options`:
//   year, month (0-11), day, lat, lon,
//   method (id), asr ("standard"|"hanafi"), highLat, ramadan (bool),
//   offsets ({ fajr, sunrise, dhuhr, asr, maghrib, isha } in minutes)
function compute(options) {
  var method = METHODS[options.method] || METHODS.mwl
  var lat = options.lat
  var lon = options.lon
  var jd = julian(options.year, options.month + 1, options.day) - lon / (15 * 24)
  var asrFactor = options.asr === "hanafi" ? 2 : 1

  var ishaIsMinutes = typeof method.isha === "object"
  var ishaAngle = ishaIsMinutes ? 0 : method.isha
  var maghribAngle = method.maghrib !== undefined ? method.maghrib : 0

  // The sun's position moves a little between estimates, so each time is
  // recomputed from the last estimate until it settles (a few passes bring it
  // to well under a second).
  var DEFAULTS = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 }
  var maghribBelow = method.maghrib !== undefined ? maghribAngle : RISE_SET_ANGLE
  var estimate = function(t) {
    return {
      fajr: angleTime(jd, lat, method.fajr, t.fajr / 24, true),
      sunrise: angleTime(jd, lat, RISE_SET_ANGLE, t.sunrise / 24, true),
      dhuhr: midDay(jd, t.dhuhr / 24),
      asr: asrTime(jd, lat, asrFactor, t.asr / 24),
      sunset: angleTime(jd, lat, RISE_SET_ANGLE, t.sunset / 24, false),
      maghrib: angleTime(jd, lat, maghribBelow, t.maghrib / 24, false),
      isha: ishaIsMinutes ? 0 : angleTime(jd, lat, ishaAngle, t.isha / 24, false)
    }
  }
  var t = DEFAULTS
  for (var pass = 0; pass < 2; pass++) {
    t = estimate(t)
    // A NaN estimate (the sun does not reach that angle) would poison the
    // next pass, so it restarts from the default for that prayer.
    for (var key in t) if (isNaN(t[key])) t[key] = DEFAULTS[key]
  }
  // The last pass keeps its NaNs: they mean "no such time today".
  var times = estimate(t)

  // Hours so far are solar-time hours at the place; shifting by the
  // longitude turns them into UT hours, which become exact instants below.
  var shift = -lon / 15
  for (var name in times) times[name] += shift


  var mode = options.highLat === undefined || options.highLat === "auto" ? defaultHighLatitudeMode(lat) : options.highLat
  if (mode !== "none") {
    var night = timeDiff(times.sunset, times.sunrise)
    times.fajr = adjustHighLatitude(times.fajr, times.sunrise, method.fajr, night, mode, true)
    if (!ishaIsMinutes) times.isha = adjustHighLatitude(times.isha, times.sunset, ishaAngle, night, mode, false)
    if (method.maghrib !== undefined) times.maghrib = adjustHighLatitude(times.maghrib, times.sunset, maghribAngle, night, mode, false)
  }

  if (ishaIsMinutes) {
    var gap = options.ramadan && method.isha.ramadanMinutes ? method.isha.ramadanMinutes : method.isha.minutes
    times.isha = times.maghrib + gap / 60
  }

  var offsets = options.offsets || {}
  var base = Date.UTC(options.year, options.month, options.day)
  var result = {}
  var keys = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
  for (var i = 0; i < keys.length; i++) {
    var hours = times[keys[i]]
    if (isNaN(hours) || !isFinite(hours)) { result[keys[i]] = null; continue }
    var minutes = Math.round(hours * 60) + ((method.adjust || {})[keys[i]] || 0) + parseOffset(offsets[keys[i]])
    result[keys[i]] = new Date(base + minutes * MS_PER_MINUTE)
  }
  return result
}

// ---- What the widget shows.

var PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
var DISPLAY_ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
var NAMES = { fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" }

// Dhuhr is the Friday congregational prayer on Fridays.
function prayerName(key, date) {
  if (key === "dhuhr" && date && date.getDay() === 5) return "Jumu'ah"
  return NAMES[key] || key
}

function addDays(year, month, day, delta) {
  var d = new Date(Date.UTC(year, month, day + delta))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
}

// The next prayer after `now`, and the one in progress. After Isha the next
// prayer is tomorrow's Fajr. `forDate(year, month, day)` returns that day's
// times, so the caller decides how Ramadan and settings apply.
function upcoming(now, forDate) {
  var y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  var today = forDate(y, m, d)
  var next = null
  var current = null
  for (var i = 0; i < PRAYERS.length; i++) {
    var at = today[PRAYERS[i]]
    if (!at) continue
    if (at.getTime() > now.getTime()) { if (!next) next = { key: PRAYERS[i], at: at, tomorrow: false } }
    else current = PRAYERS[i]
  }
  if (!next) {
    var t = addDays(y, m, d, 1)
    var tomorrow = forDate(t.year, t.month, t.day)
    if (tomorrow.fajr) next = { key: "fajr", at: tomorrow.fajr, tomorrow: true }
  }
  if (!current) {
    // Before Fajr: Isha from last night is still the prayer in progress.
    var p = addDays(y, m, d, -1)
    var yesterday = forDate(p.year, p.month, p.day)
    if (yesterday.isha && yesterday.isha.getTime() <= now.getTime()) current = "isha"
  }
  return { today: today, next: next, current: current }
}

// Which prayer's reminder is due in the minute `now` falls in, or null.
// A reminder fires `lead` minutes before the prayer (0 = at the prayer), once,
// at the minute boundary, so a clock that ticks every minute never misses it
// and a shell restarted later does not replay the ones already past.
function reminderDue(times, now, lead) {
  var minute = Math.floor(now.getTime() / MS_PER_MINUTE)
  var ahead = Math.max(0, Math.min(60, parseInt(lead, 10) || 0))
  for (var i = 0; i < PRAYERS.length; i++) {
    var at = times && times[PRAYERS[i]]
    if (at && Math.floor(at.getTime() / MS_PER_MINUTE) - ahead === minute) return { key: PRAYERS[i], at: at, lead: ahead }
  }
  return null
}

// "2h 05m", "12m", "now" -- from a gap in milliseconds.
function countdown(ms) {
  var minutes = Math.ceil(ms / MS_PER_MINUTE)
  if (minutes <= 0) return "now"
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  if (h === 0) return m + "m"
  return h + "h " + (m < 10 ? "0" : "") + m + "m"
}

function formatClock(date, hour12) {
  if (!date) return "—"
  var h = date.getHours()
  var m = date.getMinutes()
  var mm = (m < 10 ? "0" : "") + m
  if (!hour12) return (h < 10 ? "0" : "") + h + ":" + mm
  return (h % 12 === 0 ? 12 : h % 12) + ":" + mm + " " + (h < 12 ? "AM" : "PM")
}

// Whether the system locale writes time on a 12-hour clock. `timeFormat` is
// the locale's short time format, e.g. "h:mm AP" or "HH:mm".
function localeUses12Hour(timeFormat) {
  return /AP|ap|\ba\b|\bA\b/.test(String(timeFormat || "").replace(/'[^']*'/g, ""))
}

function hour12For(setting, timeFormat) {
  var text = String(setting === undefined || setting === null ? "" : setting).toLowerCase()
  if (text.indexOf("12") === 0) return true
  if (text.indexOf("24") === 0) return false
  return localeUses12Hour(timeFormat)
}

// Gregorian date the Hijri calendar should read from: Islamic days begin at
// Maghrib, so after it the date is already tomorrow's.
function hijriReadingDate(now, maghrib, mode) {
  if (mode !== "maghrib" || !maghrib || now.getTime() < maghrib.getTime()) return now
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, now.getHours(), now.getMinutes())
}

// Substitutes the prayer placeholders {np} (next prayer), {nt} (its time) and
// {nr} (time left) into a Qt date format, single-quoted so Qt prints them
// as-is -- the same contract as Model.hijriFormat. With no information (the
// feature is off, or no location) the placeholders are removed.
function prayerFormat(format, info) {
  var text = String(format)
  if (text.indexOf("{n") === -1) return text
  var values = info && info.next
    ? { p: info.next.name, t: info.next.time, r: info.next.remaining }
    : null
  return text.replace(/\{n(p|t|r)\}/g, function(match, token) {
    if (!values) return ""
    return "'" + String(values[token]).replace(/'/g, "''") + "'"
  })
}

if (typeof module !== "undefined") {
  module.exports = {
    METHODS: METHODS,
    METHOD_IDS: METHOD_IDS,
    CITIES: CITIES,
    AUTO_METHOD_LABEL: AUTO_METHOD_LABEL,
    ASR_LABELS: ASR_LABELS,
    HIGH_LAT_LABELS: HIGH_LAT_LABELS,
    PRAYERS: PRAYERS,
    DISPLAY_ORDER: DISPLAY_ORDER,
    methodLabels: methodLabels,
    methodId: methodId,
    asrId: asrId,
    highLatId: highLatId,
    findCity: findCity,
    cityForTimezone: cityForTimezone,
    methodForTimezone: methodForTimezone,
    resolveLocation: resolveLocation,
    parseCoordinate: parseCoordinate,
    parseLatitude: parseLatitude,
    parseLongitude: parseLongitude,
    parseOffset: parseOffset,
    compute: compute,
    upcoming: upcoming,
    prayerName: prayerName,
    countdown: countdown,
    reminderDue: reminderDue,
    formatClock: formatClock,
    localeUses12Hour: localeUses12Hour,
    hour12For: hour12For,
    hijriReadingDate: hijriReadingDate,
    prayerFormat: prayerFormat
  }
}
