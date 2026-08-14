import { useState, useEffect, useMemo } from 'react';
import { Search, Activity, UploadCloud, ChevronUp, ChevronDown, Filter, FileJson, ChevronLeft, ChevronRight, ExternalLink, Layers } from 'lucide-react';
import './index.css';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('ALL');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [vencFilter, setVencFilter] = useState('ALL');
  const [sortConfig, setSortConfig] = useState({ key: 'ticker', direction: 'asc' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, tipoFilter, assetFilter, vencFilter, sortConfig]);

  useEffect(() => {
    fetch('/options_data.json')
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar opções.');
        return res.json();
      })
      .then((json) => {
        if (Array.isArray(json) && json.length > 0) {
          setData(json);
          try {
            localStorage.setItem('b3_options_data', JSON.stringify(json));
          } catch (e) {}
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('options_data.json não encontrado ou erro ao buscar. Tentando localStorage...', err);
        const saved = localStorage.getItem('b3_options_data');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setData(parsed);
            }
          } catch (e) {}
        }
        setLoading(false);
      });
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      try {
        let json = null;
        if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
          const match = text.match(/const\s+(?:allData|RAW_DATA|optionsData)\s*=\s*(\[[\s\S]*?\]);/) ||
                        text.match(/(\[\s*\{\s*"ticker"[\s\S]*?\}\s*\])/);
          if (match) {
            json = JSON.parse(match[1]);
          } else {
            alert("Não foi possível localizar o array de opções dentro do arquivo HTML selecionado.");
            return;
          }
        } else {
          json = JSON.parse(text);
        }

        if (Array.isArray(json) && json.length > 0) {
          setData(json);
          try {
            localStorage.setItem('b3_options_data', JSON.stringify(json));
          } catch (errStorage) {
            console.warn('Limite do localStorage excedido', errStorage);
          }
          alert(`Sucesso! ${json.length.toLocaleString('pt-BR')} opções carregadas de ${file.name}.`);
        } else {
          alert("O arquivo não possui o formato esperado de array de opções.");
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao ler arquivo: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const assetCounts = useMemo(() => {
    const counts = {};
    data.forEach((item) => {
      if (item.asset) {
        counts[item.asset] = (counts[item.asset] || 0) + 1;
      }
    });
    return counts;
  }, [data]);

  const sortedAssetList = useMemo(() => {
    return Object.keys(assetCounts).sort();
  }, [assetCounts]);

  const filteredSidebarAssets = useMemo(() => {
    if (!assetSearch.trim()) return sortedAssetList;
    const q = assetSearch.toLowerCase();
    return sortedAssetList.filter(a => a.toLowerCase().includes(q));
  }, [sortedAssetList, assetSearch]);

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
      const matchesVenc = vencFilter === 'ALL' || item.vencimento === vencFilter;

      return matchesSearch && matchesTipo && matchesAsset && matchesVenc;
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
  }, [data, search, tipoFilter, assetFilter, vencFilter, sortConfig]);

  const uniqueVencimentos = useMemo(() => {
    const vencs = new Set(data.map(d => d.vencimento).filter(Boolean));
    return [...vencs].sort((a, b) => {
      const parse = str => str.split('/').reverse().join('');
      return parse(a).localeCompare(parse(b));
    });
  }, [data]);

  const metrics = useMemo(() => {
    return {
      total: data.length,
      calls: data.filter(d => d.tipo === 'Call').length,
      puts: data.filter(d => d.tipo === 'Put').length,
      assets: sortedAssetList.length
    };
  }, [data, sortedAssetList]);

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

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  if (!isAuthenticated) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', display: 'flex' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '2rem', borderRadius: '8px', textAlign: 'center', maxWidth: '400px', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <Activity size={40} color="#1859A9" style={{ marginBottom: '0.75rem' }} />
          <div style={{ display: 'inline-block', background: '#1859A9', color: '#FFF', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', marginBottom: '0.5rem' }}>
            INVESTING STYLE
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '1.25rem' }}>Acesso Restrito</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Digite a senha..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn active" style={{ justifyContent: 'center', width: '100%' }}>
              Acessar Painel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Estilo Investing.com */}
      <header className="header">
        <div className="brand-section">
          <span className="brand-tag">INVESTING STYLE</span>
          <div>
            <h1>
              <Activity size={22} color="#1859A9" />
              <span>Consulta de Opções B3</span>
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <a 
            href="https://investimentos.btgpactual.com/opcoes/margens/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn"
            title="Origem oficial em PDF"
          >
            <ExternalLink size={14} /> BTG Margens PDF
          </a>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <UploadCloud size={14} /> Carregar JSON / HTML
            <input type="file" accept=".json,.html,.htm" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {/* Main Layout with Sidebar */}
      <div className="dashboard-layout">
        {/* Sidebar de Ativos */}
        <aside className="assets-sidebar">
          <div className="sidebar-title-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={16} color="#1859A9" />
              Ativos ({metrics.assets})
            </span>
          </div>

          <div>
            <input 
              type="text"
              className="input-field"
              style={{ width: '100%', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
              placeholder="Filtrar ativo..."
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
            />
          </div>

          <div className="assets-scroll-list">
            <button 
              className={`asset-item-btn ${assetFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setAssetFilter('ALL')}
            >
              <span>Todos os Ativos</span>
              <span className="asset-badge-count">{data.length.toLocaleString('pt-BR')}</span>
            </button>
            
            {filteredSidebarAssets.map((asset) => (
              <button 
                key={asset}
                className={`asset-item-btn ${assetFilter === asset ? 'active' : ''}`}
                onClick={() => setAssetFilter(assetFilter === asset ? 'ALL' : asset)}
              >
                <span>{asset}</span>
                <span className="asset-badge-count">{assetCounts[asset]?.toLocaleString('pt-BR')}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          {/* Metrics Cards */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-title">Total de Opções</div>
              <div className="metric-value">{metrics.total.toLocaleString('pt-BR')}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Opções Call</div>
              <div className="metric-value" style={{ color: 'var(--color-green)' }}>{metrics.calls.toLocaleString('pt-BR')}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Opções Put</div>
              <div className="metric-value" style={{ color: 'var(--color-red)' }}>{metrics.puts.toLocaleString('pt-BR')}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Ativos Distintos</div>
              <div className="metric-value" style={{ color: '#1859A9' }}>{metrics.assets}</div>
            </div>
          </div>

          {/* Controls Filter Bar */}
          <div className="filter-bar">
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <input 
                type="text" 
                className="input-field" 
                style={{ width: '100%' }}
                placeholder="Buscar por Ticker (ex: ABEVA100, Put, 21/08)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={16} color="var(--text-muted)" />
              <button className={`btn ${tipoFilter === 'ALL' ? 'active' : ''}`} onClick={() => setTipoFilter('ALL')}>Todos</button>
              <button className={`btn ${tipoFilter === 'Call' ? 'active' : ''}`} onClick={() => setTipoFilter('Call')}>Calls</button>
              <button className={`btn ${tipoFilter === 'Put' ? 'active' : ''}`} onClick={() => setTipoFilter('Put')}>Puts</button>

              <select 
                className="input-field" 
                style={{ width: 'auto', padding: '0.45rem 0.8rem' }}
                value={vencFilter}
                onChange={(e) => setVencFilter(e.target.value)}
              >
                <option value="ALL">Todos os Vencimentos</option>
                {uniqueVencimentos.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Estilo Investing */}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('ticker')}>
                    Ticker {getSortIcon('ticker')}
                  </th>
                  <th onClick={() => handleSort('tipo')}>Tipo {getSortIcon('tipo')}</th>
                  <th onClick={() => handleSort('raw_valor')} style={{ textAlign: 'right' }}>Valor {getSortIcon('raw_valor')}</th>
                  <th onClick={() => handleSort('vencimento_iso')} style={{ textAlign: 'center' }}>Vencimento {getSortIcon('vencimento_iso')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((item, idx) => (
                    <tr key={`${item.ticker}-${idx}`}>
                      <td className="col-ticker">{item.ticker}</td>
                      <td>
                        <span className={`badge-tipo ${item.tipo === 'Call' ? 'call' : 'put'}`}>
                          {item.tipo}
                        </span>
                      </td>
                      <td className="col-price" style={{ textAlign: 'right' }}>{item.valor}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.vencimento}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">
                      <div className="empty-state">
                        <FileJson size={40} color="var(--border-dark)" />
                        {loading ? "Carregando cotações..." : "Nenhuma opção encontrada para os filtros aplicados."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {filteredData.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-header)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  Mostrando {paginatedData.length} de {filteredData.length.toLocaleString('pt-BR')} opções
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button 
                    className="btn" 
                    style={{ padding: '0.35rem 0.7rem' }}
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  <span style={{ fontSize: '0.8rem', color: '#0F172A', fontFamily: 'var(--font-mono)' }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button 
                    className="btn" 
                    style={{ padding: '0.35rem 0.7rem' }}
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Próxima <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
