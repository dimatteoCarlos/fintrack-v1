/**
 * Cotizave provider for VES (Venezuelan bolivar) rates: usd->ves and ves->usd from the BCV
 * 'reference' market, requiring API_KEY_COTIZAVE. Response shape:
 * { rates: [{ market: 'reference' | 'parallel' | 'binance' | 'bcv_eur', mid, updated_at }], index, fetched_at }
 */

import { formatDateToVenezuelanStyle } from "../../../../utils/helpers.js";

const COTIZAVE_API_URL = 'https://api.cotizave.com/v1/fx/rates';

// Debug output only: logs the BCV, Binance, parallel and euro rates in Venezuelan format.
function logFormattedRates(data) {
  if (!data || !Array.isArray(data?.rates)) return;

  const lastUpdate =
    new Date(data.rates.find((r) => r.market === 'reference')?.updated_at) ||
    new Date();
  const dateStr = formatDateToVenezuelanStyle(lastUpdate).dateStr;
  const timeStr = formatDateToVenezuelanStyle(lastUpdate).timeStr;
  const now = new Date();
  const nowDateStr = formatDateToVenezuelanStyle(now).dateStr;
  const nowTimeStr = formatDateToVenezuelanStyle(now).timeStr;
  const formatVES = (val) => {
    if (typeof val !== 'number') return '0,00';
    return new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };
   const bcv = data.rates.find((r) => r.market === 'reference')?.mid;
   const parallel = data.rates.find((r) => r.market === 'parallel')?.mid;
   const binance = data.rates.find((r) => r.market === 'binance')?.mid;
   const euro = data.rates.find((r) => r.market === 'bcv_eur')?.mid;
  const spread = bcv && binance ? ((binance - bcv) / bcv) * 100 : 0;

  console.log(`\n💸 Dólar ahora » ${nowDateStr}. ${nowTimeStr}`);

  console.log(`📅 Última actualización » ${dateStr}. ${timeStr}\n`);

  console.log('💵 Dólar BCV: Bs.', formatVES(bcv));

  console.log(`💰 Binance USDT: Bs.`, formatVES(binance));
  
  console.log('⚖️  Promedio BCV / USDT: Bs.', formatVES((binance + bcv) / 2));
  
  console.log(
    '📊 Brecha cambiaria BCV / USDT:',
    formatVES(spread) + '%',
    '',
  );
  
  console.log('\n🤑 Dólar Paralelo: Bs.', formatVES(parallel));

  if (euro) {
    console.log('💶 Euro BCV: Bs.', formatVES(euro));
  }
}
export async function fetchFromCotizave(baseCode, targetCode) {
  const FZ_API_KEY = process.env.API_KEY_COTIZAVE;

  if (!FZ_API_KEY) {
    throw new Error('Missing COTIZAVE_API_KEY');
  }

  if (!baseCode || !targetCode) {
    throw new Error('baseCode and targetCode are required');
  }

  const base = baseCode.toLowerCase();
  const target = targetCode.toLowerCase();

  const res = await fetch(COTIZAVE_API_URL, {
    headers: {
      'X-API-Key': FZ_API_KEY,
    },
  });
  const data = await res.json();

  logFormattedRates(data);

  const rates = data?.rates;

  if (!Array.isArray(rates)) {
    throw new Error('Invalid API response');
  }

  const bcv = rates.find((r) => r.market === 'reference');

  if (!bcv || typeof bcv.mid !== 'number' || bcv.mid <= 0) {
    throw new Error('BCV rate not found or invalid');
  }

  const usdToVes = bcv.mid;
  let rate;

  if (base === 'usd' && target === 'ves') {
    rate = usdToVes;
  } else if (base === 'ves' && target === 'usd') {
    rate = 1 / usdToVes;
  } else {
    throw new Error(`Unsupported pair: ${base}/${target}`);
  }

  // updated_at is when Cotizave refreshed its reference market, not when this installation asked,
  // so it travels apart from fetchedAt. Checked explicitly: new Date(undefined) is a truthy
  // Invalid Date, so a `|| new Date()` fallback would never fire.
  const referenceUpdatedAt = new Date(
    data.rates.find((r) => r.market === 'reference')?.updated_at,
  );

  return {
    rate,
    source: 'cotizave',
    fetchedAt: new Date(),
    providerUpdatedAt: Number.isNaN(referenceUpdatedAt.getTime())
      ? null
      : referenceUpdatedAt,
  };
}
export async function fetchAllRates(baseCurrency) {
  try {
    const result = await fetchFromCotizave(baseCurrency, 'ves');
    if (result && typeof result.rate === 'number') {
      return {
        rates: {
          ves: {
            rate: result.rate,
            source: result.source || 'cotizave',
            fetchedAt: result.fetchedAt || new Date(),
            providerUpdatedAt: result.providerUpdatedAt || null,
          },
        },
        source: 'cotizave',
        fetchedAt: result.fetchedAt || new Date(),
        providerUpdatedAt: result.providerUpdatedAt || null,
      };
    }
    return null;
  } catch (error) {
    console.warn('⚠️ Cotizave fetchAllRates failed:', error.message);
    return null;
  }
}
