import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';

function App() {
  const [symbol, setSymbol] = useState('SMCI');
  const [period, setPeriod] = useState('ytd');
  const [interval, setInterval] = useState('1d');
  const [history, setHistory] = useState([]);
  const [info, setInfo] = useState({});
  const [options, setOptions] = useState({ calls: [], puts: [], expiration: '', expirations: [] });
  const [strikeWindow, setStrikeWindow] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  const [showFinancials, setShowFinancials] = useState(false);
  const [showFilings, setShowFilings] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [financials, setFinancials] = useState({ keyMetrics: [], ratios: [] });
  const [filings, setFilings] = useState([]);
  const [news, setNews] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIndex, setExpandedIndex] = useState(null);


  const filteredFilings = filings.filter(f =>
    f.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredNews = news.filter(n =>
    n.headline.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validIntervals = {
    '1d':  ['1m', '2m', '5m', '15m', '30m', '60m', '90m'],
    '5d':  ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1d'],
    '7d':  ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1d'],
    '14d': ['2m', '5m', '15m', '30m', '60m', '90m', '1d', '1wk'],
    '1mo': ['2m', '5m', '15m', '30m', '60m', '90m', '1d', '1wk'],
    '3mo': ['60m', '1d', '1wk', '1mo'],
    '6mo': ['60m','1d', '1wk', '1mo'],
    '1y':  ['60m', '1d', '1wk', '1mo'],
    '2y':  ['60m', '1d', '1wk', '1mo'],
    '5y':  ['1d', '1wk', '1mo'],
    '10y': ['1d', '1wk', '1mo'],
    'ytd': ['60m', '1d', '1wk', '1mo'],
    'max': ['1d', '1wk', '1mo']
  };

  const availableIntervals = validIntervals[period] || ['1d'];

  function computeEMA(data, window) {
    const k = 2 / (window + 1);
    const emaArray = [];
    let emaPrev = data[0];

    for (let i = 0; i < data.length; i++) {
      const price = data[i];
      emaPrev = i === 0 ? price : price * k + emaPrev * (1 - k);
      emaArray.push(emaPrev);
    }

    return emaArray;
  }

  const fetchOptions = async (sym, expiration = null) => {
    const url = expiration
      ? `http://localhost:8000/api/options/${sym}/?expiration=${expiration}`
      : `http://localhost:8000/api/options/${sym}/`;
    const res = await axios.get(url);
    return res.data.data;
  };

  useEffect(() => {
    const fetchQuoteAndOptions = async () => {
      setLoading(true);
      setError('');
      try {
        const [quoteRes, optionsData] = await Promise.all([
          axios.get(`http://localhost:8000/api/quote/${symbol}/?period=${period}&interval=${interval}`),
          fetchOptions(symbol)
        ]);
        setHistory(quoteRes.data.history);
        setInfo(quoteRes.data.info);
        setOptions(optionsData);
        setSelectedOption(null);
      } catch (err) {
        setError(`Error fetching data for ${symbol}: ${err.response?.data?.error || err.message}`);
        setHistory([]);
        setInfo({});
        setOptions({ calls: [], puts: [], expiration: '', expirations: [] });
        setSelectedOption(null);
      } finally {
        setLoading(false);
      }
    };

    fetchQuoteAndOptions();
  }, [symbol, period, interval]);

  useEffect(() => {
    const fetchTabData = async () => {
      try {
        if (showFilings) {
          const res = await axios.get(`http://localhost:8000/api/filings/${symbol}/`);
          setFilings(res.data.filings);
        }

        if (showNews) {
          const res = await axios.get(`http://localhost:8000/api/news/${symbol}/`);
          setNews(res.data.news);
        }

        if (showFinancials) {
          const res = await axios.get(`http://localhost:8000/api/financials/${symbol}/`);
          setFinancials(res.data);
        }
      } catch (err) {
        console.error("Tab fetch error:", err.message || err);
        if (showFilings) setFilings([]);
        if (showNews) setNews([]);
        if (showFinancials) setFinancials({ keyMetrics: [], ratios: [] });
      }
    };
    fetchTabData();
  }, [symbol, showFilings, showNews, showFinancials]);

  const handleInputChange = (e) => setSymbol(e.target.value.toUpperCase());
  const handleExpirationChange = async (e) => {
    const newExp = e.target.value;
    try {
      const updated = await fetchOptions(symbol, newExp);
      setOptions(updated);
      setSelectedOption(null);
    } catch (err) {
      setError(`Error loading expiration data: ${err.message}`);
    }
  };

  const handleStrikeWindowChange = (e) => {
    setStrikeWindow(parseInt(e.target.value));
  };

  const dates = history.map(x => x.Date);
  const closePrices = history.map(x => x.Close);
  const ema16 = computeEMA(closePrices, 16);
  const ema52 = computeEMA(closePrices, 52);

  const volumes = history.map(d => d.Volume);
  const volumeColors = history.map(d => (d.Close >= d.Open ? 'green' : 'red'));
  const maxVolume = Math.max(...volumes);
  const volumeYMax = Math.ceil((maxVolume * 4) / 100_000_000) * 100_000_000;

  const filteredOptions = (() => {
    const price = info.currentPrice;
    if (!price || !options.calls.length || !options.puts.length) return { calls: [], puts: [] };

    const strikeList = options.calls.map(c => c.strike);
    const closestIndex = strikeList.reduce((bestIdx, strike, idx) =>
      Math.abs(strike - price) < Math.abs(strikeList[bestIdx] - price) ? idx : bestIdx, 0);
    const closestStrike = strikeList[closestIndex];

    const start = Math.max(0, closestIndex - strikeWindow);
    const end = closestIndex + strikeWindow + 1;

    return {
      calls: options.calls.slice(start, end),
      puts: options.puts.slice(start, end)
    };
  })();

  const volumeChart = options.calls.length && options.puts.length && (
    <Plot
      data={[
        {
          x: filteredOptions.calls.map(c => c.strike),
          y: filteredOptions.calls.map(c => c.volume ?? 0),
          type: 'bar',
          name: 'Calls',
          marker: { color: 'green' }
        },
        {
          x: filteredOptions.puts.map(p => p.strike),
          y: filteredOptions.puts.map(p => p.volume ?? 0),
          type: 'bar',
          name: 'Puts',
          marker: { color: 'red' }
        }
      ]}
      layout={{
        title: 'Options Volume by Strike Price',
        barmode: 'group',
        width: 800,
        height: 400,
        xaxis: {
          title: { text: 'Strike Price', standoff: 10 },
          automargin: true
        },
        yaxis: {
          title: { text: 'Volume', standoff: 10 },
          automargin: true
        },
        margin: { t: 50, l: 60, r: 30, b: 60 }
      }}
    />
  );


  return (
    <div style={{
      backgroundColor: (showFilings || showNews) ? '#121212' : '#fff',
      color: (showFilings || showNews) ? '#eee' : '#000',
      minHeight: '100vh'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#111',
        color: '#fff',
        padding: '1rem'
      }}>
        <h2>
          {showFilings
            ? 'SEC Filings'
            : showOptions
            ? 'Options Chain'
            : showNews
            ? 'News Headlines'
            : showFinancials
            ? 'Financial Summary'
            : 'Stock Dashboard'}
        </h2>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => {
              const goingBack = showOptions;
              setShowOptions(!goingBack);
              setShowFilings(false);
              setShowNews(false);
              setShowFinancials(false);
              setSearchTerm('');
              setSelectedOption(null);
            }}
            style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #666' }}
          >
            {showOptions ? 'Back to Dashboard' : 'Options Chain'}
          </button>

          <button
            onClick={() => {
              const goingBack = showFilings;
              setShowFilings(!goingBack);
              setShowOptions(false);
              setShowNews(false);
              setShowFinancials(false);
              setSearchTerm('');
              setCurrentPage(1);
              setSelectedOption(null);
            }}
            style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #666' }}
          >
            {showFilings ? 'Back to Dashboard' : 'SEC Filings'}
          </button>

          <button
            onClick={() => {
              const goingBack = showNews;
              setShowNews(!goingBack);
              setShowOptions(false);
              setShowFilings(false);
              setShowFinancials(false);
              setSearchTerm('');
              setCurrentPage(1);
              setSelectedOption(null);
            }}
            style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #666' }}
          >
            {showNews ? 'Back to Dashboard' : 'News Headlines'}
          </button>

          <button
            onClick={() => {
              const goingBack = showFinancials;
              setShowFinancials(!goingBack);
              setShowOptions(false);
              setShowFilings(false);
              setShowNews(false);
              setSearchTerm('');
              setSelectedOption(null);
            }}
            style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #666' }}
          >
            {showFinancials ? 'Back to Dashboard' : 'Financial Summary'}
          </button>
        </div>
      </div>


      {showNews ? (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Latest News for {symbol}</h3>
            <label>
              Page:&nbsp;
              <select
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                style={{ padding: '4px' }}
              >
                {Array.from({ length: Math.ceil(filteredNews.length / 20) }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              &nbsp;of {Math.ceil(filteredNews.length / 20)}
            </label>
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search news headlines..."
            style={{ padding: '0.5rem', marginBottom: '1rem', width: '100%' }}
          />

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {filteredNews.slice((currentPage - 1) * 20, currentPage * 20).map((article, idx) => (
              <li key={idx} style={{ margin: '1rem 0', padding: '1rem', background: '#1e1e1e', borderRadius: '5px' }}>
                <strong>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: '#79bfff' }}>
                    {article.headline}
                  </a>
                </strong>
                <p>{article.summary}</p>
                <p style={{ fontSize: '0.8em', color: '#aaa' }}>
                  {article.source} — {new Date(article.datetime * 1000).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>
              Previous
            </button>
            <button onClick={() => setCurrentPage(p => p + 1)} disabled={(currentPage * 20) >= filteredNews.length}>
              Next
            </button>
          </div>
        </div>
      ) : showFilings ? (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>SEC Filings for {symbol}</h3>
            <label>
              Page:&nbsp;
              <select
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                style={{ padding: '4px' }}
              >
                {Array.from({ length: Math.ceil(filteredFilings.length / 20) }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              &nbsp;of {Math.ceil(filteredFilings.length / 20)}
            </label>
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // reset pagination on new search
            }}
            placeholder="Search filing titles..."
            style={{ padding: '0.5rem', marginBottom: '1rem', width: '100%' }}
          />

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {filteredFilings.slice((currentPage - 1) * 20, currentPage * 20).map((filing, idx) => (
              <li key={idx} style={{ margin: '1rem 0', padding: '1rem', background: '#1e1e1e', borderRadius: '5px', cursor: 'pointer' }}
                onClick={() => setExpandedIndex(idx === expandedIndex ? null : idx)}>
                <div><strong>{filing.title}</strong></div>
                {expandedIndex === idx && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <p dangerouslySetInnerHTML={{ __html: filing.summary }} />
                    <a href={filing.link} target="_blank" rel="noopener noreferrer" style={{ color: '#79bfff' }}>
                      View Full Filing
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button>
            <button onClick={() => setCurrentPage(p => p + 1)} disabled={(currentPage * 20) >= filteredFilings.length}>Next</button>
          </div>
        </div>
      ) : showFinancials ? (
        <div style={{ padding: '1rem' }}>
          <h3>{info.shortName || symbol} ({symbol}) – Financial Summary</h3>

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            {/* LEFT: Table of metrics */}
            <div style={{ flex: 1 }}>
              {financials.keyMetrics.length > 0 && financials.ratios.length > 0 ? (
                <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Metric</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Latest Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'PE Ratio', key: 'peRatio', source: 'keyMetrics' },
                      { label: 'PB Ratio', key: 'pbRatio', source: 'keyMetrics' },
                      { label: 'ROE (%)', key: 'returnOnEquity', source: 'keyMetrics', format: v => (v * 100).toFixed(2) },
                      { label: 'Gross Margin (%)', key: 'grossProfitMargin', source: 'ratios', format: v => (v * 100).toFixed(2) },
                      { label: 'EBITDA Margin (%)', key: 'ebitdaMargin', source: 'ratios', format: v => (v * 100).toFixed(2) },
                      { label: 'Net Profit Margin (%)', key: 'netProfitMargin', source: 'ratios', format: v => (v * 100).toFixed(2) },
                      { label: 'Debt/Equity', key: 'debtToEquity', source: 'keyMetrics' },
                      { label: 'Current Ratio', key: 'currentRatio', source: 'keyMetrics' },
                      { label: 'Market Cap', key: 'marketCap', source: 'keyMetrics', format: v => Number(v).toLocaleString() }
                    ].map((item, idx) => {
                      const latest = financials[item.source]?.[0]?.[item.key];
                      const isSelected = selectedMetric?.key === item.key;

                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedMetric(isSelected ? null : item)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#d0ebff' : 'transparent'
                          }}
                        >
                          <td>{item.label}</td>
                          <td>{item.format ? item.format(latest) : latest ?? '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p>Loading financial data...</p>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {selectedMetric && (
                <div style={{ marginTop: '1rem' }}>
                  <Plot
                    data={[
                      {
                        x: financials[selectedMetric.source].map(d => d.date),
                        y: financials[selectedMetric.source].map(d =>
                          selectedMetric.format
                            ? Number(selectedMetric.format(d[selectedMetric.key]))
                            : d[selectedMetric.key]
                        ),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: selectedMetric.label
                      }
                    ]}
                    layout={{
                      title: `${selectedMetric.label} over Time`,
                      xaxis: { title: 'Date' },
                      yaxis: { title: selectedMetric.label },
                      height: 400,
                      width: 600
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : showOptions ? (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1rem' }}>
                <label>
                  Expiration Date:
                  <select value={options.expiration} onChange={handleExpirationChange} style={{ marginLeft: '8px', padding: '4px' }}>
                    {options.expirations.map((exp, idx) => (
                      <option key={idx} value={exp}>{exp}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Show ± Strikes:
                  <select value={strikeWindow} onChange={handleStrikeWindowChange} style={{ marginLeft: '8px', padding: '4px' }}>
                    {[5, 10, 15, 20, 25].map(n => (
                      <option key={n} value={n}>{`±${n}`}</option>
                    ))}
                  </select>
                </label>
              </div>

              <table border="1" cellPadding="5">
                <thead>
                  <tr>
                    <th>Bid (Call)</th><th>Ask (Call)</th><th>Strike</th><th>Ask (Put)</th><th>Bid (Put)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOptions.calls.map((call, idx) => {
                    const put = filteredOptions.puts[idx] || {};
                    const isSelected = selectedOption?.strike === call.strike;
                    const strikeList = filteredOptions.calls.map(c => c.strike);
                    const price = info.currentPrice;
                    const closestIndex = strikeList.reduce((bestIdx, strike, i) =>
                      Math.abs(strike - price) < Math.abs(strikeList[bestIdx] - price) ? i : bestIdx, 0);
                    const closestStrike = strikeList[closestIndex];

                    const handleClick = () => setSelectedOption(isSelected ? null : {
                      strike: call.strike,
                      callGreeks: {
                        delta: call.delta, gamma: call.gamma, theta: call.theta,
                        vega: call.vega, rho: call.rho
                      },
                      putGreeks: {
                        delta: put.delta, gamma: put.gamma, theta: put.theta,
                        vega: put.vega, rho: put.rho
                      }
                    });

                    const rowColor = isSelected
                      ? '#d0ebff'
                      : call.strike === closestStrike
                      ? '#b6f7b0'
                      : 'transparent';

                    return (
                      <tr key={idx} onClick={handleClick} style={{ cursor: 'pointer', backgroundColor: rowColor }}>
                        <td>{call.bid ?? '–'}</td>
                        <td>{call.ask ?? '–'}</td>
                        <td>{call.strike}</td>
                        <td>{put.ask ?? '–'}</td>
                        <td>{put.bid ?? '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ flex: 1 }}>
              <div>{volumeChart}</div>
              {selectedOption && (
                <div style={{ marginTop: '2rem' }}>
                  <Plot
                    data={[
                      { x: ['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'], y: Object.values(selectedOption.callGreeks), type: 'bar', name: 'Call' },
                      { x: ['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'], y: Object.values(selectedOption.putGreeks), type: 'bar', name: 'Put' }
                    ]}
                    layout={{
                      title: `Greeks for Strike ${selectedOption.strike}`,
                      barmode: 'group',
                      width: 600,
                      height: 400
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', margin: '1rem 0' }}>
            <label>
              Stock Symbol:
              <input
                value={symbol}
                onChange={handleInputChange}
                style={{ marginLeft: 8, padding: '4px', width: '80px' }}
              />
            </label>
            <label>
              Period:
              <select
                value={period}
                onChange={(e) => {
                  const newPeriod = e.target.value;
                  setPeriod(newPeriod);
                  const valid = validIntervals[newPeriod] || ['1d'];
                  if (!valid.includes(interval)) {
                    setInterval(valid[0]);
                  }
                }}
                style={{ marginLeft: 8, padding: '4px' }}
              >
                {Object.keys(validIntervals).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Interval:
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                style={{ marginLeft: 8, padding: '4px' }}
              >
                {availableIntervals.map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </label>
          </div>

          {loading && <p>Loading data...</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}

          {history.length > 0 && (
            <>
              <h3>
                {info.shortName || symbol} ({symbol}) ${info.currentPrice?.toFixed(2) ?? '–'}
              </h3>

              <Plot
                data={[
                  {
                    x: dates,
                    open: history.map(d => d.Open),
                    high: history.map(d => d.High),
                    low: history.map(d => d.Low),
                    close: history.map(d => d.Close),
                    type: 'candlestick',
                    name: 'Price',
                    increasing: { line: { color: '#28a745' } },
                    decreasing: { line: { color: '#dc3545' } }
                  },
                  {
                    x: dates,
                    y: ema16,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'EMA-16',
                    line: { color: '#007bff', width: 1.5 }
                  },
                  {
                    x: dates,
                    y: ema52,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'EMA-52',
                    line: { color: '#ff9800', width: 1.5 }
                  },
                  {
                    x: dates,
                    y: volumes,
                    type: 'bar',
                    name: 'Volume',
                    yaxis: 'y2',
                    marker: { color: volumeColors },
                    opacity: 0.4
                  }
                ]}
                layout={{
                  title: `${symbol} Price`,
                  height: 500,
                  xaxis: {
                    title: { text: 'Date' },
                    rangeslider: { visible: false },
                    automargin: true
                  },
                  yaxis: {
                    title: { text: 'Price (USD)' },
                    automargin: true
                  },
                  yaxis2: {
                    overlaying: 'y',
                    side: 'right',
                    showgrid: false,
                    title: {text: 'Volume'},
                    range: [0, volumeYMax],
                    tickformat: '~s',
                    dtick: 250_000_000
                  },
                  margin: { t: 50, l: 60, r: 60, b: 60 },
                  showlegend: false
                }}
                style={{ width: '100%' }}
              />

              <table style={{ width: '100%', marginTop: '2rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Metric</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Market Cap</td><td>{info.marketCap?.toLocaleString()}</td></tr>
                  <tr><td>Trailing PE</td><td>{info.trailingPE ?? '–'}</td></tr>
                  <tr><td>Price to Book</td><td>{info.priceToBook ?? '–'}</td></tr>
                  <tr><td>Gross Margin</td><td>{(info.grossMargins * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>Operating Margin</td><td>{(info.operatingMargins * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>ROE</td><td>{(info.returnOnEquity * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>Revenue Growth</td><td>{(info.revenueGrowth * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>EPS Growth</td><td>{(info.earningsGrowth * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>EBITDA Margin</td><td>{(info.ebitdaMargins * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>Total Cash</td><td>{info.totalCash?.toLocaleString()}</td></tr>
                  <tr><td>Total Debt</td><td>{info.totalDebt?.toLocaleString()}</td></tr>
                  <tr><td>Current Ratio</td><td>{info.currentRatio ?? '–'}</td></tr>
                  <tr><td>Short % Float</td><td>{(info.shortPercentOfFloat * 100)?.toFixed(2)}%</td></tr>
                  <tr><td>Short Ratio</td><td>{info.shortRatio ?? '–'}</td></tr>
                  <tr><td>Beta</td><td>{info.beta ?? '–'}</td></tr>
                  <tr><td>Average Volume</td><td>{info.averageVolume?.toLocaleString()}</td></tr>
                  <tr><td>Latest Volume</td><td>{info.volume?.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;