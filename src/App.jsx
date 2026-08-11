import { useState, useEffect, useMemo } from 'react';
import { Search, Activity, UploadCloud, ChevronUp, ChevronDown, Filter, FileJson } from 'lucide-react';
import './index.css';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('ALL');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [sortConfig, setSortConfig] = useState({ key: 'ticker', direction: 'asc' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    // Tenta carregar o arquivo dummy primeiro (options_data.json)
    fetch('/options_data.json')
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('options_data.json não encontrado, aguardando upload manual', err);
        setLoading(false);
      });
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (Array.isArray(json)) {
          setData(json);
        } else {
          alert("O arquivo não possui o formato esperado de array de opções.");
        }
      } catch (err) {
        alert("Erro ao parsear o JSON.");
      }
    };
    reader.readAsText(file);
  };

  const filteredData = useMemo(() => {
    let filtered = data.filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch = 
        item.ticker?.toLowerCase().includes(q) ||
        item.asset?.toLowerCase().includes(q) ||
        item.valor?.toLowerCase().includes(q) ||
        item.vencimento?.includes(q);
      
      const matchesTipo = tipoFilter === 'ALL' || item.tipo === tipoFilter;
      const matchesAsset = assetFilter === 'ALL' || item.asset === assetFilter;

      return matchesSearch && matchesTipo && matchesAsset;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [data, search, tipoFilter, assetFilter, sortConfig]);

  const uniqueAssets = useMemo(() => {
    const assets = new Set(data.map(d => d.asset).filter(Boolean));
    return [...assets].sort();
  }, [data]);

  const metrics = useMemo(() => {
    return {
      total: data.length,
      calls: data.filter(d => d.tipo === 'Call').length,
      puts: data.filter(d => d.tipo === 'Put').length,
      assets: uniqueAssets.length
    };
  }, [data, uniqueAssets]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === 'rdsco2026') {
      setIsAuthenticated(true);
    } else {
      alert('Senha incorreta!');
      setPasswordInput('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', display: 'flex' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: '12px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <Activity size={48} color="var(--accent-blue)" style={{ marginBottom: '1rem' }} />
          <h2 style={{ marginBottom: '1.5rem' }} className="gradient-text">Acesso Restrito</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Digite a senha..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn active" style={{ justifyContent: 'center', width: '100%' }}>
              Acessar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1>
          <Activity size={28} color="var(--accent-blue)" />
          <span className="gradient-text">Opções Dashboard</span>
        </h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label className="btn glass">
            <UploadCloud size={16} /> Carregar JSON
            <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card glass">
          <div className="metric-title">Total de Opções</div>
          <div className="metric-value">{metrics.total}</div>
        </div>
        <div className="metric-card glass" style={{ borderColor: 'var(--accent-call-bg)' }}>
          <div className="metric-title">Opções Call</div>
          <div className="metric-value" style={{ color: 'var(--accent-call)' }}>{metrics.calls}</div>
        </div>
        <div className="metric-card glass" style={{ borderColor: 'var(--accent-put-bg)' }}>
          <div className="metric-title">Opções Put</div>
          <div className="metric-value" style={{ color: 'var(--accent-put)' }}>{metrics.puts}</div>
        </div>
        <div className="metric-card glass" style={{ borderColor: 'var(--accent-blue-bg)' }}>
          <div className="metric-title">Ativos Distintos</div>
          <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{metrics.assets}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            className="input-field" 
            style={{ paddingLeft: '2.75rem' }}
            placeholder="Buscar por Ticker (ex: ABEVA100, Put, 21/08)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={18} color="var(--text-secondary)" />
          <button className={`btn ${tipoFilter === 'ALL' ? 'active' : ''}`} onClick={() => setTipoFilter('ALL')}>Todos</button>
          <button className={`btn ${tipoFilter === 'Call' ? 'active' : ''}`} onClick={() => setTipoFilter('Call')}>Calls</button>
          <button className={`btn ${tipoFilter === 'Put' ? 'active' : ''}`} onClick={() => setTipoFilter('Put')}>Puts</button>

          <select 
            className="input-field" 
            style={{ width: 'auto', padding: '0.55rem 1rem' }}
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
          >
            <option value="ALL">Todos os Ativos</option>
            {uniqueAssets.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-container glass">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('ticker')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                Ticker {getSortIcon('ticker')}
              </th>
              <th onClick={() => handleSort('tipo')}>Tipo {getSortIcon('tipo')}</th>
              <th onClick={() => handleSort('raw_valor')}>Valor {getSortIcon('raw_valor')}</th>
              <th onClick={() => handleSort('vencimento_iso')}>Vencimento {getSortIcon('vencimento_iso')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length > 0 ? (
              filteredData.map((item, idx) => (
                <tr key={`${item.ticker}-${idx}`}>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{item.ticker}</td>
                  <td>
                    <span className={`badge-tipo ${item.tipo === 'Call' ? 'call' : 'put'}`}>
                      {item.tipo}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'ui-monospace, monospace' }}>{item.valor}</td>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{item.vencimento}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4">
                  <div className="empty-state">
                    <FileJson size={48} color="var(--border-color)" />
                    {loading ? "Carregando..." : "Nenhuma opção encontrada. Verifique os filtros ou faça upload de um JSON."}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
