import { useState, useEffect, useMemo } from 'react';
import { Search, Activity, UploadCloud, ChevronUp, ChevronDown, Filter, FileJson, ChevronLeft, ChevronRight, ExternalLink, Layers, Database } from 'lucide-react';
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

  // Reseta a página para 1 sempre que os filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [search, tipoFilter, assetFilter, vencFilter, sortConfig]);

  useEffect(() => {
    // Busca sempre do servidor /options_data.json atualizado primeiro
    fetch('/options_data.json')
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar arquivo de opções.');
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
          alert(`Sucesso! ${json.length.toLocaleString('pt-BR')} opções carregadas do arquivo ${file.name}.`);
        } else {
          alert("O arquivo não possui o formato esperado de array de opções.");
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao ler ou parsear o arquivo: " + err.message);
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

  // Pagination Logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

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
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a 
            href="https://investimentos.btgpactual.com/opcoes/margens/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn glass"
            title="Origem oficial do PDF de Margens"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <ExternalLink size={16} /> BTG Margens PDF
          </a>
          <label className="btn glass" style={{ cursor: 'pointer' }}>
            <UploadCloud size={16} /> Carregar JSON / HTML
            <input type="file" accept=".json,.html,.htm" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {/* Main Layout with Sidebar */}
      <div className="dashboard-layout">
        {/* Sidebar de Ativos */}
        <aside className="assets-sidebar glass">
          <div className="sidebar-title-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} color="var(--accent-blue)" />
              Ativos ({metrics.assets})
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text"
              className="input-field asset-search-input"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Buscar ativo..."
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
            <div className="metric-card glass">
              <div className="metric-title">Total de Opções</div>
              <div className="metric-value">{metrics.total.toLocaleString('pt-BR')}</div>
            </div>
            <div className="metric-card glass" style={{ borderColor: 'var(--accent-call-bg)' }}>
              <div className="metric-title">Opções Call</div>
              <div className="metric-value" style={{ color: 'var(--accent-call)' }}>{metrics.calls.toLocaleString('pt-BR')}</div>
            </div>
            <div className="metric-card glass" style={{ borderColor: 'var(--accent-put-bg)' }}>
              <div className="metric-title">Opções Put</div>
              <div className="metric-value" style={{ color: 'var(--accent-put)' }}>{metrics.puts.toLocaleString('pt-BR')}</div>
            </div>
            <div className="metric-card glass" style={{ borderColor: 'var(--accent-blue-bg)' }}>
              <div className="metric-title">Ativos Distintos</div>
              <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{metrics.assets}</div>
            </div>
          </div>

          {/* Controls */}
          <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
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
                {paginatedData.length > 0 ? (
                  paginatedData.map((item, idx) => (
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
                        {loading ? "Carregando opções..." : "Nenhuma opção encontrada para os filtros aplicados."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {filteredData.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Mostrando {paginatedData.length} de {filteredData.length.toLocaleString('pt-BR')} opções
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button 
                    className="btn glass" 
                    style={{ padding: '0.4rem 0.8rem' }}
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button 
                    className="btn glass" 
                    style={{ padding: '0.4rem 0.8rem' }}
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Próxima <ChevronRight size={16} />
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
