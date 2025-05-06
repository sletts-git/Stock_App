import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';

function App() {
  const [symbol, setSymbol] = useState('SMCI');
  const [period, setPeriod] = useState('1mo');
  const [interval, setInterval] = useState('1d');
  const [history, setHistory] = useState([]);
  const [info, setInfo] = useState({});
  const [options, setOptions] = useState({ calls: [], puts: [], expiration: '', expirations: [] });
  const [strikeWindow, setStrikeWindow] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);

  const [showFilings, setShowFilings] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [filings, setFilings] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIndex, setExpandedIndex] = useState(null);

  const fetchOptions = async (sym, expiration = null) => {
    const url = expiration
      ? `http://localhost:8000/api/options/${sym}/?expiration=${expiration}`
      : `http://localhost:8000/api/options/${sym}/`;
    const res = await axios.get(url);
    return res.data.data;
  };

  const fetchData = async () => {
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

  useEffect(() => {
    fetchData();
  }, [symbol, period, interval]);

  useEffect(() => {
    if (showFilings) {
      axios.get(`http://localhost:8000/api/filings/${symbol}/`)
        .then(res => setFilings(res.data.filings))
        .catch(() => setFilings([]));
    }
  }, [showFilings, symbol]);

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

  const filteredOptions = (() => {
    const price = info.currentPrice;
    if (!price || !options.calls.length || !options.puts.length) return { calls: [], puts: [] };

    const strikeList = options.calls.map(c => c.strike);
    const closestIndex = strikeList.reduce((bestIdx, strike, idx) =>
      Math.abs(strike - price) < Math.abs(strikeList[bestIdx] - price) ? idx : bestIdx, 0);

    const start = Math.max(0, closestIndex - strikeWindow);
    const end = closestIndex + strikeWindow + 1;

    return {
      calls: options.calls.slice(start, end),
      puts: options.puts.slice(start, end)
    };
  })();

  return (
    <div style={{ backgroundColor: showFilings ? '#121212' : '#fff', color: showFilings ? '#eee' : '#000', minHeight: '100vh' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#111',
        color: '#fff',
        padding: '1rem'
      }}>
        <h2>{showFilings ? 'SEC Filings' : showOptions ? 'Options Chain' : 'Stock Dashboard'}</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => {
              setShowOptions(!showOptions);
              setShowFilings(false);
              setSelectedOption(null);
            }}
            style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #666' }}
          >
            {showOptions ? 'Back to Dashboard' : 'Options Chain'}
          </button>
          <button
            onClick={() => {
              setShowFilings(!showFilings);
              setShowOptions(false);
              setSelectedOption(null);
            }}
            style={{ padding: '8px', background: '#333', color: 'white', border: '1px solid #666' }}
          >
            {showFilings ? 'Back to Dashboard' : 'View SEC Filings'}
          </button>
        </div>
      </div>

      {showFilings ? (
        <div style={{ padding: '1rem' }}>
          <h3>SEC Filings for {symbol}</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {filings.slice((currentPage - 1) * 20, currentPage * 20).map((filing, idx) => (
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
            <button onClick={() => setCurrentPage(p => p + 1)} disabled={(currentPage * 20) >= filings.length}>Next</button>
          </div>
        </div>
      ) : showOptions ? (
        <div style={{ padding: '1rem', display: 'flex', gap: '2rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1rem' }}>
              <label>
                Expiration Date:
                <select value={options.expiration} onChange={handleExpirationChange} style={{ marginLeft: '8px', padding: '4px' }}>
                  {options.expirations.map((exp, idx) => <option key={idx} value={exp}>{exp}</option>)}
                </select>
              </label>
              <label>
                Show ± Strikes:
                <select value={strikeWindow} onChange={handleStrikeWindowChange} style={{ marginLeft: '8px', padding: '4px' }}>
                  {[5, 10, 15, 20, 25].map(n => <option key={n} value={n}>{`±${n}`}</option>)}
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
                  const handleClick = () => setSelectedOption(isSelected ? null : {
                    strike: call.strike,
                    callGreeks: { delta: call.delta, gamma: call.gamma, theta: call.theta, vega: call.vega, rho: call.rho },
                    putGreeks: { delta: put.delta, gamma: put.gamma, theta: put.theta, vega: put.vega, rho: put.rho }
                  });
                  return (
                    <tr key={idx} onClick={handleClick} style={{ cursor: 'pointer', backgroundColor: isSelected ? '#d0ebff' : '' }}>
                      <td>{call.bid ?? '–'}</td><td>{call.ask ?? '–'}</td><td>{call.strike}</td>
                      <td>{put.ask ?? '–'}</td><td>{put.bid ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selectedOption && (
            <Plot data={[
              { x: ['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'], y: Object.values(selectedOption.callGreeks), type: 'bar', name: 'Call' },
              { x: ['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'], y: Object.values(selectedOption.putGreeks), type: 'bar', name: 'Put' }
            ]} layout={{ title: `Greeks for Strike ${selectedOption.strike}`, barmode: 'group', width: 600, height: 400 }} />
          )}
        </div>
      ) : (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', margin: '1rem 0' }}>
            <label>
              Stock Symbol:
              <input value={symbol} onChange={handleInputChange} style={{ marginLeft: 8, padding: '4px', width: '80px' }} />
            </label>
            <label>
              Period:
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ marginLeft: 8, padding: '4px' }}>
                {['1d', '5d', '1mo', '3mo', '6mo', '12mo'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              Interval:
              <select value={interval} onChange={(e) => setInterval(e.target.value)} style={{ marginLeft: 8, padding: '4px' }}>
                {['1m', '5m', '15m', '30m', '1d', '1wk'].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
          </div>
          {loading && <p>Loading data...</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}
          {history.length > 0 && (
            <>
              <h3>{info.shortName || symbol} ({symbol})</h3>
              <Plot data={[{ x: dates, y: closePrices, type: 'scatter', mode: 'lines+markers' }]} layout={{ title: `${symbol} Price`, width: 800, height: 400 }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;