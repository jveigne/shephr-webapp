// Mock data for the Shephr admin UI. To be replaced by API calls.

export const ADMIN = {
  name: "Pasteur Daniel Bouanga",
  shortName: "Daniel Bouanga",
  initials: "DB",
  email: "daniel.bouanga@cmci.uk",
  role: "Administrateur",
  ministry: "CMCI UK",
};

export const MINISTRIES = [
  { id: "min-1", name: "CMCI UK", country: "Royaume-Uni", currency: "GBP", createdAt: "12 mars 2024", localities: 3, units: 11, members: 412 },
];

export const LOCALITIES = [
  { id: "loc-1", name: "Londres",    ministry: "CMCI UK", country: "Royaume-Uni", units: 5, members: 218 },
  { id: "loc-2", name: "Birmingham", ministry: "CMCI UK", country: "Royaume-Uni", units: 4, members: 124 },
  { id: "loc-3", name: "Édimbourg",  ministry: "CMCI UK", country: "Royaume-Uni", units: 2, members: 70 },
];

export const UNITS = [
  { id: "u-1",  name: "Londres Sud — Croydon",       type: "Centre",    locality: "Londres",    leaders: ["Marc Diallo"], members: 88, monthTotal: 4820.5, active: true },
  { id: "u-2",  name: "Londres Est — Stratford",     type: "Centre",    locality: "Londres",    leaders: ["Esther Mbongo"], members: 62, monthTotal: 3145.0, active: true },
  { id: "u-3",  name: "Londres Nord — Wood Green",   type: "Assemblée", locality: "Londres",    leaders: ["Patrick Okongo"], members: 31, monthTotal: 1280.0, active: true },
  { id: "u-4",  name: "Londres Ouest — Ealing",      type: "Assemblée", locality: "Londres",    leaders: ["Claire Bissila", "Junior Mavoungou"], members: 24, monthTotal: 980.0, active: true },
  { id: "u-5",  name: "Londres Centre — Holloway",   type: "Assemblée", locality: "Londres",    leaders: [], members: 13, monthTotal: 410.0,  active: false },
  { id: "u-6",  name: "Birmingham — Handsworth",     type: "Centre",    locality: "Birmingham", leaders: ["Solange Iboma"], members: 54, monthTotal: 2680.0, active: true },
  { id: "u-7",  name: "Birmingham — Sparkhill",      type: "Assemblée", locality: "Birmingham", leaders: ["Ruth Nzaba"], members: 28, monthTotal: 1110.0, active: true },
  { id: "u-8",  name: "Birmingham — Aston",          type: "Assemblée", locality: "Birmingham", leaders: ["André Mounkala"], members: 22, monthTotal: 905.0, active: true },
  { id: "u-9",  name: "Birmingham — Erdington",      type: "Assemblée", locality: "Birmingham", leaders: [], members: 20, monthTotal: 660.0, active: true },
  { id: "u-10", name: "Édimbourg — Leith",           type: "Centre",    locality: "Édimbourg",  leaders: ["Joseph Boumba"], members: 41, monthTotal: 1980.0, active: true },
  { id: "u-11", name: "Édimbourg — Morningside",     type: "Assemblée", locality: "Édimbourg",  leaders: ["Christelle Loumbi"], members: 29, monthTotal: 1240.0, active: true },
];

