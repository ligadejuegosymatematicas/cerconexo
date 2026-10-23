// Posiciones legales obtenidas mediante partidas deterministas, sin alterar el motor.
export const TACTICAL_FIXTURES=[
  {
    "mode": "piece",
    "seed": 26,
    "game": {
      "version": 2,
      "moves": 26,
      "walls": [
        "2-9",
        "25-26",
        "41-48",
        "35-36",
        "1-8",
        "12-19",
        "40-47",
        "37-44",
        "14-15",
        "13-20",
        "39-40",
        "31-38",
        "7-14",
        "18-19",
        "33-40",
        "24-31",
        "21-22",
        "20-27",
        "34-41",
        "23-30",
        "22-29",
        "33-34",
        "15-16",
        "22-23",
        "16-23",
        "26-27"
      ],
      "pieces": [
        {
          "id": "A1",
          "team": "A",
          "start": 8,
          "pos": 16
        },
        {
          "id": "B1",
          "team": "B",
          "start": 12,
          "pos": 26
        },
        {
          "id": "A2",
          "team": "A",
          "start": 40,
          "pos": 41
        },
        {
          "id": "B2",
          "team": "B",
          "start": 36,
          "pos": 23
        }
      ],
      "turnTeam": "A",
      "lastActed": {
        "A": "A1",
        "B": "B1"
      },
      "currentActor": "A1",
      "over": false,
      "winner": null,
      "lastMove": {
        "actor": "B1",
        "path": [
          34,
          27,
          26
        ],
        "wall": [
          26,
          27
        ]
      }
    },
    "unsafe": {
      "actor": "A1",
      "path": [
        16,
        17,
        24
      ],
      "to": 23
    },
    "safe": {
      "actor": "A1",
      "path": [
        16,
        17,
        24
      ],
      "to": 17
    }
  },
  {
    "mode": "team",
    "seed": 8,
    "game": {
      "version": 2,
      "moves": 31,
      "walls": [
        "1-8",
        "5-12",
        "22-29",
        "36-43",
        "40-41",
        "30-31",
        "39-46",
        "21-28",
        "7-14",
        "6-13",
        "14-15",
        "12-19",
        "40-47",
        "4-11",
        "31-32",
        "10-11",
        "31-38",
        "24-25",
        "30-37",
        "28-35",
        "14-21",
        "25-32",
        "22-23",
        "29-36",
        "21-22",
        "23-30",
        "16-23",
        "20-27",
        "9-16",
        "27-34",
        "15-16"
      ],
      "pieces": [
        {
          "id": "A1",
          "team": "A",
          "start": 8,
          "pos": 21
        },
        {
          "id": "B1",
          "team": "B",
          "start": 12,
          "pos": 34
        },
        {
          "id": "A2",
          "team": "A",
          "start": 40,
          "pos": 16
        },
        {
          "id": "B2",
          "team": "B",
          "start": 36,
          "pos": 30
        }
      ],
      "turnTeam": "B",
      "lastActed": {
        "A": "A2",
        "B": "B1"
      },
      "currentActor": "B1",
      "over": false,
      "winner": null,
      "lastMove": {
        "actor": "A2",
        "path": [
          16
        ],
        "wall": [
          16,
          15
        ]
      },
      "turnMode": "team"
    },
    "unsafe": {
      "actor": "B1",
      "path": [
        34,
        33,
        26
      ],
      "to": 19
    },
    "safe": {
      "actor": "B1",
      "path": [
        34,
        33,
        26
      ],
      "to": 25
    }
  }
];
