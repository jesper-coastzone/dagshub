/**
 * mock.js — fiktive testdata, genereret relativt til dags dato.
 *
 * ALLE kunder, personer og mails her er opdigtede. Data genereres ved hver
 * indlæsning ud fra dagens dato (dansk tid), så appen altid ser "levende" ud.
 * Id'er indeholder datoen, så fx "logget i HubSpot"-flag naturligt nulstilles
 * fra dag til dag.
 *
 * Når rigtige connectors kobles på, er det kun js/api.js, der skal ændres —
 * views kender ikke til denne fil.
 */

import {
  cphDate, dateKey, addDaysKey, weekdayOfKey,
} from '../js/utils.js';

/** Kontorets placering — bruges som udgangspunkt for transporttid. */
export const OFFICE = { city: 'Fredericia', address: 'Kystlab A/S, Havnegade 1, Fredericia (fiktiv)' };

/** Arbejdsdagen antages at starte her (kontoret), hvis der ikke er andre aftaler. */
export const WORKDAY_START = { hour: 8, minute: 0 };

/* ------------------------------------------------------------------ */
/* Personer og kunder (fiktive)                                        */
/* ------------------------------------------------------------------ */

const P = {
  me: { name: 'Dig selv', org: 'Kystlab', self: true },
  mette: { name: 'Mette Holm', org: 'Kystlab' },
  anders: { name: 'Anders Krogh', org: 'Kystlab' },
  line: { name: 'Line Brandt', org: 'Nordlys Energi' },
  soren: { name: 'Søren Vestergaard', org: 'Nordlys Energi' },
  karin: { name: 'Karin Dahl', org: 'Fjordhavn Kommune' },
  ib: { name: 'Ib Thygesen', org: 'Fjordhavn Kommune' },
  nanna: { name: 'Nanna Friis', org: 'Havbris Logistik' },
  peter: { name: 'Peter Lund', org: 'Klitgaard Byg' },
  ane: { name: 'Ane Mørk', org: 'Bølgelab ApS' },
  thomas: { name: 'Thomas Riis', org: 'Strandvejen Foods' },
  helle: { name: 'Helle Bach', org: 'Saltvand Rådgivning' },
};

/* ------------------------------------------------------------------ */
/* Hjælpere                                                            */
/* ------------------------------------------------------------------ */

/** Bygger et mødeobjekt på en given dato-nøgle. Tider er dansk vægur-tid. */
function meeting(key, idx, start, end, data) {
  const [y, m, d] = key.split('-').map(Number);
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return {
    id: `m-${key}-${idx}`,
    start: cphDate(y, m, d, sh, sm).toISOString(),
    end: cphDate(y, m, d, eh, em).toISOString(),
    ...data,
  };
}

const physical = (city, address) => ({ type: 'physical', city, address });
const online = (label = 'Microsoft Teams') => ({ type: 'online', label });

/* ------------------------------------------------------------------ */
/* Møder i dag                                                         */
/* ------------------------------------------------------------------ */

