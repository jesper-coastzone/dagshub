/**
 * hub-data.js — indhold til "I dag"-viewet (#idag).
 *
 * ⚠️ EKSEMPELDATA. Alle navne, kunder og links herunder er FIKTIVE.
 * Filen er beregnet til at blive overskrevet med rigtige data (fx genereret
 * af et script eller en assistent) — formatet er dokumenteret i README.md
 * under "HUB_DATA-skema".
 *
 * Filen indlæses som almindeligt <script> (ikke modul) og sætter blot
 * window.HUB_DATA. Alle felter er valgfrie; viewet viser tomme tilstande,
 * hvis noget mangler. Tider er ISO 8601 med offset (dansk tid).
 */
window.HUB_DATA = {
  example: true, // Fjern (eller sæt false) i rigtige data — så forsvinder "Eksempeldata"-mærket.
  generatedAt: '2026-10-06T06:30:00+02:00',
  briefDate: '2026-10-06',

    // --- front/actions (genereret af test/make_fixtures.py --example) ---
    front: {
    "date": "2026-10-06",
    "generatedAt": "2026-10-06T07:41:00+02:00",
    "status": "åben",
    "url": "https://www.office.com/launch/onedrive",
    "items": [
      {
        "key": "P1",
        "kind": "opfølgning",
        "title": "Diktat mangler: Statusmøde – Bølgelab (5/10 10:00)",
        "detail": "Referatet bygger kun på kalenderen. Diktér et par linjer, så handlingerne kommer med.",
        "carriedFrom": "2026-10-05",
        "status": "åben"
      },
      {
        "key": "P2",
        "kind": "handling",
        "title": "Sende dataformat-specifikation til Bølgelab",
        "detail": "Frist i dag · Dig selv",
        "letter": "A",
        "actionId": "H-001",
        "status": "åben",
        "links": [
          {
            "type": "referat",
            "label": "Referat",
            "url": "https://www.office.com/launch/onedrive"
          }
        ]
      },
      {
        "key": "P3",
        "kind": "møde",
        "title": "Opfølgning på pilotprojekt – Nordlys Energi",
        "start": "2026-10-06T10:00:00+02:00",
        "end": "2026-10-06T11:00:00+02:00",
        "location": "Nordlys Energi, Kystvej 12, Kolding",
        "attendees": [
          "Line Brandt (Nordlys Energi)",
          "Søren Vestergaard (Nordlys Energi)"
        ],
        "context": [
          "Formål: aftale scope for fase 2.",
          "Line har nævnt to nye lokationer i Q1."
        ],
        "status": "åben",
        "links": [
          {
            "type": "noter",
            "label": "Notefil (Word)",
            "url": "https://www.office.com/launch/onedrive"
          },
          {
            "type": "materiale",
            "label": "Pilotrapport v2",
            "url": "https://www.office.com/launch/sharepoint"
          }
        ]
      },
      {
        "key": "P4",
        "kind": "møde",
        "title": "Kystsikring, workshop 2 – Fjordhavn Kommune",
        "start": "2026-10-06T13:00:00+02:00",
        "end": "2026-10-06T14:00:00+02:00",
        "location": "Fjordhavn Kommune, Rådhustorvet 3, Vejle",
        "attendees": [
          "Karin Dahl (Fjordhavn Kommune)",
          "Ib Thygesen (Fjordhavn Kommune)",
          "Mette Holm (Kystlab)"
        ],
        "context": [
          "Udbudsfristen er rykket til 1. december."
        ],
        "status": "åben",
        "links": [
          {
            "type": "noter",
            "label": "Notefil (Word)",
            "url": "https://www.office.com/launch/onedrive"
          }
        ]
      },
      {
        "key": "P5",
        "kind": "møde",
        "title": "Afklaring af tilbud – Havbris Logistik",
        "start": "2026-10-06T15:30:00+02:00",
        "end": "2026-10-06T16:00:00+02:00",
        "location": "Microsoft Teams",
        "attendees": [
          "Nanna Friis (Havbris Logistik)"
        ],
        "context": [
          "Nanna har bedt om 8 % rabat mod 3-årig aftale."
        ],
        "status": "åben",
        "links": [
          {
            "type": "noter",
            "label": "Notefil (Word)",
            "url": "https://www.office.com/launch/onedrive"
          }
        ]
      }
    ],
    "relevantActions": [
      "H-001"
    ],
    "upcomingActions": [
      "H-003"
    ],
    "skipped": [
      {
        "title": "Frokost",
        "reason": "privat aftale"
      },
      {
        "title": "Fokustid",
        "reason": "fokusblok uden andre deltagere"
      }
    ]
  },
    actions: {
    "updatedAt": "2026-10-05T17:30:00+02:00",
    "listUrl": "https://www.office.com/launch/onedrive",
    "open": [
      {
        "id": "H-001",
        "letter": "A",
        "text": "Sende dataformat-specifikation til Bølgelab",
        "owner": "Dig selv",
        "due": "2026-10-06",
        "kind": "kunde",
        "company": "Bølgelab ApS",
        "missing": [],
        "source": {
          "title": "Statusmøde – Bølgelab ApS",
          "date": "2026-10-05",
          "start": "10:00",
          "referatName": "2026-10-05 10.00 Bølgelab status.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": false,
        "dueToday": true
      },
      {
        "id": "H-003",
        "letter": "B",
        "text": "Book besigtigelse af byggepladsen",
        "owner": "Dig selv",
        "due": "2026-10-08",
        "kind": "kunde",
        "company": "Klitgaard Byg",
        "missing": [],
        "source": {
          "title": "Opstart – Klitgaard Byg",
          "date": "2026-10-05",
          "start": "14:00",
          "referatName": "2026-10-05 14.00 Klitgaard Byg opstart.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": false,
        "dueToday": false
      },
      {
        "id": "H-005",
        "letter": "C",
        "text": "Afklare pris pr. sensorenhed",
        "owner": null,
        "due": "2026-10-11",
        "kind": "kunde",
        "company": "Bølgelab ApS",
        "missing": [
          "owner"
        ],
        "source": {
          "title": "Statusmøde – Bølgelab ApS",
          "date": "2026-10-05",
          "start": "10:00",
          "referatName": "2026-10-05 10.00 Bølgelab status.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": false,
        "dueToday": false
      },
      {
        "id": "H-002",
        "letter": "D",
        "text": "Opsætte testmiljø til sensorerne",
        "owner": "Anders Krogh",
        "due": "2026-10-13",
        "kind": "kunde",
        "company": "Bølgelab ApS",
        "missing": [],
        "source": {
          "title": "Statusmøde – Bølgelab ApS",
          "date": "2026-10-05",
          "start": "10:00",
          "referatName": "2026-10-05 10.00 Bølgelab status.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": false,
        "dueToday": false
      },
      {
        "id": "H-004",
        "letter": "E",
        "text": "Send case-materiale om kystovervågning",
        "owner": null,
        "due": null,
        "kind": "kunde",
        "company": "Klitgaard Byg",
        "missing": [
          "owner",
          "due"
        ],
        "source": {
          "title": "Opstart – Klitgaard Byg",
          "date": "2026-10-05",
          "start": "14:00",
          "referatName": "2026-10-05 14.00 Klitgaard Byg opstart.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": false,
        "dueToday": false
      },
      {
        "id": "H-006",
        "letter": "F",
        "text": "Opdatere salgspræsentationen med Bølgelab-casen",
        "owner": "Mette Holm",
        "due": null,
        "kind": "intern",
        "company": null,
        "missing": [
          "due"
        ],
        "source": {
          "title": "Statusmøde – Bølgelab ApS",
          "date": "2026-10-05",
          "start": "10:00",
          "referatName": "2026-10-05 10.00 Bølgelab status.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": false,
        "dueToday": false
      }
    ],
    "closedRecent": [
      {
        "id": "H-007",
        "letter": null,
        "text": "Bekræfte mødelokale til besigtigelsen",
        "owner": "Dig selv",
        "due": "2026-10-05",
        "kind": "kunde",
        "company": "Klitgaard Byg",
        "missing": [],
        "source": {
          "title": "Opstart – Klitgaard Byg",
          "date": "2026-10-05",
          "start": "14:00",
          "referatName": "2026-10-05 14.00 Klitgaard Byg opstart.md",
          "referatUrl": "https://www.office.com/launch/onedrive"
        },
        "overdue": true,
        "dueToday": false,
        "closedAt": "2026-10-05T15:10:00+02:00"
      }
    ],
    "counts": {
      "open": 6,
      "missing": 3,
      "closed7d": 1
    }
  },
    // --- slut front/actions ---

  brief: {
    audioScript:
      'Godmorgen. Det er tirsdag den 6. oktober. ' +
      'Du har tre møder i dag. ' +
      'Klokken 10 opfølgning på piloten hos Nordlys Energi i Kolding med Line Brandt. Husk at de ønsker to nye lokationer. ' +
      'Klokken 13 workshop hos Fjordhavn Kommune i Vejle. Udbudsfristen er rykket til 1. december. ' +
      'Klokken 15 30 Teams med Havbris Logistik om prisbilaget. ' +
      'Tre åbne punkter: send revideret tilbud til Havbris, bekræft workshopdeltagere, og gennemlæs pilotrapporten. ' +
      'Kør forsigtigt.',
    desk: {
      overview:
        'Tre kundemøder (to fysiske, ét online). Fokus: få Nordlys Energi til at bekræfte fase 2 og afklare rabatspørgsmålet med Havbris inden kl. 15.30.',
      meetings: [
        {
          start: '2026-10-06T10:00:00+02:00',
          end: '2026-10-06T11:00:00+02:00',
          title: 'Opfølgning på pilotprojekt — Nordlys Energi',
          location: 'Nordlys Energi, Kystvej 12, Kolding',
          attendees: ['Line Brandt (Nordlys Energi)', 'Søren Vestergaard (Nordlys Energi)'],
          purpose: 'Gennemgå pilotresultater og aftale scope for fase 2.',
          keyFact: 'Line har nævnt ønske om to nye lokationer i Q1.',
        },
        {
          start: '2026-10-06T13:00:00+02:00',
          end: '2026-10-06T14:00:00+02:00',
          title: 'Kystsikring, workshop 2 — Fjordhavn Kommune',
          location: 'Fjordhavn Kommune, Rådhustorvet 3, Vejle',
          attendees: ['Karin Dahl (Fjordhavn Kommune)', 'Ib Thygesen (Fjordhavn Kommune)', 'Mette Holm (Kystlab)'],
          purpose: 'Krav til dataopsamling og tidsplan for udbud.',
          keyFact: 'Udbudsfristen er rykket til 1. december.',
        },
        {
          start: '2026-10-06T15:30:00+02:00',
          end: '2026-10-06T16:00:00+02:00',
          title: 'Afklaring af tilbud — Havbris Logistik',
          location: 'Microsoft Teams',
          attendees: ['Nanna Friis (Havbris Logistik)'],
          purpose: 'Spørgsmål til prisbilag og leveringsbetingelser.',
          keyFact: 'Nanna har bedt om 8 % rabat mod 3-årig aftale.',
        },
      ],
      openItems: [
        { title: 'Send revideret tilbud til Havbris Logistik', source: 'HubSpot', url: 'https://app.hubspot.com/' },
        { title: 'Bekræft deltagere til workshop hos Fjordhavn Kommune', source: 'Outlook', url: 'https://outlook.office.com/mail/' },
        { title: 'Gennemlæs pilotrapport fra Nordlys Energi', source: 'SharePoint', url: 'https://www.office.com/launch/sharepoint' },
      ],
    },
  },

  recaps: [
    {
      date: '2026-10-05',
      start: '2026-10-05T10:00:00+02:00',
      end: '2026-10-05T11:00:00+02:00',
      title: 'Statusmøde — Bølgelab ApS',
      attendees: ['Ane Mørk (Bølgelab ApS)', 'Anders Krogh (Kystlab)'],
      about: 'Status på integration af Bølgelabs sensorer i Kystlabs platform.',
      agreed: [
        'Bølgelab leverer testenheder i uge 43.',
        'Kystlab sætter testmiljø op inden levering.',
      ],
      actions: [
        { text: 'Opsæt testmiljø', owner: 'Anders Krogh', due: '2026-10-16' },
        { text: 'Send dataformat-specifikation', owner: 'Ane Mørk', due: '2026-10-09' },
      ],
      gaps: ['Pris pr. enhed blev ikke aftalt.', 'Ingen ejer på supportaftale.'],
    },
    {
      date: '2026-10-05',
      start: '2026-10-05T14:00:00+02:00',
      end: '2026-10-05T14:30:00+02:00',
      title: 'Opstart — Klitgaard Byg',
      attendees: ['Peter Lund (Klitgaard Byg)'],
      about: 'Første snak om overvågning af byggeplads ved kysten.',
      agreed: ['Besigtigelse af byggepladsen næste onsdag.'],
      actions: [
        { text: 'Book besigtigelse', owner: 'Dig selv', due: '2026-10-07' },
        { text: 'Send case-materiale', owner: 'Dig selv' },
      ],
      gaps: ['Budgetramme ukendt.'],
    },
  ],

  documents: [
    { title: 'Pilotrapport Nordlys Energi v2.pdf', source: 'SharePoint', url: 'https://www.office.com/launch/sharepoint', date: '2026-10-05' },
    { title: 'Tilbud Havbris Logistik (udkast).docx', source: 'OneDrive', url: 'https://www.office.com/launch/onedrive', date: '2026-10-04' },
    { title: 'Referat workshop 1 — Fjordhavn Kommune', source: 'Outlook', url: 'https://outlook.office.com/mail/', date: '2026-09-29' },
  ],
};
