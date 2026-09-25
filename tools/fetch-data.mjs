// tools/fetch-data.mjs: downloads public source data and writes the trimmed files in data-raw/.
// Needs the network. Run once, commit the outputs; builds read only the committed files.
//   node tools/fetch-data.mjs [names|surnames|hometowns|climate|schedule|all]
// Behind an HTTPS proxy, set NODE_USE_ENV_PROXY=1 so Node's fetch uses it.
// Sources:
//   first names: US Social Security Administration, national baby name data (public domain)
//   surnames: US Census Bureau, 2010 surname file (public domain)
//   hometowns: US Census Bureau, Vintage 2023 city and town population estimates (public domain)
//   climate: NOAA NCEI 1991-2020 monthly normals and Global Summary of the Month (public domain)
//   schedule: nflverse games.csv (a copy of the NFL's official 2026 schedule feed), cross-checked
//             game by game against ESPN's public scoreboard feed
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUT = new URL('../data-raw/', import.meta.url);
const target = process.argv[2] ?? 'all';

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Extracts files from a zip archive with the system unzip tool. */
function unzip(buffer, names) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gm-fetch-'));
  const file = path.join(dir, 'archive.zip');
  writeFileSync(file, buffer);
  execFileSync('unzip', ['-o', '-q', file, ...names, '-d', dir]);
  return Object.fromEntries(names.map(n => [n, readFileSync(path.join(dir, n), 'utf8')]));
}

const write = (name, header, rows) => {
  const text = `${header.map(line => `# ${line}`).join('\n')}\n${rows.join('\n')}\n`;
  writeFileSync(new URL(name, OUT), text);
  console.log(`data-raw/${name}: ${rows.length - 1} rows`);
};

const csvCell = value =>
  /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0] !== '');
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// First names: male births 1975-2025 in five-year buckets, top 3,000 by total.
async function names() {
  const years = Array.from({ length: 2025 - 1975 + 1 }, (_, i) => 1975 + i);
  const files = unzip(
    await get('https://www.ssa.gov/oact/babynames/names.zip'),
    years.map(y => `yob${y}.txt`)
  );
  const buckets = Array.from({ length: 11 }, (_, i) => 1975 + i * 5);
  const counts = new Map();
  for (const year of years) {
    const b = Math.min(10, Math.floor((year - 1975) / 5));
    for (const line of files[`yob${year}.txt`].split('\n')) {
      const [name, sex, n] = line.trim().split(',');
      if (sex !== 'M') continue;
      if (!counts.has(name)) counts.set(name, new Array(buckets.length).fill(0));
      counts.get(name)[b] += Number(n);
    }
  }
  const total = c => c.reduce((a, b) => a + b, 0);
  const top = [...counts.entries()]
    .sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 3000);
  write(
    'first-names.csv',
    [
      'Source: US Social Security Administration, national baby name data, male births 1975-2025 (public domain).',
      'https://www.ssa.gov/oact/babynames/limits.html',
      'Columns b1975..b2025 are births in each five-year bucket starting that year, divided by 10 and rounded.',
      'Written by tools/fetch-data.mjs. Do not edit by hand.'
    ],
    [
      ['name', ...buckets.map(b => `b${b}`)].join(','),
      ...top.map(([name, c]) => [name, ...c.map(v => Math.round(v / 10))].join(','))
    ]
  );
}

// Census strips punctuation from surnames; restore the common Irish and Scottish forms.
const APOSTROPHE = new Set([
  'OBRIEN',
  'OCONNOR',
  'ONEAL',
  'ONEIL',
  'ONEILL',
  'OCONNELL',
  'ODONNELL',
  'OHARA',
  'OKEEFE',
  'OROURKE',
  'OMALLEY',
  'OSULLIVAN',
  'OLEARY',
  'OBRYANT',
  'OQUINN',
  'OSHEA',
  'OBANNON',
  'ODANIEL',
  'ODEA',
  'ODONOGHUE',
  'OGRADY',
  'OHAIR',
  'OKANE',
  'OMARA',
  'ONEALL',
  'OREILLY',
  'OTOOLE',
  'OBOYLE',
  'OCALLAGHAN',
  'ODWYER',
  'OFARRELL',
  'OGORMAN',
  'OHALLORAN',
  'OKELLY',
  'OLOUGHLIN',
  'OMEARA',
  'ORYAN',
  'OSHAUGHNESSY'
]);
const MAC = new Set([
  'MACDONALD',
  'MACKENZIE',
  'MACLEOD',
  'MACDOUGALL',
  'MACINTYRE',
  'MACKINNON',
  'MACLEAN',
  'MACNEIL',
  'MACPHERSON',
  'MACMILLAN',
  'MACARTHUR',
  'MACGREGOR',
  'MACAULAY',
  'MACDONNELL',
  'MACKAY',
  'MACLAREN',
  'MACNEILL',
  'MACKINTOSH'
]);

