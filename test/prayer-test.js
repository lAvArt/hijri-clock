// Run with: node test/prayer-test.js
const assert = require("assert")
const fs = require("fs")
const path = require("path")
const P = require("../Prayer.js")
const M = require("../Model.js")

let passed = 0
function test(name, fn) {
  try { fn(); passed++ } catch (e) { console.error("FAIL " + name + "\n  " + e.message); process.exitCode = 1 }
}
const utc = (d) => d.toISOString().slice(11, 16)

// Reference values from the Aladhan public API (timezonestring=UTC), checked
// when the calculator was written. A minute either way is rounding.
function near(actual, expected, label) {
  const [ah, am] = actual.split(":").map(Number)
  const [eh, em] = expected.split(":").map(Number)
  assert.ok(Math.abs(ah * 60 + am - (eh * 60 + em)) <= 1, label + ": " + actual + " vs " + expected)
}

test("Makkah, Umm al-Qura, 2026-10-24", () => {
  const t = P.compute({ year: 2026, month: 9, day: 24, lat: 21.4225, lon: 39.8262, method: "makkah", asr: "standard" })
  near(utc(t.fajr), "02:03", "fajr"); near(utc(t.sunrise), "03:20", "sunrise"); near(utc(t.dhuhr), "09:05", "dhuhr")
  near(utc(t.asr), "12:23", "asr"); near(utc(t.maghrib), "14:50", "maghrib"); near(utc(t.isha), "16:20", "isha")
})

test("Umm al-Qura keeps Isha 120 minutes after Maghrib in Ramadan", () => {
  const args = { year: 2026, month: 2, day: 5, lat: 21.4225, lon: 39.8262, method: "makkah" }
  const normal = P.compute(Object.assign({ ramadan: false }, args))
  const ramadan = P.compute(Object.assign({ ramadan: true }, args))
  assert.strictEqual((normal.isha - normal.maghrib) / 60000, 90)
  assert.strictEqual((ramadan.isha - ramadan.maghrib) / 60000, 120)
})

test("Diyanet adds its published minutes (Istanbul 2026-10-24)", () => {
  const c = P.findCity("Istanbul")
  const t = P.compute({ year: 2026, month: 9, day: 24, lat: c.lat, lon: c.lon, method: "turkey", asr: "standard" })
  const plain = P.compute({ year: 2026, month: 9, day: 24, lat: c.lat, lon: c.lon, method: "mwl", asr: "standard" })
  assert.strictEqual((t.dhuhr - plain.dhuhr) / 60000, 5)
  assert.strictEqual((t.maghrib - plain.maghrib) / 60000, 7)
  assert.strictEqual((t.sunrise - plain.sunrise) / 60000, -7)
})

test("Hanafi Asr is later than standard", () => {
  const a = { year: 2026, month: 5, day: 21, lat: 33.6844, lon: 73.0479, method: "karachi" }
  const std = P.compute(Object.assign({ asr: "standard" }, a))
  const han = P.compute(Object.assign({ asr: "hanafi" }, a))
  assert.ok(han.asr > std.asr)
})

test("manual offsets move one prayer and nothing else", () => {
  const a = { year: 2026, month: 9, day: 24, lat: 51.5074, lon: -0.1278, method: "mwl", asr: "standard" }
  const base = P.compute(a)
  const moved = P.compute(Object.assign({ offsets: { isha: 10, fajr: "-3" } }, a))
  assert.strictEqual((moved.isha - base.isha) / 60000, 10)
  assert.strictEqual((moved.fajr - base.fajr) / 60000, -3)
  assert.strictEqual(+moved.asr, +base.asr)
})

test("high latitude: London at midsummer still has Fajr and Isha, in order", () => {
  const t = P.compute({ year: 2026, month: 5, day: 21, lat: 51.5074, lon: -0.1278, method: "mwl", asr: "standard" })
  for (const k of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) assert.ok(t[k], k)
  assert.ok(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib < t.isha)
})

test("polar day gives null instead of a wrong time", () => {
  const t = P.compute({ year: 2026, month: 5, day: 21, lat: 78.2, lon: 15.6, method: "mwl", asr: "standard", highLat: "none" })
  assert.strictEqual(t.sunrise, null)
})

test("southern hemisphere: Sydney midwinter ordering", () => {
  const c = P.findCity("Sydney")
  const t = P.compute({ year: 2026, month: 5, day: 21, lat: c.lat, lon: c.lon, method: "mwl", asr: "standard" })
  assert.ok(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib < t.isha)
})

test("coordinates parse hand-typed input and reject nonsense", () => {
  assert.strictEqual(P.parseLatitude("41,0082"), 41.0082)
  assert.strictEqual(P.parseLatitude("33.87 S"), -33.87)
  assert.strictEqual(P.parseLongitude("118.24 W"), -118.24)
  assert.strictEqual(P.parseLatitude("91"), null)
  assert.strictEqual(P.parseLatitude(""), null)
  assert.strictEqual(P.parseLongitude("abc"), null)
  assert.strictEqual(P.parseLatitude(undefined), null)
})

