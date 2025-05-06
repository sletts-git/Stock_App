# === views.py
import yfinance as yf
import feedparser
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import xml.etree.ElementTree as ET
import requests
import numpy as np
import os
from datetime import datetime
from scipy.stats import norm

# === sec and greek parsing === #

def calculate_greeks(S, K, T, r, sigma, option_type):
    if T <= 0 or sigma <= 0:
        return {"delta": None, "gamma": None, "vega": None, "theta": None, "rho": None}

    d1 = (np.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if option_type == 'call':
        delta = norm.cdf(d1)
        theta = (-S * norm.pdf(d1) * sigma / (2 * np.sqrt(T)) - r * K * np.exp(-r * T) * norm.cdf(d2)) / 365
        rho = K * T * np.exp(-r * T) * norm.cdf(d2) / 100
    else:
        delta = norm.cdf(d1) - 1
        theta = (-S * norm.pdf(d1) * sigma / (2 * np.sqrt(T)) + r * K * np.exp(-r * T) * norm.cdf(-d2)) / 365
        rho = -K * T * np.exp(-r * T) * norm.cdf(-d2) / 100

    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    return {
        "delta": round(delta, 4),
        "gamma": round(gamma, 4),
        "vega": round(vega, 4),
        "theta": round(theta, 4),
        "rho": round(rho, 4),
    }

def parse_greeks(option, spot_price, expiration_str, option_type):
    try:
        T = (datetime.strptime(expiration_str, "%Y-%m-%d") - datetime.now()).days / 365.0
        sigma = option.get('impliedVolatility') or 0.3
        r = 0.05
        return calculate_greeks(S=spot_price, K=option['strike'], T=T, r=r, sigma=sigma, option_type=option_type)
    except:
        return {}

def parse_sec_feed(feed_url):
    response = requests.get(feed_url)
    response.raise_for_status()
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    root = ET.fromstring(response.content)
    entries = []

    for entry in root.findall('atom:entry', ns):
        form_type = entry.find('atom:category', ns).attrib['term']
        title = entry.find('atom:title', ns).text
        updated = entry.find('atom:updated', ns).text
        link = entry.find('atom:link', ns).attrib['href']

        content = entry.find('atom:content', ns)
        accession = content.find('accession-number').text
        filing_date = content.find('filing-date').text
        size = content.find('size').text
        filing_href = content.find('filing-href').text

        entries.append({
            'form_type': form_type,
            'title': title,
            'updated': updated,
            'accession_number': accession,
            'filing_date': filing_date,
            'size': size,
            'filing_href': filing_href,
            'link': link,
        })

    return entries

# === api calls === #

@api_view(['GET'])
def get_quote_data(request, symbol):
    try:
        stock = yf.Ticker(symbol)
        period = request.GET.get("period", "1mo")
        interval = request.GET.get("interval", "1d")

        hist = stock.history(period=period, interval=interval)
        hist.reset_index(inplace=True)
        date_col = "Datetime" if "Datetime" in hist.columns else "Date"
        hist[date_col] = hist[date_col].astype(str)

        data = hist[[date_col, "Open", "High", "Low", "Close", "Volume"]].rename(columns={date_col: "Date"}).to_dict(
            orient="records")

        info = {
            "symbol": symbol,
            "shortName": stock.info.get("shortName", ""),
            "currentPrice": stock.info.get("currentPrice", "N/A")
        }

        return Response({"history": data, "info": info})
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def get_options_data(request, symbol):
    try:
        stock = yf.Ticker(symbol)
        expirations = stock.options
        if not expirations:
            return Response({"data": {"calls": [], "puts": [], "expiration": "", "expirations": []}})

        selected_exp = request.GET.get("expiration", expirations[0])
        options = stock.option_chain(selected_exp)

        calls_raw = options.calls[["strike", "bid", "ask", "volume", "impliedVolatility"]].fillna(0).to_dict(orient="records")
        puts_raw = options.puts[["strike", "bid", "ask", "volume", "impliedVolatility"]].fillna(0).to_dict(orient="records")

        spot_price = stock.info.get("currentPrice", 0)

        calls = [dict(opt, **parse_greeks(opt, spot_price, selected_exp, 'call')) for opt in calls_raw]
        puts = [dict(opt, **parse_greeks(opt, spot_price, selected_exp, 'put')) for opt in puts_raw]

        return Response({
            "data": {
                "calls": calls,
                "puts": puts,
                "expiration": selected_exp,
                "expirations": expirations
            }
        })
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def get_sec_filings(request, symbol):
    try:
        headers = {
            "User-Agent": "MyAppName/1.0 (haileynicolec@gmail.com)"
        }
        url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={symbol}&type=&output=atom"
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        feed = feedparser.parse(response.content)

        filings = []
        for entry in feed.entries:
            filings.append({
                "title": getattr(entry, 'title', ''),
                "summary": getattr(entry, 'summary', ''),
                "link": getattr(entry, 'link', ''),
            })

        return Response({"filings": filings})
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def get_news_data(request, symbol):
    try:
        api_key = os.getenv("FINNHUB_API_KEY")
        if not api_key:
            return Response({"error": "Finnhub API key not set"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        url = f"https://finnhub.io/api/v1/company-news?symbol={symbol}&from=2023-01-01&to=2025-12-31&token={api_key}"
        response = requests.get(url)
        response.raise_for_status()
        news_items = response.json()

        results = []
        for item in news_items:
            results.append({
                "headline": item.get("headline"),
                "summary": item.get("summary"),
                "url": item.get("url"),
                "datetime": item.get("datetime"),
                "source": item.get("source")
            })

        return Response({"news": results})
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