export function titleSurname(upper) {
  const cap = s => s.charAt(0) + s.slice(1).toLowerCase();
  if (APOSTROPHE.has(upper)) return `O'${cap(upper.slice(1))}`;
  if (MAC.has(upper)) return `Mac${cap(upper.slice(3))}`;
  if (/^MC[A-Z]{2,}/.test(upper)) return `Mc${cap(upper.slice(2))}`;
  return cap(upper);
}

async function surnames() {
  const { 'Names_2010Census.csv': text } = unzip(
    await get('https://www2.census.gov/topics/genealogy/2010surnames/names.zip'),
    ['Names_2010Census.csv']
  );
  const rows = parseCsv(text)
    .filter(r => r.name && r.name !== 'ALL OTHER NAMES')
    .map(r => ({ name: titleSurname(r.name), count: Number(r.count) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5000);
  write(
    'surnames.csv',
    [
      'Source: US Census Bureau, frequently occurring surnames from the 2010 Census (public domain).',
      'https://www.census.gov/topics/population/genealogy/data/2010_surnames.html',
      'Top 5,000 by count. Apostrophes restored for common O names; Mc and Mac capitalized.',
      'Written by tools/fetch-data.mjs. Do not edit by hand.'
    ],
    ['name,count', ...rows.map(r => `${r.name},${r.count}`)]
  );
}

const STATES = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY'
};

// A small international share (spec 10.1). Weights are scaled so these make up about 3% of draws.
const INTERNATIONAL = [
  ['Toronto', 'Canada', 30],
  ['Montreal', 'Canada', 14],
  ['Vancouver', 'Canada', 8],
  ['Calgary', 'Canada', 6],
  ['Winnipeg', 'Canada', 4],
  ['Ottawa', 'Canada', 5],
  ['London', 'England', 16],
  ['Manchester', 'England', 5],
  ['Birmingham', 'England', 4],
  ['Lagos', 'Nigeria', 14],
  ['Abuja', 'Nigeria', 5],
  ['Accra', 'Ghana', 6],
  ['Kinshasa', 'DR Congo', 3],
  ['Yaounde', 'Cameroon', 3],
  ['Sydney', 'Australia', 8],
  ['Melbourne', 'Australia', 7],
  ['Brisbane', 'Australia', 4],
  ['Auckland', 'New Zealand', 5],
  ['Apia', 'Samoa', 6],
  ['Pago Pago', 'American Samoa', 10],
  ["Nuku'alofa", 'Tonga', 5],
  ['Berlin', 'Germany', 5],
  ['Munich', 'Germany', 4],
  ['Hamburg', 'Germany', 3],
  ['Frankfurt', 'Germany', 3],
  ['Paris', 'France', 3],
  ['Vienna', 'Austria', 2],
  ['Stockholm', 'Sweden', 2],
  ['Copenhagen', 'Denmark', 2],
  ['Oslo', 'Norway', 1],
  ['Dublin', 'Ireland', 2],
  ['Kingston', 'Jamaica', 5],
  ['Nassau', 'Bahamas', 4],
  ['Mexico City', 'Mexico', 6],
  ['Monterrey', 'Mexico', 3],
  ['Sao Paulo', 'Brazil', 2],
  ['Tokyo', 'Japan', 1],
  ['Seoul', 'South Korea', 1],
  ['Zurich', 'Switzerland', 1],
  ['Amsterdam', 'Netherlands', 1]
];

const placeName = raw =>
  raw
    .replace(/\s*\(balance\)$/, '')
    .replace(/-Davidson metropolitan government$/, '')
    .replace(/\/Jefferson County metro government$/, '')
    .replace(/-Fayette urban county$/, '')
    .replace(/^Urban /, '')
    .replace(
      / (city|town|village|borough|municipality|CDP|consolidated government|unified government|metro township|charter township|township|plantation|corporation)$/,
      ''
    )
    .replace(/ (city|town|village|borough)$/, '');

async function hometowns() {
  const rows = parseCsv(
    (
      await get(
        'https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/cities/totals/sub-est2023.csv'
      )
    ).toString('latin1')
  );
  const seen = new Set();
  const places = rows
    .filter(r => r.SUMLEV === '162' && STATES[r.STNAME])
    .map(r => ({ city: placeName(r.NAME), state: STATES[r.STNAME], population: Number(r.POPESTIMATE2023) }))
    .sort((a, b) => b.population - a.population || a.city.localeCompare(b.city))
    .filter(p => {
      const key = `${p.city}|${p.state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 1500);
  const usTotal = places.reduce((a, p) => a + p.population, 0);
  const intlUnits = INTERNATIONAL.reduce((a, [, , w]) => a + w, 0);
  // International share of about 3%: scale the relative weights to that share of the US total.
  const scale = (usTotal * 0.03) / 0.97 / intlUnits;
  write(
    'hometowns.csv',
    [
      'Source: US Census Bureau, Vintage 2023 population estimates for cities and towns (public domain).',
      'https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/cities/totals/',
      'The 1,500 largest places, plus a hand-set international list weighted to about 3% of draws.',
      'Written by tools/fetch-data.mjs. Do not edit by hand.'
    ],
    [
      'city,region,country,weight',
      ...places.map(p => [csvCell(p.city), p.state, 'USA', p.population].join(',')),
      ...INTERNATIONAL.map(([city, country, w]) =>
        [csvCell(city), '', csvCell(country), Math.round(w * scale)].join(',')
      )
    ]
  );
}

// Climate: one weather station per stadium city. US stations use NOAA 1991-2020 normals for temperature,
// precipitation, and snow; wind is the 1991-2020 mean of monthly average wind speed. International
// venues use the Global Summary of the Month for every field.
export const STATIONS = {
  PHX: { station: 'USW00023183', name: 'Phoenix Sky Harbor' },
  ATL: { station: 'USW00013874', name: 'Atlanta Hartsfield-Jackson' },
  BAL: { station: 'USW00093721', name: 'Baltimore-Washington International' },
  BUF: { station: 'USW00014733', name: 'Buffalo Niagara International' },
  CLT: { station: 'USW00013881', name: 'Charlotte Douglas' },
  CHI: { station: 'USW00094846', name: "Chicago O'Hare" },
  CVG: { station: 'USW00093814', name: 'Cincinnati/Northern Kentucky' },
  CLE: { station: 'USW00014820', name: 'Cleveland Hopkins' },
  DFW: { station: 'USW00003927', name: 'Dallas-Fort Worth' },
  DEN: { station: 'USW00003017', name: 'Denver International' },
  DTW: { station: 'USW00094847', name: 'Detroit Metropolitan' },
  GRB: { station: 'USW00014898', name: 'Green Bay Austin Straubel' },
  IAH: { station: 'USW00012960', name: 'Houston Bush Intercontinental' },
  IND: { station: 'USW00093819', name: 'Indianapolis International' },
  JAX: { station: 'USW00013889', name: 'Jacksonville International' },
  MCI: { station: 'USW00003947', name: 'Kansas City International' },
  LAX: { station: 'USW00023174', name: 'Los Angeles International' },
  LAS: { station: 'USW00023169', name: 'Las Vegas Harry Reid' },
  MIA: { station: 'USW00012839', name: 'Miami International' },
  MSP: { station: 'USW00014922', name: 'Minneapolis-St. Paul' },
  PVD: { station: 'USW00014765', name: 'Providence T. F. Green' },
  MSY: { station: 'USW00012916', name: 'New Orleans Armstrong' },
  EWR: { station: 'USW00014734', name: 'Newark Liberty' },
  PHL: { station: 'USW00013739', name: 'Philadelphia International' },
  PIT: { station: 'USW00094823', name: 'Pittsburgh International' },
  SEA: { station: 'USW00024233', name: 'Seattle-Tacoma' },
  SJC: { station: 'USW00023293', name: 'San Jose' },
  TPA: { station: 'USW00012842', name: 'Tampa International' },
  BNA: { station: 'USW00013897', name: 'Nashville International' },
  DCA: { station: 'USW00013743', name: 'Washington Reagan National' },
  LHR: { station: 'UKM00003772', name: 'London Heathrow', global: true },
  CDG: { station: 'FRM00007157', name: 'Paris Charles de Gaulle', global: true },
  MAD: { station: 'SPE00120278', name: 'Madrid Barajas', global: true },
  MUC: { station: 'GM000004199', name: 'Munich', global: true },
  MEL: { station: 'ASN00086282', name: 'Melbourne Airport', global: true },
  GIG: { station: 'BR000083743', name: 'Rio de Janeiro', global: true },
  MEX: { station: 'MXM00076680', name: 'Mexico City International', global: true }
};

const NCEI = 'https://www.ncei.noaa.gov/access/services/data/v1';

// NOAA's global monthly summaries have gaps at these airports, so international venues use rounded
// 1991-2020 normals from the national weather services (Met Office, Meteo-France, AEMET, DWD, BoM,
// INMET, SMN). Per month: [high F, low F, precipitation in, snow in, wind mph].
const C = (hi, lo, pr, sn, wi) => hi.map((h, i) => [h, lo[i], pr[i], sn[i], wi[i]]);
const INTERNATIONAL_CLIMATE = {
  LHR: C(
    [47.1, 48.2, 53.1, 59.0, 65.1, 70.9, 75.0, 74.1, 68.5, 60.6, 52.9, 47.8],
    [36.1, 35.8, 38.5, 41.5, 46.9, 52.3, 56.5, 56.1, 52.0, 47.3, 41.0, 37.0],
    [2.2, 1.6, 1.6, 1.7, 1.9, 1.8, 1.8, 1.9, 1.9, 2.7, 2.3, 2.2],
    [0.5, 0.5, 0.2, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.3],
    [11, 11, 11, 10, 9, 9, 9, 9, 9, 10, 10, 11]
  ),
  CDG: C(
    [45.7, 48.0, 54.9, 61.0, 67.6, 73.4, 77.9, 77.2, 70.0, 61.2, 51.8, 46.4],
    [35.6, 35.6, 39.7, 43.2, 49.6, 55.2, 59.0, 58.5, 52.9, 48.0, 41.2, 36.9],
    [1.9, 1.6, 1.7, 1.9, 2.5, 2.2, 2.3, 2.2, 1.9, 2.2, 2.2, 2.3],
    [1.0, 1.0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.5],
    [10, 10, 10, 9, 8, 8, 8, 8, 8, 9, 9, 10]
  ),
  MAD: C(
    [51.1, 55.0, 62.2, 66.9, 74.8, 86.2, 92.5, 91.4, 82.2, 70.2, 57.9, 51.8],
    [31.3, 33.1, 38.1, 43.0, 49.6, 58.6, 63.9, 63.1, 55.8, 47.5, 38.5, 33.1],
    [1.1, 1.3, 1.2, 1.7, 1.8, 0.8, 0.4, 0.4, 0.9, 2.2, 2.0, 1.7],
    [0.5, 0.3, 0.1, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2],
    [8, 9, 9, 9, 8, 8, 8, 8, 7, 7, 8, 8]
  ),
  MUC: C(
    [37.9, 41.2, 50.0, 58.8, 66.4, 72.7, 76.5, 75.7, 67.1, 57.4, 46.6, 39.4],
    [26.1, 27.0, 33.1, 39.0, 46.9, 53.2, 56.5, 56.1, 49.5, 42.4, 34.5, 28.4],
    [2.2, 2.0, 2.5, 2.6, 4.4, 5.0, 5.2, 4.4, 3.0, 2.5, 2.5, 2.5],
    [6.0, 5.0, 3.0, 0.5, 0, 0, 0, 0, 0, 0.2, 2.0, 5.0],
    [8, 8, 8, 8, 7, 7, 7, 6, 6, 7, 7, 8]
  ),
  MEL: C(
    [79.9, 79.5, 75.2, 68.0, 61.7, 56.8, 55.9, 58.3, 62.4, 67.3, 72.1, 76.3],
    [57.6, 58.3, 55.2, 50.0, 46.0, 43.0, 41.7, 42.6, 44.8, 47.3, 51.1, 54.3],
    [1.7, 1.7, 1.5, 1.8, 1.5, 1.5, 1.4, 1.7, 1.9, 2.1, 2.4, 2.1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [12, 11, 11, 11, 12, 13, 14, 14, 14, 13, 13, 12]
  ),
  GIG: C(
    [86.4, 87.6, 85.8, 82.9, 79.7, 77.7, 77.4, 78.1, 77.7, 79.7, 82.2, 84.4],
    [74.3, 75.0, 74.1, 71.8, 68.5, 66.2, 65.3, 66.2, 67.5, 69.4, 71.4, 73.2],
    [5.4, 5.1, 5.3, 3.7, 2.7, 1.9, 1.7, 1.7, 2.1, 3.4, 3.8, 6.7],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [7, 7, 6, 6, 6, 6, 7, 7, 8, 8, 8, 7]
  ),
  MEX: C(
    [70.7, 73.6, 77.5, 79.5, 79.7, 76.6, 74.1, 74.5, 73.2, 72.5, 71.6, 70.3],
    [43.3, 45.3, 48.7, 52.0, 54.0, 55.2, 53.8, 54.1, 54.0, 51.1, 46.9, 44.4],
    [0.4, 0.2, 0.5, 1.0, 2.2, 5.1, 5.9, 5.6, 4.9, 2.2, 0.5, 0.2],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [7, 8, 8, 8, 7, 7, 6, 6, 6, 6, 7, 7]
  )
};

async function monthlyMeans(station, dataTypes) {
  const url = `${NCEI}?dataset=global-summary-of-the-month&stations=${station}&startDate=1991-01-01&endDate=2020-12-31&dataTypes=${dataTypes.join(',')}&format=json&units=standard`;
  const rows = JSON.parse((await get(url)).toString('utf8'));
  const sums = {};
  for (const row of rows) {
    const month = Number(row.DATE.slice(5, 7));
    for (const type of dataTypes) {
      if (row[type] === undefined || row[type] === '') continue;
      const key = `${type}:${month}`;
      sums[key] ??= [0, 0];
      sums[key][0] += Number(row[type]);
      sums[key][1] += 1;
    }
  }
  return (type, month) => {
    const s = sums[`${type}:${month}`];
    return s && s[1] >= 5 ? s[0] / s[1] : null;
  };
}

async function climate() {
  const out = ['key,station,month,tmax_f,tmin_f,precip_in,snow_in,wind_mph'];
  for (const [key, { station, global }] of Object.entries(STATIONS)) {
    if (global) {
      INTERNATIONAL_CLIMATE[key].forEach((values, i) =>
        out.push([key, station, i + 1, ...values.map(v => v.toFixed(1))].join(','))
      );
      continue;
    }
    const gsom = await monthlyMeans(station, ['TMAX', 'TMIN', 'PRCP', 'SNOW', 'AWND']);
    let normals = null;
    if (!global) {
      const url = `${NCEI}?dataset=normals-monthly-1991-2020&stations=${station}&format=json&units=standard`;
      normals = JSON.parse((await get(url)).toString('utf8'));
    }
    for (let month = 1; month <= 12; month++) {
      const n = normals?.find(r => Number(r.DATE) === month);
      const pick = (normalKey, gsomKey) => {
        const v =
          n?.[normalKey] !== undefined && n[normalKey] !== '' ? Number(n[normalKey]) : gsom(gsomKey, month);
        return v === null || Number.isNaN(v) ? '' : v.toFixed(1);
      };
      const wind = gsom('AWND', month);
      out.push(
        [
          key,
          station,
          month,
          pick('MLY-TMAX-NORMAL', 'TMAX'),
          pick('MLY-TMIN-NORMAL', 'TMIN'),
          pick('MLY-PRCP-NORMAL', 'PRCP'),
          // Stations with no snow record (San Jose) report none.
          pick('MLY-SNOW-NORMAL', 'SNOW') || '0.0',
          wind === null ? '' : wind.toFixed(1)
        ].join(',')
      );
    }
    console.log(`climate ${key} done`);
  }
  write(
    'climate.csv',
    [
      'Source: NOAA NCEI U.S. Climate Normals 1991-2020 (monthly) and Global Summary of the Month (public domain).',
      'International venues: rounded 1991-2020 normals from the national weather services (see the tool).',
      'https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals',
      'Temperatures in F, precipitation and snow in inches per month, wind in mph. Blank means no data.',
      'Written by tools/fetch-data.mjs. Do not edit by hand.'
    ],
    out
  );
}

// nflverse and ESPN abbreviations that differ from the game's.
const TEAM_FIX = { LA: 'LAR', WSH: 'WAS', JAC: 'JAX', LVR: 'LV', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
const fix = abbr => TEAM_FIX[abbr] ?? abbr;
// Feed venue names that trail the current name.
const VENUE_FIX = { 'Reliant Stadium': 'NRG Stadium' };
const DAYS = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
};

function toEastern(isoUtc) {
  const d = new Date(isoUtc);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(d)
      .map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function schedule() {
  const games = parseCsv(
    (await get('https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv')).toString('utf8')
  ).filter(g => g.season === '2026' && g.game_type === 'REG');
  if (games.length !== 272) throw new Error(`Expected 272 regular-season games, found ${games.length}`);
  const problems = [];
  const espnByPair = new Map();
  for (let week = 1; week <= 18; week++) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=${week}`;
    const data = JSON.parse((await get(url)).toString('utf8'));
    for (const event of data.events) {
      const c = event.competitions[0];
      const home = fix(c.competitors.find(x => x.homeAway === 'home').team.abbreviation);
      const away = fix(c.competitors.find(x => x.homeAway === 'away').team.abbreviation);
      espnByPair.set(`${week}:${away}@${home}`, {
        ...toEastern(event.date),
        venue: c.venue?.fullName ?? '',
        country: c.venue?.address?.country ?? 'USA',
        neutral: c.neutralSite === true
      });
    }
  }
  const rows = ['week,day,date,time_et,away,home,site_type,site_name'];
  for (const g of games.sort(
    (a, b) =>
      Number(a.week) - Number(b.week) ||
      a.gameday.localeCompare(b.gameday) ||
      a.gametime.localeCompare(b.gametime) ||
      a.game_id.localeCompare(b.game_id)
  )) {
    const away = fix(g.away_team);
    const home = fix(g.home_team);
    const espn = espnByPair.get(`${Number(g.week)}:${away}@${home}`);
    if (!espn) {
      problems.push(`week ${g.week} ${away}@${home}: missing from ESPN`);
      continue;
    }
    // ESPN lists late-season games still awaiting flex decisions at midnight; the NFL default is 1 p.m.
    const tbd = espn.time === '00:00' && g.gametime === '13:00';
    if (espn.date !== g.gameday || (espn.time !== g.gametime && !tbd)) {
      problems.push(
        `week ${g.week} ${away}@${home}: nflverse ${g.gameday} ${g.gametime}, ESPN ${espn.date} ${espn.time}`
      );
    }
    const international = espn.country !== 'USA' && espn.country !== '';
    const siteType = international ? 'international' : g.location === 'Neutral' ? 'neutral' : 'home';
    rows.push(
      [
        g.week,
        DAYS[g.weekday] ?? g.weekday,
        g.gameday,
        g.gametime,
        away,
        home,
        siteType,
        csvCell(VENUE_FIX[espn.venue] ?? espn.venue ?? g.stadium)
      ].join(',')
    );
  }
  if (problems.length) {
    console.log(`Schedule cross-check found ${problems.length} differences:\n${problems.join('\n')}`);
    if (problems.some(p => p.includes('missing'))) throw new Error('Team pairs differ between sources');
  }
  write(
    'schedule-2026.csv',
    [
      'Source: the NFL 2026 regular-season schedule, released May 14, 2026 (nfl.com/schedules/2026).',
      "Taken from nflverse's games.csv copy of the NFL feed and cross-checked game by game against ESPN.",
      'Times are US Eastern; games awaiting flex decisions are listed at the default 13:00.',
      'site_type is home, neutral, or international.',
      'Written by tools/fetch-data.mjs. Do not edit by hand.'
    ],
    rows
  );
}

const TASKS = { names, surnames, hometowns, climate, schedule };
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, task] of Object.entries(TASKS)) {
    if (target === 'all' || target === name) await task();
  }
}