test("city lookup ignores case, accents and a trailing country", () => {
  assert.strictEqual(P.findCity("ISTANBUL").name, "Istanbul")
  assert.strictEqual(P.findCity("İstanbul, Turkey").name, "Istanbul")
  assert.strictEqual(P.findCity("São Paulo").name, "Sao Paulo")
  assert.strictEqual(P.findCity("Turkey"), null)
  assert.strictEqual(P.findCity(""), null)
})

test("location resolves: coordinates > city > time zone > nothing", () => {
  assert.strictEqual(P.resolveLocation("Istanbul", "21.4", "39.8", "Europe/London").source, "coordinates")
  assert.strictEqual(P.resolveLocation("Istanbul", "", "", "Europe/London").name, "Istanbul")
  assert.strictEqual(P.resolveLocation("", "", "", "Europe/Istanbul").source, "timezone")
  assert.strictEqual(P.resolveLocation("", "", "", "Mars/Olympus"), null)
  // Only one coordinate typed: not enough, falls through to the city.
  assert.strictEqual(P.resolveLocation("London", "21.4", "", "Europe/Istanbul").name, "London")
  // 0,0 typed on purpose is a real place; empty is not.
  assert.strictEqual(P.resolveLocation("", "0", "0", "").source, "coordinates")
})

test("every city has a valid method, coordinates and a unique name", () => {
  const seen = new Set()
  for (const [name, country, lat, lon, tz, method] of P.CITIES) {
    assert.ok(P.METHODS[method], name + " method " + method)
    assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180, name)
    assert.ok(/^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(tz), name + " tz")
    assert.ok(!seen.has(name), "duplicate " + name); seen.add(name)
    assert.ok(country)
  }
})

test("method labels round-trip and Auto means 'choose for me'", () => {
  for (const id of P.METHOD_IDS) assert.strictEqual(P.methodId(P.METHODS[id].label), id)
  assert.strictEqual(P.methodId(P.AUTO_METHOD_LABEL), null)
  assert.strictEqual(P.methodId("karachi"), "karachi")
  assert.strictEqual(P.methodId("nonsense"), null)
})

test("manifest enums agree with the code's own labels", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"))
  const schema = Object.fromEntries(manifest.barWidget.schema.map((f) => [f.key, f]))
  assert.deepStrictEqual(schema.prayerMethod.options, P.methodLabels())
  assert.deepStrictEqual(schema.prayerAsr.options, [P.ASR_LABELS.standard, P.ASR_LABELS.hanafi])
  assert.deepStrictEqual(schema.prayerHighLatitude.options, Object.values(P.HIGH_LAT_LABELS))
  for (const f of manifest.barWidget.schema) {
    assert.strictEqual(manifest.barWidget.defaults[f.key], f.defaultValue, f.key)
    if (f.options) assert.ok(f.options.includes(f.defaultValue), f.key)
  }
  assert.strictEqual(P.asrId(schema.prayerAsr.defaultValue), "standard")
  assert.strictEqual(P.asrId(P.ASR_LABELS.hanafi), "hanafi")
  assert.strictEqual(P.highLatId(schema.prayerHighLatitude.defaultValue), "auto")
})

test("upcoming(): next prayer, current prayer, and the wrap to tomorrow's Fajr", () => {
  // Compute for London on a day, with the clock walked through the day.
  const forDate = (y, m, d) => P.compute({ year: y, month: m, day: d, lat: 51.5074, lon: -0.1278, method: "mwl", asr: "standard" })
  const day = forDate(2026, 9, 24)
  const at = (date) => P.upcoming(new Date(date.getTime()), forDate)
  const beforeDhuhr = new Date(day.dhuhr.getTime() - 60000)
  assert.strictEqual(at(beforeDhuhr).next.key, "dhuhr")
  assert.strictEqual(at(beforeDhuhr).current, "fajr")
  const afterIsha = new Date(day.isha.getTime() + 60000)
  const n = at(afterIsha)
  assert.strictEqual(n.next.key, "fajr"); assert.strictEqual(n.next.tomorrow, true); assert.strictEqual(n.current, "isha")
})

test("upcoming() before Fajr: Isha from last night is still current", () => {
  const forDate = (y, m, d) => P.compute({ year: y, month: m, day: d, lat: 51.5074, lon: -0.1278, method: "mwl", asr: "standard" })
  // Local-date semantics: use a Date whose local components fall before Fajr.
  const today = forDate(2026, 9, 24)
  const early = new Date(today.fajr.getTime() - 30 * 60000)
  const r = P.upcoming(early, forDate)
  assert.strictEqual(r.next.key, "fajr")
})

