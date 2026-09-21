/**
 * Static last-resort provider: no network, always available, TTL 2 hours (degraded mode).
 * Fixed rates for stable currencies; VES is projected by exponential regression over recent BCV
 * data. Any pair is served through USD cross rates.
 */

import { bcvData } from './bcv_data.js';

export const bcvStat = [
  { fecha: '2026-01-05', y: 304.6796 },
  { fecha: '2026-01-26', y: 355.5528 },
  { fecha: '2026-02-03', y: 372.1057 },
  { fecha: '2026-02-27', y: 417.3579 },
  { fecha: '2026-03-27', y: 468.51 },
  { fecha: '2026-03-30', y: 471.7004 },
  { fecha: '2026-05-13', y: 508.6004 },
  { fecha: '2026-05-25', y: 530.5047 },
  { fecha: '2026-05-26', y: 535.3853 },
  { fecha: '2026-05-29', y: 549.3716 },
  { fecha: '2026-06-02', y: 557.9741 },
  { fecha: '2026-06-03', y: 558.6436 },
  { fecha: '2026-06-04', y: 560.3753 },
  { fecha: '2026-06-05', y: 563.2892 },
  { fecha: '2026-06-09', y: 567.6828 },
  { fecha: '2026-06-10', y: 572.6828 },
  { fecha: '2026-06-11', y: 577.545 },
  { fecha: '2026-06-12', y: 582.69 },
  { fecha: '2026-06-15', y: 587.4059 },
  { fecha: '2026-06-16', y: 592.5163 },
  { fecha: '2026-06-17', y: 596.78 },
  { fecha: '2026-06-18', y: 602.33 },
  { fecha: '2026-06-19', y: 607.39 },
  { fecha: '2026-06-22', y: 612.4332 },
  { fecha: '2026-06-23', y: 617.64 },
];

// VES projection input: the curated series, or the embedded snapshot above when it is missing.
const data = bcvData ?? bcvStat;

// Fixed rates per USD. Approximate by design: this provider answers only when every other one
// failed. ves is used only when the projection fails.
export const fixedRates = {
  usd: 1,
  eur: 0.9,
  cop: 3500,
  ves: 820,
  mxn: 17,
  jpy: 156,
};

// Whole days from b to a (negative when a is earlier).
function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

// Least-squares fit of ln(y) = ln(a) + b*x over the last nUltimos points (x in days), i.e. y = a * e^(b*x).
function calcularParametros(datos, nUltimos = 4) {
  const n = Math.max(1, Math.min(Number(nUltimos) || 4, datos.length));
  const muestra = datos.slice(-n);

  const baseDate = muestra[0].fecha;
  const baseY = muestra[0].y;

  if (n === 1) {
    return {
      a: baseY,
      b: 0,
      lnA: Math.log(baseY),
      r2: 1.0,
      baseDate,
      baseY,
      nUsados: 1,
      puntos: muestra.map((d) => ({ fecha: d.fecha, x: 0, y: d.y })),
    };
  }

  const puntos = muestra.map((d) => ({
    fecha: d.fecha,
    x: daysBetween(d.fecha, baseDate),
    y: d.y,
  }));

  const xs = puntos.map((d) => d.x);
  const ys = puntos.map((d) => Math.log(d.y));

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);

  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const lnA = (sumY - b * sumX) / n;
  const a = Math.exp(lnA);

  const yBar = sumY / n;
  const sst = ys.reduce((acc, y) => acc + (y - yBar) ** 2, 0);
  const sse = ys.reduce((acc, y, i) => acc + (y - (lnA + b * xs[i])) ** 2, 0);
  const r2 = sst === 0 ? 1 : 1 - sse / sst;

  return {
    a,
    b,
    lnA,
    r2,
    baseDate,
    baseY,
    nUsados: n,
    puntos,
  };
}

function projectVesRate(date = new Date(), nUsados = 4) {
  // Warn when the projection data is stale.
  const lastDate = data[data.length - 1]?.fecha;
  if (lastDate) {
    const daysSinceLastData = daysBetween(
      new Date().toISOString().slice(0, 10),
      lastDate,
    );
    if (daysSinceLastData > 3) {
      console.info(
        `⚠️ VES projection data is ${daysSinceLastData} days old. Consider updating bcvStat or bcvData.`,
      );
    }
  }
  const params = calcularParametros(data, nUsados);

  const fecha = new Date(date);
  const base = new Date(`${params.baseDate}T00:00:00`);
  const dias = Math.round((fecha - base) / (1000 * 60 * 60 * 24));

  const rate = params.a * Math.exp(params.b * dias);

  return rate;
}

