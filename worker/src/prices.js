// Cheapest Divine Orb offers on FunPay for PoE 1 and PoE 2, in rubles.
// Rules: only the current main league (no event, Standard, Hardcore or Ruthless leagues),
// only sellers who are online right now, cheapest price for 1 Divine Orb.
// FunPay renders every offer into one big HTML page, so we scan it with indexOf/regex on small
// slices (cheap on CPU even for the ~2.5 MB PoE 2 page) instead of building a DOM.

const SOURCES = {
  poe1: {
    title: "Path of Exile",
    url: "https://funpay.com/en/chips/173/", // this category lists only Divine Orbs
    side: null,
    // Current PC challenge league
    leagueOk: (name) => /^\(PC\)/.test(name) && !/hardcore|ruthless|standard|event/i.test(name)
  },
  poe2: {
    title: "Path of Exile 2",
    url: "https://funpay.com/en/chips/209/",
    side: "106", // "Divine orbs"
    leagueOk: (name) => !/hardcore|ruthless|standard|event/i.test(name)
  }
};

const UA = "Mozilla/5.0 (compatible; PhillForFun price widget; updates every 20 min)";

function parseLeagues(html) {
  const start = html.indexOf('name="server"');
  if (start < 0) return new Map();
  const end = html.indexOf("</select>", start);
  const block = html.slice(start, end);
  const map = new Map();
  for (const m of block.matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

function parseNumber(s) {
  return Number(String(s).replace(/[\s ]/g, "").replace(",", "."));
}

function scanOffers(html, side) {
  const offers = [];
  let pos = 0;
  for (;;) {
    const i = html.indexOf('class="tc-item', pos); // rows may carry extra classes (e.g. lazyload-hidden)
    if (i < 0) break;
    const end = html.indexOf("</a>", i);
    if (end < 0) break;
    pos = end;
    const chunk = html.slice(i, end);
    const server = chunk.match(/data-server="(\d+)"/)?.[1];
    if (side) {
      const s = chunk.match(/data-side="(\d+)"/)?.[1];
      if (s !== side) continue;
    }
    const price = chunk.match(/tc-price"[^>]*>\s*<div>\s*([\d.,\s ]+?)\s*<span class="unit">([^<]+)<\/span>/);
    const amount = chunk.match(/tc-amount"[^>]*data-s="(\d+)"/)?.[1];
    if (!server || !price) continue;
    const value = parseNumber(price[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    offers.push({
      server,
      price: value,
      unit: price[2].trim(),
      amount: Number(amount || 0),
      online: /data-online="1"/.test(chunk) || /media-user online/.test(chunk)
    });
  }
  return offers;
}

// ----- Currency -----

function readCookies(res, jar) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
  for (const c of list) {
    const m = c.match(/^\s*([^=;\s]+)=([^;]*)/);
    if (m) jar.set(m[1], m[2]);
  }
}
const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

// Ask FunPay for ruble prices the same way its currency menu does. Returns a cookie header,
// or null if FunPay does not offer rubles from this location.
async function rubleSession() {
  try {
    const jar = new Map();
    const home = await fetch("https://funpay.com/en/", { headers: { "User-Agent": UA } });
    readCookies(home, jar);
    const html = await home.text();
    const csrf = html.match(/csrf-token&quot;:&quot;([^&]+)&quot;|"csrf-token":"([^"]+)"/);
    const token = csrf && (csrf[1] || csrf[2]);
    if (!token) return null;
    const sw = await fetch("https://funpay.com/account/switchCurrency", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookieHeader(jar)
      },
      body: `cy=rub&csrf_token=${encodeURIComponent(token)}&confirmed=true`
    });
    readCookies(sw, jar);
    return sw.ok ? cookieHeader(jar) : null;
  } catch (_) {
    return null;
  }
}

// Central Bank of Russia daily rates (rubles per 1 unit), used only if FunPay will not show rubles
async function cbrRates() {
  const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CBR: HTTP ${res.status}`);
  const data = await res.json();
  return { "$": data.Valute.USD.Value / data.Valute.USD.Nominal, "€": data.Valute.EUR.Value / data.Valute.EUR.Nominal };
}

const isRuble = (unit) => /₽|руб|rub/i.test(unit);

// ----- Main -----

async function fetchOne(key, cookie) {
  const src = SOURCES[key];
  const res = await fetch(src.url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...(cookie ? { Cookie: cookie } : {}) }
  });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
  const html = await res.text();
  const leagues = parseLeagues(html);
  const offers = scanOffers(html, src.side).filter((o) => o.amount >= 1);

  // Current league = the NEWEST eligible league that already has a live market.
  // FunPay league ids grow over time, so a new season shows up with a higher id than the old one.
  // Picking by "most offers" would keep the old league for days after a launch, because old lots linger.
  const byLeague = new Map();
  for (const o of offers) {
    const name = leagues.get(o.server) || o.server;
    if (!src.leagueOk(name)) continue;
    const g = byLeague.get(o.server) || { id: Number(o.server), name, list: [] };
    g.list.push(o);
    byLeague.set(o.server, g);
  }
  const ranked = [...byLeague.values()].sort((a, b) => b.id - a.id);
  const MIN_ONLINE = 3; // a brand-new league needs a few online sellers before its price means anything
  const main = ranked.find((g) => g.list.filter((o) => o.online).length >= MIN_ONLINE) || ranked[0];
  if (!main) throw new Error(`${key}: no offers in the current league`);
  const { name: league, list, id: leagueId } = main;
  const online = list.filter((o) => o.online);
  const cheapest = online.length ? online.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  // Order book: the cheapest online offers, plus the median price and total stock of online sellers
  const sorted = [...online].sort((a, b) => a.price - b.price);
  const ladder = sorted.slice(0, 10).map((o) => ({ price: o.price, amount: o.amount }));
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)].price : null;
  const stock = online.reduce((sum, o) => sum + o.amount, 0);
  const newer = ranked.filter((g) => g.id > leagueId).map((g) => g.name); // spotted but not liquid yet
  return {
    game: src.title,
    url: src.url,
    league,
    price: cheapest ? cheapest.price : null,
    unit: cheapest ? cheapest.unit : list[0].unit,
    offers: list.length,
    onlineOffers: online.length,
    leagueId,
    newerLeagues: newer,
    ladder,
    median,
    stock
  };
}

export async function fetchDivinePrices() {
  const errors = [];
  const cookie = await rubleSession();
  const out = {};
  await Promise.all(Object.keys(SOURCES).map(async (k) => {
    try { out[k] = await fetchOne(k, cookie); } catch (e) { errors.push(String(e.message || e)); }
  }));

  // Convert to rubles if FunPay answered in another currency
  let rates = null;
  for (const k of Object.keys(out)) {
    const p = out[k];
    if (isRuble(p.unit)) { p.unit = "₽"; p.source = "funpay"; continue; }
    try {
      rates = rates || (await cbrRates());
      const rate = rates[p.unit];
      if (!rate) throw new Error(`no rate for ${p.unit}`);
      p.original = p.price != null ? { price: p.price, unit: p.unit } : null;
      p.price = p.price != null ? p.price * rate : null;
      p.median = p.median != null ? p.median * rate : null;
      p.ladder = (p.ladder || []).map((o) => ({ ...o, price: o.price * rate }));
      p.unit = "₽";
      p.source = "cbr";
      p.rate = Math.round(rate * 100) / 100;
    } catch (e) {
      errors.push(`convert ${k}: ${e.message || e}`);
    }
  }
  return { prices: out, errors };
}
