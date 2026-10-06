/**
 * travel.js — estimeret køretid og analyse af transportbehov.
 *
 * MOCK: Køretiderne er håndindtastede skøn (minutter i bil) mellem udvalgte
 * danske byer. Ingen rigtig ruteplanlægning. Kan senere erstattes af fx
 * Google Routes API eller Bing/Azure Maps — kun travelMinutes() skal ændres.
 */

/** Ekstra minutter til parkering, gåtur ind ad døren osv. */
export const PARKING_BUFFER_MIN = 10;

/** Brugt når en byparring ikke findes i tabellen. */
const DEFAULT_MINUTES = 60;

/** Symmetrisk tabel: køretid i minutter. */
const TABLE = {
  Fredericia: { Kolding: 20, Vejle: 25, Aarhus: 70, Odense: 45, Billund: 45, 'København': 150, Horsens: 40, Middelfart: 15 },
  Kolding: { Vejle: 25, Aarhus: 80, Odense: 55, Billund: 40, 'København': 160, Horsens: 45, Middelfart: 20 },
  Vejle: { Aarhus: 55, Odense: 60, Billund: 30, 'København': 165, Horsens: 25, Middelfart: 30 },
  Aarhus: { Odense: 105, Billund: 75, 'København': 180, Horsens: 35, Middelfart: 80 },
  Odense: { Billund: 75, 'København': 100, Horsens: 80, Middelfart: 30 },
  Billund: { 'København': 180, Horsens: 50, Middelfart: 55 },
  'København': { Horsens: 175, Middelfart: 125 },
  Horsens: { Middelfart: 50 },
};

/** Ren køretid mellem to byer (uden parkeringsbuffer). */
export function travelMinutes(from, to) {
  if (!from || !to || from === to) return 0;
  return TABLE[from]?.[to] ?? TABLE[to]?.[from] ?? DEFAULT_MINUTES;
}

const isPhysical = (m) => m.location?.type === 'physical';
const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;

/**
 * Finder steder hvor der bør blokeres transporttid.
 *
 * Regler (pr. dag, møderne sorteret efter starttid):
 *  - "Nuværende position" er kontoret ved dagens start, og derefter byen for
 *    det seneste fysiske møde. Online-møder (Teams o.l.) flytter ham ikke,
 *    men optager tid.
 *  - For hvert fysisk møde i en anden by end nuværende position beregnes
 *    behovet = køretid + parkeringsbuffer.
 *  - Tilgængelig tid = mødestart minus slut på forrige aftale (uanset type),
 *    eller minus arbejdsdagens start, hvis det er dagens første aftale.
 *  - Er tilgængelig tid < behov, foreslås en blok.
 *
 * @param {Array} meetings  Møder (kan spænde over flere dage)
 * @param {Object} opts     { office: 'Fredericia',
 *                            dayKeyOf: (isoString) => 'YYYY-MM-DD',
 *                            dayStartOf: (dayKey) => Date  // arbejdsdagens start }
 * @returns {Array} forslag: { id, meetingId, dayKey, from, to, fromOffice, travelMin,
 *                            neededMin, availableMin, afterMeeting, blockStart, blockEnd, conflict }
 *          Overgange med tid nok returneres også, men med conflict=false (vises som info).
 */
export function analyseTransport(meetings, { office, dayKeyOf, dayStartOf }) {
  const byDay = new Map();
  [...meetings]
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .forEach((m) => {
      const k = dayKeyOf(m.start);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(m);
    });

  const results = [];
  for (const [dayKey, list] of byDay) {
    let position = office;
    let fromOffice = true;
    let prevEnd = dayStartOf(dayKey).toISOString();
    let afterMeeting = false; // false = regnet fra arbejdsdagens start

    for (const m of list) {
      if (isPhysical(m) && m.location.city !== position) {
        const travelMin = travelMinutes(position, m.location.city);
        const neededMin = travelMin + PARKING_BUFFER_MIN;
        const availableMin = Math.round(minutesBetween(prevEnd, m.start));
        const blockStart = new Date(new Date(m.start) - neededMin * 60000).toISOString();
        results.push({
          id: `tb-${m.id}`,
          meetingId: m.id,
          dayKey,
          from: position,
          to: m.location.city,
          fromOffice,
          travelMin,
          neededMin,
          availableMin,
          afterMeeting,
          blockStart,
          blockEnd: m.start,
          conflict: availableMin < neededMin,
        });
      }
      if (isPhysical(m)) {
        position = m.location.city;
        fromOffice = false;
      }
      if (new Date(m.end) > new Date(prevEnd)) prevEnd = m.end;
      afterMeeting = true;
    }
  }
  return results;
}