export const USERS = [
  { id: "us-1",  name: "Marc Diallo",        email: "marc.diallo@cmci.uk",     role: "LEADER", level: "Senior", unit: "Londres Sud — Croydon",      ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 2 h" },
  { id: "us-2",  name: "Esther Mbongo",      email: "e.mbongo@cmci.uk",        role: "LEADER", level: "Senior", unit: "Londres Est — Stratford",    ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 1 j" },
  { id: "us-3",  name: "Patrick Okongo",     email: "p.okongo@cmci.uk",        role: "LEADER", level: "Junior", unit: "Londres Nord — Wood Green",  ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 4 h" },
  { id: "us-4",  name: "Claire Bissila",     email: "claire.bissila@cmci.uk",  role: "LEADER", level: "Senior", unit: "Londres Ouest — Ealing",     ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 18 h" },
  { id: "us-5",  name: "Junior Mavoungou",   email: "j.mavoungou@cmci.uk",     role: "LEADER", level: "Junior", unit: "Londres Ouest — Ealing",     ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 3 j" },
  { id: "us-6",  name: "Solange Iboma",      email: "s.iboma@cmci.uk",         role: "LEADER", level: "Senior", unit: "Birmingham — Handsworth",    ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 6 h" },
  { id: "us-7",  name: "Ruth Nzaba",         email: "ruth.nzaba@cmci.uk",      role: "LEADER", level: "Junior", unit: "Birmingham — Sparkhill",     ministry: "CMCI UK", status: "Actif",   lastSeen: "hier" },
  { id: "us-8",  name: "André Mounkala",     email: "a.mounkala@cmci.uk",      role: "LEADER", level: "Junior", unit: "Birmingham — Aston",         ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 5 j" },
  { id: "us-9",  name: "Joseph Boumba",      email: "j.boumba@cmci.uk",        role: "LEADER", level: "Senior", unit: "Édimbourg — Leith",          ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 9 h" },
  { id: "us-10", name: "Christelle Loumbi",  email: "c.loumbi@cmci.uk",        role: "LEADER", level: "Junior", unit: "Édimbourg — Morningside",    ministry: "CMCI UK", status: "Actif",   lastSeen: "il y a 1 j" },
  { id: "us-11", name: "Albert Massamba",    email: "albert.m@cmci.uk",        role: "MEMBER", level: "—",      unit: "Londres Sud — Croydon",      ministry: "CMCI UK", status: "Actif",   lastSeen: "dimanche" },
  { id: "us-12", name: "Berthe Ondo",        email: "b.ondo@cmci.uk",          role: "MEMBER", level: "—",      unit: "Londres Sud — Croydon",      ministry: "CMCI UK", status: "Actif",   lastSeen: "dimanche" },
  { id: "us-13", name: "Pasteur Daniel Bouanga", email: "daniel.bouanga@cmci.uk", role: "ADMIN", level: "—",   unit: "—",                          ministry: "CMCI UK", status: "Actif",   lastSeen: "à l'instant" },
  { id: "us-14", name: "Léa Tchitembo",      email: "l.tchitembo@cmci.uk",     role: "MEMBER", level: "—",      unit: "Birmingham — Handsworth",    ministry: "CMCI UK", status: "Inactif", lastSeen: "il y a 2 mois" },
];

export const CATEGORIES = ["Dîme", "Offrande générale", "Offrande missions", "Reconnaissance", "Bâtiment", "Action de grâce"];

function buildDonations() {
  const rows: any[] = [];
  const months = [
    { label: "mai",  num: "05" },
    { label: "avr.", num: "04" },
    { label: "mars", num: "03" },
    { label: "févr.", num: "02" },
  ];
  const members = [
    "Albert Massamba", "Berthe Ondo", "Christine Mavoungou", "David Lekana",
    "Edwige Manissa", "Fabrice Ngoma", "Géraldine Bayonne", "Hugues Pemba",
    "Inès Mboko", "Jean-Paul Sita", "Karine Mabiala", "Léa Tchitembo",
    "Mireille Loemba", "Nadine Goma", "Olivier Tchikaya", "Pauline Yengo",
    "Robert Massala", "Stéphanie Etou", "Thierry Bissila", "Véronique Kounkou",
  ];
  const seedAmounts = [25, 40, 60, 80, 100, 120, 150, 200, 250, 300, 500];
  let id = 1;
  for (let m = 0; m < months.length; m++) {
    for (let day = 28; day > 0; day -= m === 0 ? 1 : m === 1 ? 2 : 4) {
      const dayStr = String(day).padStart(2, "0");
      const u = UNITS[(day + m * 7) % UNITS.length];
      const member = members[(day + m * 3) % members.length];
      const cat = CATEGORIES[(day + m) % CATEGORIES.length];
      const amount = seedAmounts[(day * 3 + m * 5) % seedAmounts.length];
      rows.push({
        id: `d-${id++}`,
        date: `${dayStr}/${months[m].num}/2026`,
        dateLabel: `${dayStr} ${months[m].label}`,
        locality: u.locality,
        unit: u.name,
        type: u.type,
        member,
        category: cat,
        amount,
        currency: "GBP",
        capturedAt: `${dayStr}/${months[m].num} • 19:${String((day * 7) % 60).padStart(2, "0")}`,
        capturedBy: "Marc D.",
      });
      if (rows.length > 220) break;
    }
    if (rows.length > 220) break;
  }
  return rows;
}
export const DONATIONS = buildDonations();

export const MONTHLY_SERIES = [
  { month: "Juin 25",  total: 18420 },
  { month: "Juil 25",  total: 19805 },
  { month: "Août 25",  total: 17120 },
  { month: "Sept 25",  total: 21340 },
  { month: "Oct 25",   total: 22680 },
  { month: "Nov 25",   total: 24515 },
  { month: "Déc 25",   total: 31240 },
  { month: "Janv 26",  total: 23890 },
  { month: "Févr 26",  total: 25130 },
  { month: "Mars 26",  total: 26710 },
  { month: "Avr 26",   total: 27940 },
  { month: "Mai 26",   total: 28640 },
];

export const LOCALITY_BARS = [
  { name: "Londres",    total: 18250 },
  { name: "Birmingham", total: 7405 },
  { name: "Édimbourg",  total: 2985 },
];

export const TOP_UNITS = [
  { name: "Londres Sud — Croydon",     locality: "Londres",    total: 4820.5 },
  { name: "Londres Est — Stratford",   locality: "Londres",    total: 3145.0 },
  { name: "Birmingham — Handsworth",   locality: "Birmingham", total: 2680.0 },
  { name: "Édimbourg — Leith",         locality: "Édimbourg",  total: 1980.0 },
  { name: "Londres Nord — Wood Green", locality: "Londres",    total: 1280.0 },
];

export const ASSIGNMENTS = [
  { id: "a-1", leader: "Marc Diallo",      unit: "Londres Sud — Croydon",     by: "Pasteur Daniel Bouanga", since: "12 mars 2024" },
  { id: "a-2", leader: "Esther Mbongo",    unit: "Londres Est — Stratford",   by: "Pasteur Daniel Bouanga", since: "22 mars 2024" },
  { id: "a-3", leader: "Patrick Okongo",   unit: "Londres Nord — Wood Green", by: "Marc Diallo",            since: "5 mai 2024" },
  { id: "a-4", leader: "Claire Bissila",   unit: "Londres Ouest — Ealing",    by: "Pasteur Daniel Bouanga", since: "18 juin 2024" },
  { id: "a-5", leader: "Junior Mavoungou", unit: "Londres Ouest — Ealing",    by: "Claire Bissila",         since: "2 sept. 2024" },
  { id: "a-6", leader: "Solange Iboma",    unit: "Birmingham — Handsworth",   by: "Pasteur Daniel Bouanga", since: "14 avr. 2024" },
  { id: "a-7", leader: "Ruth Nzaba",       unit: "Birmingham — Sparkhill",    by: "Solange Iboma",          since: "10 juil. 2024" },
  { id: "a-8", leader: "André Mounkala",   unit: "Birmingham — Aston",        by: "Solange Iboma",          since: "21 août 2024" },
  { id: "a-9", leader: "Joseph Boumba",    unit: "Édimbourg — Leith",         by: "Pasteur Daniel Bouanga", since: "30 mars 2024" },
  { id: "a-10", leader: "Christelle Loumbi", unit: "Édimbourg — Morningside", by: "Joseph Boumba",          since: "12 oct. 2024" },
];

export const HIERARCHY = [
  { senior: "Marc Diallo",    juniors: ["Patrick Okongo"] },
  { senior: "Claire Bissila", juniors: ["Junior Mavoungou"] },
  { senior: "Solange Iboma",  juniors: ["Ruth Nzaba", "André Mounkala"] },
  { senior: "Joseph Boumba",  juniors: ["Christelle Loumbi"] },
  { senior: "Esther Mbongo",  juniors: [] },
];

export const EXPORT_PRESETS = [
  { id: "preset-min", title: "Tout le ministère sur une période", desc: "Toutes les contributions, toutes localités confondues, sur une plage de dates.", icon: "Building" },
  { id: "preset-loc", title: "Par localité",                      desc: "Filtrer par localité (Londres, Birmingham, Édimbourg) et période.",            icon: "Locality" },
  { id: "preset-uni", title: "Par unité",                         desc: "Détail par unité (Centre ou Assemblée) sur la période choisie.",               icon: "Unit" },
  { id: "preset-cat", title: "Par catégorie",                     desc: "Regroupé par type de don : Dîme, Offrandes, Bâtiment…",                         icon: "Tag" },
];

export const EXPORT_HISTORY = [
  { id: "exp-1", title: "Tout CMCI UK · 01/04 → 30/04",  by: "Vous", when: "13 mai 2026, 09:42",  rows: 384,  size: "32 Ko" },
  { id: "exp-2", title: "Birmingham · janvier → mars",   by: "Vous", when: "06 avr. 2026, 16:11", rows: 213,  size: "18 Ko" },
  { id: "exp-3", title: "Par catégorie · 2025 complet",  by: "Vous", when: "05 janv. 2026, 11:28", rows: 4108, size: "186 Ko" },
];

export function gbp(n: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
export function gbpShort(n: number): string {
  if (n >= 1000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1000) + " k";
  return new Intl.NumberFormat("fr-FR").format(n);
}
