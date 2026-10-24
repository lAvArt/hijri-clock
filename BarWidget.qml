import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Prayer.js" as Prayer

// Date/time label for the bar, and the host for the calendar popup.
//
// Left click reveals the calendar — asking "what is the date?" is what a
// click on a clock means — right click walks the common label formats, and
// middle click opens the timezone picker.
BarWidget {
  id: root
  moduleName: "io.github.lavart.hijri-clock"

  property date displayDate: clock.date

  readonly property string configuredFormat: vertical
    ? setting("verticalFormat", "HH\n—\nmm")
    : setting("format", "dddd HH:mm  ·  {hd} {hMMMM} {hy}")
  readonly property string configuredAltFormat: vertical
    ? setting("verticalFormatAlt", "dd\nMMM\n'W'ww\n''yy")
    : setting("formatAlt", "d MMMM 'W'ww yyyy")

  readonly property var formatRing: Model.clockFormatRing(configuredFormat, configuredAltFormat, Model.clockFormats(vertical).concat(prayerEnabled && !vertical ? Model.PRAYER_CLOCK_FORMATS : []))

  // ---- Prayer times. Off until asked for; computed offline from the sun's
  //      position (Prayer.js), so there is no network and no location
  //      service. The panel reads `prayer` from here, so the bar label, the
  //      notifications and the panel can never disagree.
  readonly property bool prayerEnabled: String(setting("prayerTimes", "Off")) === "On"
  property string systemTimezone: ""

  readonly property var prayerLocation: prayerEnabled
    ? Prayer.resolveLocation(setting("prayerCity", ""), setting("prayerLatitude", ""), setting("prayerLongitude", ""), systemTimezone)
    : null

  // null when the feature is off; { location: null } when it is on but no
  // place could be worked out yet, which the panel turns into a hint.
  readonly property var prayer: prayerEnabled ? prayerInfo(displayDate) : null

  // Islamic days begin at sunset, so after Maghrib the Hijri date reads as
  // tomorrow's when the user asks for that.
  readonly property date hijriReading: Prayer.hijriReadingDate(
    displayDate,
    prayer && prayer.today ? prayer.today.maghrib : null,
    String(setting("hijriDayChange", "At midnight")) === "At Maghrib" ? "maghrib" : "midnight")

  function prayerInfo(now) {
    var location = prayerLocation
    if (!location) return { location: null }

    var methodId = Prayer.methodId(setting("prayerMethod", Prayer.AUTO_METHOD_LABEL)) || location.method
    var asr = Prayer.asrId(setting("prayerAsr", ""))
    var highLat = Prayer.highLatId(setting("prayerHighLatitude", "Auto"))
    var offsets = {
      fajr: setting("prayerOffsetFajr", 0),
      sunrise: setting("prayerOffsetSunrise", 0),
      dhuhr: setting("prayerOffsetDhuhr", 0),
      asr: setting("prayerOffsetAsr", 0),
      maghrib: setting("prayerOffsetMaghrib", 0),
      isha: setting("prayerOffsetIsha", 0)
    }
    var hour12 = Prayer.hour12For(setting("prayerTimeFormat", "System"), Qt.locale().timeFormat(Locale.ShortFormat))

    var forDate = function(year, month, day) {
      var hijri = Model.toHijri(year, month, day)
      return Prayer.compute({
        year: year, month: month, day: day,
        lat: location.lat, lon: location.lon,
        method: methodId, asr: asr, highLat: highLat,
        ramadan: !!hijri && hijri.month === 8,
        offsets: offsets
      })
    }

    var found = Prayer.upcoming(now, forDate)
    var next = found.next ? {
      key: found.next.key,
      name: Prayer.prayerName(found.next.key, found.next.at),
      time: Prayer.formatClock(found.next.at, hour12),
      remaining: Prayer.countdown(found.next.at.getTime() - now.getTime()),
      at: found.next.at
    } : null

    return {
      location: location,
      methodId: methodId,
      asr: asr,
      hour12: hour12,
      today: found.today,
      current: found.current,
      next: next
    }
  }

  // A quiet reminder per prayer: low urgency, a few seconds on screen, no
  // sound, replacing the previous one rather than stacking. `prayerReminder`
  // minutes before the prayer, or at it when 0.
  property string lastNotifiedKey: ""

  function maybeNotify() {
    if (String(setting("prayerNotify", "Off")) !== "On") return
    var info = prayer
    if (!info || !info.today) return
    var due = Prayer.reminderDue(info.today, displayDate, setting("prayerReminderMinutes", 10))
    if (!due) return
    var id = Model.keyForDate(displayDate) + ":" + due.key
    if (id === lastNotifiedKey) return
    lastNotifiedKey = id
    var name = Prayer.prayerName(due.key, due.at)
    var when = Prayer.formatClock(due.at, info.hour12) + "  ·  " + info.location.name
    notifier.command = [
      "omarchy-notification-send", "-g", "󰥔", "-u", "low", "-t", "8000", "-r", "7731001",
      due.lead > 0 ? name + " in " + due.lead + " min" : name,
      when
    ]
    notifier.running = true
  }

  // Plain text for scripts and keybindings: `qs ipc call … nextPrayer`.
  function nextPrayerText() {
    var info = prayer
    if (!info || !info.next) return ""
    return info.next.name + " " + info.next.time + " (" + info.next.remaining + ")"
  }

  // What the bar shows is what shell.json stores, so a cycled format is the
  // format from then on rather than something that reverts on restart.
  readonly property string activeFormat: configuredFormat
  readonly property string displayText: formatted(displayDate)
  readonly property var verticalLines: displayText.split("\n")

  function refresh() {
    displayDate = new Date()
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

  function cycleFormat() {
    var current = String(configuredFormat)
    var next = Model.nextClockFormat(formatRing, current)
    if (next === "" || next === current) return

    var entry = { id: root.moduleName }
    for (var key in root.settings) if (key !== "id") entry[key] = root.settings[key]
    entry[vertical ? "verticalFormat" : "format"] = next

    // Applied locally first so the label changes on the click itself; the
    // shell.json write comes back through the bar as the same value.
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function formatted(date) {
    // Week numbers first: "Rabi' al-Awwal" has a "ww" of its own. The Hijri
    // date reads from hijriReading, which only differs from the clock after
    // Maghrib; prayer placeholders go last, quoted, so Qt prints them as-is.
    var week = activeFormat.replace(/ww/g, Model.isoWeekLiteral(date.getFullYear(), date.getMonth(), date.getDate()))
    var hijri = Model.hijriFormat(week, hijriReading)
    return Qt.formatDateTime(date, Prayer.prayerFormat(hijri, prayer))
  }

  // ---- Calendar popup. Shape contract for shell.summon/hide/toggle
  //      routing: Bar.findPanelWidget requires open/close/opened on the
  //      bar-widget root.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function toggleWeekStart() {
    if (panelLoader.item) panelLoader.item.toggleWeekStart()
  }

  // The clock fills more slot than it paints a mark for, at both
  // orientations: horizontally it is a text label in a padded slot, so the
  // dot takes the label width; vertically it is a stack of icon-sized lines,
  // so the dot takes one line — the same mark every icon widget gets, rather
  // than a rule running the height of the whole stack.
  readonly property real openPanelIndicatorWidth: button.labelWidth
  readonly property real openPanelIndicatorHeight: Math.max(Style.space(10), Math.round(Style.bar.iconSlot * 0.55))

  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: Bar.requestPopout prefers closeForPopoutSwitch over close, and
  // KeyboardPanel reads popoutSwitchClosing back off its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: {
      root.displayDate = date
      root.maybeNotify()
    }
  }

  // The system time zone picks a default city when none is configured. Asked
  // of systemd once, and only when prayer times are on.
  Process {
    id: timezoneProbe
    command: ["timedatectl", "show", "-p", "Timezone", "--value"]
    running: root.prayerEnabled && root.systemTimezone === ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.systemTimezone = text.trim()
    }
  }

  Process {
    id: notifier
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: "io.github.lavart.hijri-clock"

    function refresh(): void { root.broadcast("refresh") }
    function cycleFormat(): void { root.cycleFormat() }
    function toggleWeekStart(): void { root.toggleWeekStart() }
    function nextPrayer(): string { return root.nextPrayerText() }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.vertical ? "" : root.displayText
    labelVisible: !root.vertical
    hasVisualContent: root.vertical ? root.verticalLines.length > 0 : text !== ""
    fixedHeight: root.vertical ? root.verticalLines.length * Style.bar.iconSlot : -1
    horizontalMargin: 8.75
    verticalPadding: 8.75

    onPressed: function(b) {
      if (b === Qt.RightButton) root.cycleFormat()
      else if (b === Qt.MiddleButton) { if (root.bar) root.bar.run("omarchy-menu-timezone") }
      else root.togglePanel()
    }

    Column {
      visible: root.vertical
      anchors.fill: parent

      Repeater {
        model: root.verticalLines

        OpticalGlyph {
          required property string modelData
          width: button.width
          height: Style.bar.iconSlot
          text: modelData
          fontFamily: button.fontFamily
          fontSize: modelData.length > 3
            ? button.fontSize * 0.9
            : button.fontSize
          color: button.foreground
        }
      }
    }
  }
}