/**
 * Fallback rate between two currencies through USD; VES uses the exponential projection, the
 * others fixed values.
 * @param {number} nUsados - Number of recent data points for the VES projection
 * @returns {number} Units of toCode per one unit of fromCode
 */
export function getFallbackRate(fromCode, toCode = 'usd', nUsados = 4) {
  function getRateFromUsd(target) {
    if (target === 'usd') return 1;

    if (target === 'ves') {
      try {
        const rate = projectVesRate(new Date(), nUsados);
        if (Number.isFinite(rate) && rate > 0) {
          return Math.round(rate); // rounded only here
        }
        console.warn(
          `⚠️ VES projection returned invalid rate: ${rate}. Falling back to fixedRates.ves (${fixedRates.ves}).`,
        );
        return Math.round(fixedRates.ves);
      } catch (error) {
        console.warn(
          `⚠️ VES projection failed: ${error.message}. Falling back to fixedRates.ves (${fixedRates.ves}).`,
        );
        return fixedRates.ves;
      }
    }

    const fixed = fixedRates[target];
    if (fixed === undefined) throw new Error(`No fallback rate for ${target}`);
    return fixed;
  }
  const from = fromCode.toLowerCase();
  const to = toCode.toLowerCase();

  if (from === to) return 1.0;

  if (from === 'usd') {
    return getRateFromUsd(to);
  }

  if (to === 'usd') {
    const rate = getRateFromUsd(from);
    return 1 / rate;
  }

  // Cross conversion between two non-USD currencies goes through USD.
  const rateFromToUsd = getRateFromUsd(from);
  const rateUsdToTarget = getRateFromUsd(to);

  return (1 / rateFromToUsd) * rateUsdToTarget;
}

/**
 * Every currency in fixedRates against a base, in the standard format of the FX global state.
 * @param {Object} options - { nUsados } for the VES projection
 * @returns {Promise<Object>} - { rates: { target: { rate, source, fetchedAt } }, source, fetchedAt }
 */
export async function fetchAllRates(baseCurrency, options = { nUsados: 4 }) {
  const base = baseCurrency.toLowerCase();
  const nUsados = options.nUsados || 4;
  const now = new Date();

  const allCurrencies = Object.keys(fixedRates);

  const rates = {};
  for (const target of allCurrencies) {
    try {
      const rate = getFallbackRate(base, target, nUsados);
      rates[target] = {
        rate,
        source: 'static-fallback',
        fetchedAt: now,
      };
    } catch (err) {
      console.warn(
        `⚠️ Static fallback: no rate for ${base} → ${target}:`,
        err.message,
      );
      // A currency with no fallback rate is left out of the snapshot.
    }
  }

  return {
    rates,
    source: 'static-fallback',
    fetchedAt: now,
  };
}
// CLI: `node getFallbackRate.js --from=usd --to=ves [--n=4]` prints the rate and, for VES, the fitted
// parameters; it runs only when --from or --to is given (defaults ves, usd, 4 points).
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const arg of args) {
    const [k, v] = arg.split('=');
    if (k && v !== undefined) out[k.replace(/^--/, '')] = v;
  }
  return out;
}

const args = parseArgs();

if (args.from || args.to) {
  const from = args.from || 'ves';
  const to = args.to || 'usd';
  const nUsados = args.n ? parseInt(args.n, 10) : 4;

  const rate = getFallbackRate(from, to, nUsados);

  console.log(`Fallback Rate: ${from} → ${to}`);
  console.log(
    JSON.stringify(
      {
        from,
        to,
        rate,
        nUsados,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  if (from.toLowerCase() === 'ves' || to.toLowerCase() === 'ves') {
    const params = calcularParametros(data, nUsados);
    console.log('\nParámetros VES proyectados:');
    console.log(
      JSON.stringify(
        {
          a: params.a,
          b: params.b,
          baseDate: params.baseDate,
          baseY: params.baseY,
          r2: params.r2,
          nUsados: params.nUsados,
        },
        null,
        2,
      ),
    );
  }
} else {
}
