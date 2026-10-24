// Pure date and format math for the clock widget and its calendar panel.
// Everything here is locale- and Qt-free so it can be unit tested under node
// (test/shell.d/clock-test.sh); the QML owns month/weekday naming through
// Qt.locale().

var MS_PER_DAY = 86400000

// Weekday indices match both JS Date.getDay() and QML's Locale.Sunday…
// Locale.Saturday, so a locale's firstDayOfWeek can be passed straight in.
var WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

// ---- Bar label formats. Right-clicking the clock walks these in order and
//      writes the result back to shell.json, so the label the bar shows and
//      the format the config stores are always the same thing.
//
// The locale-shaped time presets are each followed by their 12-hour twin, so
// the walk from a 24-hour label to the same label in AM/PM is a single right
// click rather than a lap of the ring. The ISO preset is deliberately left
// without one: ISO 8601 writes time on a 24-hour clock, so an AM/PM variant
// would contradict the only thing that format is for.
var CLOCK_FORMATS = [
  "dddd HH:mm",
  "dddd h:mm AP",
  "HH:mm",
  "h:mm AP",
  "ddd d MMM HH:mm",
  "ddd d MMM h:mm AP",
  "d MMMM 'W'ww yyyy",
  "yyyy-MM-dd HH:mm",
  "dddd HH:mm  ·  {hd} {hMMMM} {hy}"
]

// Vertical bars have room for a few stacked lines and nothing else, so the
// ring stays short. AM/PM costs a fourth line, which is why only the plain
// time carries it here.
var VERTICAL_CLOCK_FORMATS = [
  "HH\n—\nmm",
  "h\n—\nmm\nAP",
  "dd\nMMM\n'W'ww\n''yy",
  "HH\nmm"
]

// Offered only while prayer times are on: right-click walks into them after
// the usual formats, so turning the feature off never leaves a label that
// prints blanks.
var PRAYER_CLOCK_FORMATS = [
  "HH:mm  ·  {np} {nt}",
  "HH:mm  ·  {np} 'in' {nr}"
]

function clockFormats(vertical) {
  return vertical ? VERTICAL_CLOCK_FORMATS.slice() : CLOCK_FORMATS.slice()
}

// The presets in a fixed order, plus the configured alternate and current
// format when they are something else. The order must not depend on which
// entry is current: cycling writes the result back to shell.json, and a ring
// that reshuffled itself around the current value would bounce between two
// entries instead of walking.
function clockFormatRing(configured, configuredAlt, presets) {
  var ring = []
  var candidates = (presets || []).concat([configuredAlt, configured])
  for (var i = 0; i < candidates.length; i++) {
    var format = String(candidates[i] === undefined || candidates[i] === null ? "" : candidates[i])
    if (format === "" || ring.indexOf(format) !== -1) continue
    ring.push(format)
  }
  return ring.length > 0 ? ring : ["HH:mm"]
}

// Next entry after `current`. An unknown current format (a hand-written one
// that is not in the ring) starts the walk at the top.
function nextClockFormat(ring, current) {
  if (!ring || ring.length === 0) return ""
  var index = ring.indexOf(String(current === undefined || current === null ? "" : current))
  return ring[(index + 1) % ring.length]
}

// Two-digit ISO week, substituted into a format's 'ww' token before Qt
// formats it -- Qt has no ISO week specifier of its own.
function isoWeekLiteral(year, month, day) {
  return pad2(isoWeek(year, month, day))
}

function pad2(value) {
  var n = Number(value)
  return (n < 10 ? "0" : "") + n
}

// Stable "yyyy-MM-dd" identity for a day, so a grid cell can be compared
// against today without dragging Date objects through bindings.
function dateKey(year, month, day) {
  return year + "-" + pad2(Number(month) + 1) + "-" + pad2(day)
}

function keyForDate(date) {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate())
}

function coerceWeekStart(value) {
  if (value === undefined || value === null) return null
  if (typeof value === "number")
    return isFinite(value) ? ((Math.round(value) % 7) + 7) % 7 : null

  var text = String(value).replace(/^\s+|\s+$/g, "").toLowerCase()
  if (text === "") return null

  for (var i = 0; i < WEEKDAY_NAMES.length; i++)
    if (WEEKDAY_NAMES[i] === text || WEEKDAY_NAMES[i].substr(0, 3) === text) return i

  var parsed = parseInt(text, 10)
  return isFinite(parsed) ? ((parsed % 7) + 7) % 7 : null
}