test("countdown and clock formatting", () => {
  assert.strictEqual(P.countdown(0), "now")
  assert.strictEqual(P.countdown(-5), "now")
  assert.strictEqual(P.countdown(59 * 1000), "1m")
  assert.strictEqual(P.countdown(12 * 60000), "12m")
  assert.strictEqual(P.countdown(125 * 60000), "2h 05m")
  assert.strictEqual(P.formatClock(null, false), "—")
  const d = new Date(2026, 9, 24, 17, 5)
  assert.strictEqual(P.formatClock(d, false), "17:05")
  assert.strictEqual(P.formatClock(d, true), "5:05 PM")
  assert.strictEqual(P.formatClock(new Date(2026, 9, 24, 0, 7), true), "12:07 AM")
  assert.strictEqual(P.formatClock(new Date(2026, 9, 24, 12, 0), true), "12:00 PM")
})

test("12/24 hour follows the setting, then the locale's own format", () => {
  assert.strictEqual(P.hour12For("12-hour", "HH:mm"), true)
  assert.strictEqual(P.hour12For("24-hour", "h:mm AP"), false)
  assert.strictEqual(P.hour12For("System", "h:mm AP"), true)
  assert.strictEqual(P.hour12For("System", "HH:mm"), false)
  assert.strictEqual(P.hour12For("System", "HH:mm 'at'"), false)
})

test("Jumu'ah replaces Dhuhr on Fridays only", () => {
  assert.strictEqual(P.prayerName("dhuhr", new Date(2026, 9, 23)), "Jumu'ah")
  assert.strictEqual(P.prayerName("dhuhr", new Date(2026, 9, 24)), "Dhuhr")
  assert.strictEqual(P.prayerName("asr", new Date(2026, 9, 23)), "Asr")
})

test("Hijri date moves on at Maghrib only when asked", () => {
  const maghrib = new Date(2026, 9, 24, 17, 50)
  const before = new Date(2026, 9, 24, 17, 0)
  const after = new Date(2026, 9, 24, 18, 0)
  assert.strictEqual(P.hijriReadingDate(after, maghrib, "midnight").getDate(), 24)
  assert.strictEqual(P.hijriReadingDate(before, maghrib, "maghrib").getDate(), 24)
  assert.strictEqual(P.hijriReadingDate(after, maghrib, "maghrib").getDate(), 25)
  assert.strictEqual(P.hijriReadingDate(after, null, "maghrib").getDate(), 24)
  const eom = new Date(2026, 9, 31, 20, 0)
  assert.strictEqual(P.hijriReadingDate(eom, new Date(2026, 9, 31, 17, 0), "maghrib").getMonth(), 10)
  // And through the Hijri table: the reading date's Hijri day is one ahead.
  const h0 = M.hijriForDate(after), h1 = M.hijriForDate(P.hijriReadingDate(after, maghrib, "maghrib"))
  assert.ok(h1.day === h0.day + 1 || h1.day === 1)
})

test("bar placeholders are quoted for Qt, and removed when there is no data", () => {
  const info = { next: { name: "Asr", time: "15:23", remaining: "1h 05m" } }
  assert.strictEqual(P.prayerFormat("HH:mm  ·  {np} {nt}", info), "HH:mm  ·  'Asr' '15:23'")
  assert.strictEqual(P.prayerFormat("{np} 'in' {nr}", info), "'Asr' 'in' '1h 05m'")
  assert.strictEqual(P.prayerFormat("HH:mm {np}", null), "HH:mm ")
  assert.strictEqual(P.prayerFormat("dddd HH:mm", info), "dddd HH:mm")
  assert.strictEqual(P.prayerFormat("{np}", { next: { name: "Jumu'ah", time: "", remaining: "" } }), "'Jumu''ah'")
})

test("week start names written by the panel read back unchanged", () => {
  for (let i = 0; i < 7; i++) assert.strictEqual(M.normalizedWeekStart(M.weekStartSettingName(i), 1), i)
  assert.strictEqual(M.weekStartSettingName(6), "Saturday")
  assert.strictEqual(M.normalizedWeekStart("Locale default", 6), 6)
})

test("reminders fire once, in the right minute, with the lead time", () => {
  const times = P.compute({ year: 2026, month: 9, day: 24, lat: 51.5074, lon: -0.1278, method: "mwl", asr: "standard" })
  const m = 60000
  const at = (d) => P.reminderDue(times, d, 10)
  assert.strictEqual(at(new Date(times.asr - 10 * m)).key, "asr")
  assert.strictEqual(at(new Date(times.asr - 10 * m + 30000)).key, "asr")  // anywhere in that minute
  assert.strictEqual(at(new Date(times.asr - 11 * m)), null)
  assert.strictEqual(at(new Date(times.asr)), null)
  assert.strictEqual(P.reminderDue(times, new Date(times.asr.getTime()), 0).key, "asr")
  assert.strictEqual(at(new Date(times.sunrise - 10 * m)), null)  // sunrise is not a prayer
  assert.strictEqual(P.reminderDue(times, new Date(times.isha), "garbage").key, "isha")  // junk lead means at the prayer
  assert.strictEqual(P.reminderDue(null, new Date(), 10), null)
})

console.log(passed + " passed")
