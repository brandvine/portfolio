#!/usr/bin/env python3
"""
Price Service - Fetches live prices for portfolio holdings
- Yahoo Finance for LSE-listed ETFs and investment trusts
- FT Markets for OTC funds (e.g. Ranmore Global Equity Institutional)
"""

import re
import time
import requests
import yfinance as yf

# Mapping of portfolio tickers to Yahoo Finance symbols
TICKER_MAP = {
    'VJPN': 'VJPN.L',
    'BRWM': 'BRWM.L',
    'AGT': 'AGT.L',
    'CLDN': 'CLDN.L',
    'CEA1': 'CEA1.L',
    'CSCA': 'CSCA.L',
    'CGT': 'CGT.L',
    'RCP': 'RCP.L',
    'RICA': 'RICA.L',
    'BHMG': 'BHMG.L',
    'TI5G': 'TI5G.L',
    'SGLN': 'SGLN.L',
    'TRY': 'TRY.L',
    'PIN': 'PIN.L',
    'SPOG': 'SPOG.L',
    'CSWG': 'CSWG.L',
    'INXG': 'INXG.L',
    'ITPG': 'ITPG.L',
}

# Mapping of portfolio tickers to FT Markets fund URLs (for OTC funds)
# Format: ISIN:CURRENCY
FT_FUND_MAP = {
    'B61ZBV3': 'IE000WSZ17Z4:GBP',  # Ranmore Global Equity Institutional GBP Acc
    'BVYPNY2': 'IE00BVYPNY24:GBP',  # Guinness Global Equity Income Y GBP Acc
}

# Tickers that trade in GBP (not GBp/pence) - all others assumed GBp
GBP_TICKERS = {'VJPN.L', 'CSCA.L'}

# FT Markets base URL for fund price pages
FT_BASE_URL = 'https://markets.ft.com/data/funds/tearsheet/summary?s='


def get_yahoo_symbol(ticker):
    """Get Yahoo Finance symbol for a portfolio ticker, or None if not available"""
    return TICKER_MAP.get(ticker)


def fetch_ft_price(ft_identifier):
    """
    Fetch fund price from FT Markets (server-side rendered page).
    Returns price in GBP or None if failed.
    """
    url = FT_BASE_URL + ft_identifier
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return None

        # FT puts the price in: <span class="mod-ui-data-list__value">183.21</span>
        match = re.search(
            r'class="mod-ui-data-list__value">([0-9]+\.[0-9]+)', resp.text
        )
        if match:
            return float(match.group(1))

        return None
    except Exception as e:
        print(f"Error fetching FT price for {ft_identifier}: {e}")
        return None


def fetch_live_prices(tickers):
    """
    Fetch live prices for a list of portfolio tickers.
    Returns dict of {ticker: price_in_gbp}
    Uses Yahoo Finance for LSE-listed securities, FT Markets for OTC funds.
    """
    results = {}

    # --- Yahoo Finance batch fetch ---
    symbols = []
    symbol_to_ticker = {}

    for t in tickers:
        sym = TICKER_MAP.get(t)
        if sym:
            symbols.append(sym)
            symbol_to_ticker[sym] = t

    if symbols:
        # Fetch in small batches to avoid Yahoo rate limits on cloud IPs
        batch_size = 4
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            if i > 0:
                time.sleep(2)

            try:
                data = yf.download(batch, period='5d', progress=False)

                if not data.empty:
                    for sym in batch:
                        try:
                            if len(batch) == 1:
                                close = data['Close'].dropna().iloc[-1]
                            else:
                                close = data['Close'][sym].dropna().iloc[-1]

                            price = float(close)
                            # Convert GBp (pence) to GBP; GBP_TICKERS are already in GBP
                            if sym not in GBP_TICKERS:
                                price_gbp = price / 100.0
                            else:
                                price_gbp = price

                            results[symbol_to_ticker[sym]] = price_gbp
                        except (KeyError, IndexError):
                            pass
            except Exception as e:
                print(f"Error fetching Yahoo prices for batch {batch}: {e}")

    # --- FT Markets fetch for OTC funds ---
    for t in tickers:
        ft_id = FT_FUND_MAP.get(t)
        if ft_id:
            price = fetch_ft_price(ft_id)
            if price is not None:
                results[t] = price

    return results


def is_auto_priceable(ticker):
    """Check if a ticker can be auto-priced (Yahoo Finance or FT Markets)"""
    return ticker in TICKER_MAP or ticker in FT_FUND_MAP


def get_price_source(ticker):
    """Get the price source description for a ticker"""
    if ticker in TICKER_MAP:
        return 'Yahoo Finance'
    elif ticker in FT_FUND_MAP:
        return 'FT Markets'
    return None


def get_price_url(ticker):
    """Get the URL where users can manually check a ticker's price"""
    if ticker in TICKER_MAP:
        sym = TICKER_MAP[ticker]
        return f'https://finance.yahoo.com/quote/{sym}/'
    elif ticker in FT_FUND_MAP:
        ft_id = FT_FUND_MAP[ticker]
        return f'{FT_BASE_URL}{ft_id}'
    return None