// Configured week start, falling back to the locale's own first day when
// the setting is missing or nonsense.
function normalizedWeekStart(value, fallback) {
  var configured = coerceWeekStart(value)
  if (configured !== null) return configured
  var fallbackStart = coerceWeekStart(fallback)
  return fallbackStart === null ? 1 : fallbackStart
}

function weekStartSettingName(index) {
  var name = WEEKDAY_NAMES[normalizedWeekStart(index, 1)]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// The toggle flips between the two conventions people actually switch
// between. A calendar configured to any other start (Saturday, say) is
// shown as-is and lands on Monday the first time it is toggled.
function toggledWeekStart(index) {
  return normalizedWeekStart(index, 1) === 1 ? 0 : 1
}

function weekdayOrder(weekStart) {
  var start = normalizedWeekStart(weekStart, 1)
  var out = []
  for (var i = 0; i < 7; i++) out.push((start + i) % 7)
  return out
}

// ISO-8601 week number: the week owning the Thursday of that date's
// Monday-based week. Mirrors the clock widget's 'ww' format token.
function isoWeek(year, month, day) {
  var date = new Date(Date.UTC(year, month, day))
  var weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7)
}

function dayOfYear(year, month, day) {
  return Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY) + 1
}

function daysInYear(year) {
  return dayOfYear(year, 11, 31)
}

// Share of the year already behind you: whole days completed over days in
// the year, so January 1 reads 0% and December 31 reads 100%.
function yearProgress(year, month, day) {
  var total = daysInYear(year)
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, (dayOfYear(year, month, day) - 1) / total))
}

function yearProgressPercent(year, month, day) {
  return Math.round(yearProgress(year, month, day) * 100)
}

// Memento mori. The default span is a round number rather than anything from
// an actuarial table: the point of the bar is the reminder, not the
// arithmetic, and whoever wants a different number can say so.
var DEFAULT_LIFE_EXPECTANCY = 90

// A birth year rather than an age, so the bar keeps counting on its own
// instead of going stale the moment it is entered. 0 means "not set", which
// is also what a blank, malformed, future, or implausibly distant year means.
function parseBirthYear(value, currentYear) {
  var now = Math.round(Number(currentYear))
  if (!isFinite(now)) return 0
  var text = String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
  if (!/^\d{4}$/.test(text)) return 0
  var year = parseInt(text, 10)
  if (!isFinite(year) || year > now || year < now - 120) return 0
  return year
}

// Whole years, the way people say their age: born in 1979 makes you 47 for
// all of 2026, whichever side of your birthday today falls.
function ageFromBirthYear(birthYear, currentYear) {
  var born = parseBirthYear(birthYear, currentYear)
  if (born <= 0) return 0
  return Math.round(Number(currentYear)) - born
}

// 0 means "not set", which is also what a blank, negative, fractional, or
// absurd entry means — the life bar simply stays hidden.
function parseAge(value) {
  var text = String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
  if (!/^\d+$/.test(text)) return 0
  var years = parseInt(text, 10)
  if (!isFinite(years) || years <= 0 || years > 120) return 0
  return years
}

// Unset or nonsense falls back to the default rather than to zero, so the
// bar always has something to measure against.
function parseLifeExpectancy(value) {
  var text = String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
  if (!/^\d+$/.test(text)) return DEFAULT_LIFE_EXPECTANCY
  var years = parseInt(text, 10)
  if (!isFinite(years) || years <= 0 || years > 150) return DEFAULT_LIFE_EXPECTANCY
  return years
}

function lifeProgress(age, expectancy) {
  var years = parseAge(age)
  var span = parseLifeExpectancy(expectancy)
  if (years <= 0 || span <= 0) return 0
  return Math.max(0, Math.min(1, years / span))
}

function lifeProgressPercent(age, expectancy) {
  return Math.round(lifeProgress(age, expectancy) * 100)
}