export function mockTodayMeetings(today = dateKey()) {
  return [
    meeting(today, 1, '08:30', '09:00', {
      title: 'Morgenkoordinering, salg & produkt',
      client: 'Kystlab (internt)',
      location: online(),
      attendees: [P.me, P.mette, P.anders],
      agenda: 'Status på pipeline og ugens leverancer.',
    }),
    meeting(today, 2, '10:00', '11:00', {
      title: 'Opfølgning på pilotprojekt',
      client: 'Nordlys Energi',
      location: physical('Kolding', 'Nordlys Energi, Kystvej 12, Kolding'),
      attendees: [P.me, P.line, P.soren],
      agenda: 'Gennemgang af pilotresultater og næste fase.',
      hubspotDealId: 'deal-1001',
    }),
    meeting(today, 3, '13:00', '14:00', {
      title: 'Kystsikring, workshop 2',
      client: 'Fjordhavn Kommune',
      location: physical('Vejle', 'Fjordhavn Kommune, Rådhustorvet 3, Vejle'),
      attendees: [P.me, P.karin, P.ib, P.mette],
      agenda: 'Krav til dataopsamling og tidsplan for udbud.',
      hubspotDealId: 'deal-1002',
    }),
    meeting(today, 4, '15:30', '16:00', {
      title: 'Afklaring af tilbud',
      client: 'Havbris Logistik',
      location: online(),
      attendees: [P.me, P.nanna],
      agenda: 'Spørgsmål til prisbilag og leveringsbetingelser.',
      hubspotDealId: 'deal-1003',
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Næste uges møder (mandag–fredag)                                    */
/* ------------------------------------------------------------------ */

/** Mandag i næste uge set fra i dag (søndag → i morgen). */
export function nextMondayKey(today = dateKey()) {
  const diff = (1 - weekdayOfKey(today) + 7) % 7 || 7;
  return addDaysKey(today, diff);
}

/**
 * Næste uges møder. Data er bevidst sammensat, så transportanalysen i
 * js/travel.js finder et par reelle konflikter (og nogle fine overgange).
 */
export function mockWeekMeetings(today = dateKey()) {
  const mon = nextMondayKey(today);
  const day = (n) => addDaysKey(mon, n);

  return [
    // Mandag: Kolding → Aarhus med for lille mellemrum (konflikt).
    meeting(day(0), 1, '08:30', '09:00', {
      title: 'Ugestart, salg & produkt', client: 'Kystlab (internt)',
      location: online(), attendees: [P.me, P.mette, P.anders],
    }),
    meeting(day(0), 2, '09:30', '10:30', {
      title: 'Kontraktgennemgang', client: 'Nordlys Energi',
      location: physical('Kolding', 'Nordlys Energi, Kystvej 12, Kolding'),
      attendees: [P.me, P.line],
    }),
    meeting(day(0), 3, '11:00', '12:00', {
      title: 'Introduktion til sensorplatform', client: 'Bølgelab ApS',
      location: physical('Aarhus', 'Bølgelab ApS, Havnepromenaden 8, Aarhus'),
      attendees: [P.me, P.ane],
    }),

    // Tirsdag: kun online + kontor — ingen transport nødvendig.
    meeting(day(1), 1, '09:00', '10:00', {
      title: 'Produktroadmap Q1', client: 'Kystlab (internt)',
      location: physical('Fredericia', 'Kystlab, mødelokale Lillebælt'),
      attendees: [P.me, P.anders],
    }),
    meeting(day(1), 2, '13:00', '13:45', {
      title: 'Statusmøde', client: 'Havbris Logistik',
      location: online(), attendees: [P.me, P.nanna],
    }),

    // Onsdag: tidligt møde i Odense direkte fra kontoret (mangler buffer).
    meeting(day(2), 1, '08:15', '09:30', {
      title: 'Byggeplads-besigtigelse', client: 'Klitgaard Byg',
      location: physical('Odense', 'Klitgaard Byg, Engvej 40, Odense'),
      attendees: [P.me, P.peter],
    }),
    meeting(day(2), 2, '10:30', '11:30', {
      title: 'Opfølgning workshop', client: 'Fjordhavn Kommune',
      location: physical('Vejle', 'Fjordhavn Kommune, Rådhustorvet 3, Vejle'),
      attendees: [P.me, P.karin, P.ib],
    }),

    // Torsdag: Teams-møde efterfulgt af Billund uden luft (mangler buffer).
    meeting(day(3), 1, '09:00', '10:00', {
      title: 'Leverandørmøde', client: 'Saltvand Rådgivning',
      location: online(), attendees: [P.me, P.helle],
    }),
    meeting(day(3), 2, '10:15', '11:15', {
      title: 'Smagning og emballagedemo', client: 'Strandvejen Foods',
      location: physical('Billund', 'Strandvejen Foods, Lufthavnsvej 5, Billund'),
      attendees: [P.me, P.thomas],
    }),
    meeting(day(3), 3, '13:30', '14:30', {
      title: 'Partnerskabsaftale', client: 'Nordlys Energi',
      location: physical('Kolding', 'Nordlys Energi, Kystvej 12, Kolding'),
      attendees: [P.me, P.soren],
    }),

    // Fredag: København med god tid — ingen konflikt.
    meeting(day(4), 1, '12:00', '13:30', {
      title: 'Branchefrokost, kystteknologi', client: 'Saltvand Rådgivning',
      location: physical('København', 'Saltvand Rådgivning, Nyhavn 99, København'),
      attendees: [P.me, P.helle, P.mette],
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Åbne punkter og beslutninger                                        */
/* ------------------------------------------------------------------ */

export function mockOpenItems(today = dateKey()) {
  return [
    { id: 'oi-1', text: 'Send revideret tilbud til Havbris Logistik', source: 'HubSpot', client: 'Havbris Logistik', due: today },
    { id: 'oi-2', text: 'Bekræft deltagere til workshop hos Fjordhavn Kommune', source: 'Outlook', client: 'Fjordhavn Kommune', due: today },
    { id: 'oi-3', text: 'Gennemlæs pilotrapport fra Nordlys Energi', source: 'Delt drev', client: 'Nordlys Energi', due: addDaysKey(today, 1) },
    { id: 'oi-4', text: 'Opdater forecast for Q4 i HubSpot', source: 'HubSpot', client: 'Kystlab (internt)', due: addDaysKey(today, 2) },
  ];
}

export function mockDecisions(today = dateKey()) {
  return [
    {
      id: 'dc-1',
      title: 'Rabat til Havbris Logistik?',
      context: 'Nanna beder om 8 % rabat mod 3-årig aftale. Svar ønskes inden mødet kl. 15.30.',
      deadline: today,
    },
    {
      id: 'dc-2',
      title: 'Godkend budget til messedeltagelse',
      context: 'Mette har sendt budget på 45.000 kr. for stand på kystteknologi-messe.',
      deadline: addDaysKey(today, 1),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Uberørte mails                                                      */
/* ------------------------------------------------------------------ */

export function mockUntouchedEmails(today = dateKey()) {
  const [y, m, d] = today.split('-').map(Number);
  const at = (h, min) => cphDate(y, m, d, h, min).toISOString();
  return [
    { id: `e-${today}-1`, account: 'Outlook', from: 'Line Brandt <line@nordlys-energi.example>', subject: 'Pilotdata fra uge 40', snippet: 'Hej, vedhæftet finder du de seneste målinger …', receivedAt: at(7, 42) },
    { id: `e-${today}-2`, account: 'Outlook', from: 'Karin Dahl <kd@fjordhavn.example>', subject: 'Referat fra workshop 1', snippet: 'Tak for et godt møde. Her er vores referat og de åbne spørgsmål …', receivedAt: at(9, 15) },
    { id: `e-${today}-3`, account: 'Gmail', from: 'Ane Mørk <ane@boelgelab.example>', subject: 'Kaffe og sensorer?', snippet: 'Vi har en ny prototype, som jeg tror kunne passe ind hos jer …', receivedAt: at(11, 3) },
    { id: `e-${today}-4`, account: 'Outlook', from: 'Anders Krogh <ak@kystlab.example>', subject: 'Input til roadmap', snippet: 'Kan du kigge på prioriteringen inden tirsdag?', receivedAt: at(12, 30) },
    { id: `e-${today}-5`, account: 'Privat', from: 'Tandlægen <booking@smil.example>', subject: 'Påmindelse om tid', snippet: 'Husk din tid hos tandlægen. Svar JA for at bekræfte …', receivedAt: at(14, 10) },
    { id: `e-${today}-6`, account: 'Gmail', from: 'Netværk Trekanten <info@netvaerk.example>', subject: 'Invitation: Erhvervsmorgen', snippet: 'Vi inviterer til morgenmøde om grøn omstilling …', receivedAt: at(16, 45) },
  ];
}

/* ------------------------------------------------------------------ */
/* Eksempeltransskription (til test uden mikrofon)                     */
/* ------------------------------------------------------------------ */

export const SAMPLE_TRANSCRIPT =
  'Vi gennemgik resultaterne fra piloten, og kunden er generelt tilfreds. ' +
  'Det blev aftalt, at vi udvider til to nye lokationer i første kvartal. ' +
  'Vi sender et opdateret tilbud inden fredag. ' +
  'Line undersøger budgettet internt. ' +
  'Vi holder et opfølgningsmøde om tre uger. ' +
  'Mette sender de tekniske specifikationer til Søren.';