// Always six rows of seven days. A fixed grid keeps the popup exactly the
// same height in every month, so stepping through the year never makes the
// panel jump under the pointer.
function monthGrid(year, month, weekStart, todayKey) {
  var start = normalizedWeekStart(weekStart, 1)
  var leading = (new Date(year, month, 1).getDay() - start + 7) % 7
  var cursor = new Date(year, month, 1 - leading)
  var today = String(todayKey || "")
  var weeks = []

  for (var w = 0; w < 6; w++) {
    var days = []
    var thursday = null
    for (var d = 0; d < 7; d++) {
      var cellYear = cursor.getFullYear()
      var cellMonth = cursor.getMonth()
      var cellDay = cursor.getDate()
      var weekday = cursor.getDay()
      var key = dateKey(cellYear, cellMonth, cellDay)
      if (weekday === 4) thursday = { year: cellYear, month: cellMonth, day: cellDay }
      days.push({
        key: key,
        year: cellYear,
        month: cellMonth,
        day: cellDay,
        weekday: weekday,
        inMonth: cellMonth === month && cellYear === year,
        weekend: weekday === 0 || weekday === 6,
        today: key === today
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    // Number every row by the ISO week owning its Thursday. That is the
    // definition itself for Monday-start weeks, and the only answer that
    // stays stable for the other starts, where a row straddles two ISO
    // weeks but shares all of Monday through Thursday with one of them.
    var anchor = thursday || days[0]
    weeks.push({
      week: isoWeek(anchor.year, anchor.month, anchor.day),
      days: days
    })
  }
  return weeks
}

function stepMonth(year, month, delta) {
  var target = new Date(year, Number(month) + Number(delta), 1)
  return { year: target.getFullYear(), month: target.getMonth() }
}

// ---- Umm al-Qura Hijri calendar. Qt's JS engine has no Intl, so the month
//      lengths are a table generated from ICU's islamic-umalqura calendar:
//      three hex digits per Hijri year, bit n set when month n has 30 days.
//      Covers 1 Muharram 1400 (1979-11-21) through the end of 1500 AH.
var HIJRI_FIRST_YEAR = 1400
var HIJRI_EPOCH_DAY = Date.UTC(1979, 10, 21) / MS_PER_DAY
var HIJRI_MONTH_BITS = "aa5a4b4979372b6975d69d52c9592b25b4db9d55d2da5d4aa9554daad3aabd2bc4b89a9552d5adb6a6d4dc9d92aa69562ae56d36ab55aaa94d49d95d2ba5b55aad55a9a92e26e55dada6d46a5b27a4d4ad56db5a754f49e92d26a563566b5baab92b2568ba9b55aada5b4da9b52a9a536276575af26d46a95552ad4bd9ba574b69b52a9552da5d4daad96b2e95e2ac9692eaad56ad65d4a"
var HIJRI_YEARS = HIJRI_MONTH_BITS.length / 3
var HIJRI_MONTH_NAMES = [
  "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani", "Jumada al-Ula", "Jumada al-Akhirah",
  "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qa'dah", "Dhu al-Hijjah"
]

// Day number (days since 1970-01-01) of the first day of each Hijri month,
// plus one trailing entry for the day after the table ends.
var hijriMonthStarts = null

function hijriStarts() {
  if (hijriMonthStarts) return hijriMonthStarts
  var starts = [HIJRI_EPOCH_DAY]
  for (var y = 0; y < HIJRI_YEARS; y++) {
    var bits = parseInt(HIJRI_MONTH_BITS.substr(y * 3, 3), 16)
    for (var m = 0; m < 12; m++)
      starts.push(starts[starts.length - 1] + ((bits >> m) & 1 ? 30 : 29))
  }
  hijriMonthStarts = starts
  return starts
}

function hijriMonthName(month) {
  return HIJRI_MONTH_NAMES[((Number(month) % 12) + 12) % 12]
}

function dayNumber(year, month, day) {
  return Math.round(Date.UTC(year, month, day) / MS_PER_DAY)
}

function hijriIndex(year, month) {
  return (Number(year) - HIJRI_FIRST_YEAR) * 12 + Number(month)
}

// Gregorian (local year, 0-based month, day) to { year, month (0-based), day },
// or null outside the table.
function toHijri(year, month, day) {
  var starts = hijriStarts()
  var n = dayNumber(year, month, day)
  if (n < starts[0] || n >= starts[starts.length - 1]) return null
  var lo = 0
  var hi = starts.length - 2
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1
    if (starts[mid] <= n) lo = mid
    else hi = mid - 1
  }
  return { year: HIJRI_FIRST_YEAR + Math.floor(lo / 12), month: lo % 12, day: n - starts[lo] + 1 }
}

function hijriForDate(date) {
  return toHijri(date.getFullYear(), date.getMonth(), date.getDate())
}

// Substitutes the Hijri placeholders {hd} (day), {hMMMM} (month name) and
// {hy} (year) into a Qt date format. Each value is single-quoted so Qt
// prints it as-is instead of reading its letters as format tokens.
function hijriFormat(format, date) {
  var text = String(format)
  if (text.indexOf("{h") === -1) return text
  var hijri = hijriForDate(date)
  if (!hijri) return text.replace(/\{h(d|MMMM|y)\}/g, "")
  var values = { d: String(hijri.day), MMMM: hijriMonthName(hijri.month), y: String(hijri.year) }
  return text.replace(/\{h(d|MMMM|y)\}/g, function(match, token) {
    return "'" + values[token].replace(/'/g, "''") + "'"
  })
}

// Gregorian Date (local midnight) for a Hijri day.
function gregorianForHijri(year, month, day) {
  var n = hijriStarts()[hijriIndex(year, month)] + Number(day) - 1
  var utc = new Date(n * MS_PER_DAY)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

// Same contract as stepMonth, clamped to the months the table covers.
function stepHijriMonth(year, month, delta) {
  var index = Math.max(0, Math.min(HIJRI_YEARS * 12 - 1, hijriIndex(year, month) + Number(delta)))
  return { year: HIJRI_FIRST_YEAR + Math.floor(index / 12), month: index % 12 }
}

// Share of the Hijri year already behind you, like yearProgress.
function hijriYearProgress(hijri) {
  if (!hijri) return 0
  var starts = hijriStarts()
  var yearStart = starts[hijriIndex(hijri.year, 0)]
  var yearEnd = starts[hijriIndex(hijri.year, 0) + 12]
  var today = starts[hijriIndex(hijri.year, hijri.month)] + hijri.day - 1
  return Math.max(0, Math.min(1, (today - yearStart) / (yearEnd - yearStart)))
}

function hijriYearProgressPercent(hijri) {
  return Math.round(hijriYearProgress(hijri) * 100)
}

// monthGrid for a Hijri month: same six rows and cell shape, with `day` the
// Hijri day and `gregorianDay` the civil date under it.
function hijriMonthGrid(year, month, weekStart, todayKey) {
  var start = normalizedWeekStart(weekStart, 1)
  var first = gregorianForHijri(year, month, 1)
  var leading = (first.getDay() - start + 7) % 7
  var cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate() - leading)
  var today = String(todayKey || "")
  var weeks = []

  for (var w = 0; w < 6; w++) {
    var days = []
    var thursday = null
    for (var d = 0; d < 7; d++) {
      var cellYear = cursor.getFullYear()
      var cellMonth = cursor.getMonth()
      var cellDay = cursor.getDate()
      var weekday = cursor.getDay()
      var key = dateKey(cellYear, cellMonth, cellDay)
      var hijri = toHijri(cellYear, cellMonth, cellDay)
      if (weekday === 4) thursday = { year: cellYear, month: cellMonth, day: cellDay }
      days.push({
        key: key,
        year: cellYear,
        month: cellMonth,
        day: hijri ? hijri.day : cellDay,
        gregorianDay: cellDay,
        weekday: weekday,
        inMonth: !!hijri && hijri.year === Number(year) && hijri.month === Number(month),
        weekend: weekday === 0 || weekday === 6,
        today: key === today
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    var anchor = thursday || days[0]
    weeks.push({
      week: isoWeek(anchor.year, anchor.month, anchor.day),
      days: days
    })
  }
  return weeks
}

if (typeof module !== "undefined") {
  module.exports = {
    toHijri: toHijri,
    hijriForDate: hijriForDate,
    hijriMonthName: hijriMonthName,
    gregorianForHijri: gregorianForHijri,
    stepHijriMonth: stepHijriMonth,
    hijriYearProgress: hijriYearProgress,
    hijriYearProgressPercent: hijriYearProgressPercent,
    hijriMonthGrid: hijriMonthGrid,
    dateKey: dateKey,
    keyForDate: keyForDate,
    normalizedWeekStart: normalizedWeekStart,
    weekStartSettingName: weekStartSettingName,
    toggledWeekStart: toggledWeekStart,
    weekdayOrder: weekdayOrder,
    isoWeek: isoWeek,
    dayOfYear: dayOfYear,
    daysInYear: daysInYear,
    yearProgress: yearProgress,
    yearProgressPercent: yearProgressPercent,
    parseAge: parseAge,
    parseBirthYear: parseBirthYear,
    ageFromBirthYear: ageFromBirthYear,
    parseLifeExpectancy: parseLifeExpectancy,
    lifeProgress: lifeProgress,
    lifeProgressPercent: lifeProgressPercent,
    monthGrid: monthGrid,
    stepMonth: stepMonth,
    clockFormats: clockFormats,
    PRAYER_CLOCK_FORMATS: PRAYER_CLOCK_FORMATS,
    clockFormatRing: clockFormatRing,
    nextClockFormat: nextClockFormat,
    isoWeekLiteral: isoWeekLiteral
  }
}
