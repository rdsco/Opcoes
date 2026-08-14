import os
import sys
import re
import json
import datetime
import webbrowser
import argparse
import urllib.request

DEFAULT_BTG_URL = "https://investimentos.btgpactual.com/opcoes/margens/"

# Set UTF-8 encoding for stdout
sys.stdout.reconfigure(encoding='utf-8')

# Call and Put letter definitions for B3 options
CALL_LETTERS = "ABCDEFGHIJKL"
PUT_LETTERS = "MNOPQRSTUVWX"

def extract_text_from_file(filepath, max_pages=None):
    """
    Extracts plain text content from either a .txt or .pdf file.
    If max_pages is set (e.g., 1), only extracts up to that many pages from PDF.
    """
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.txt':
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read(), 1
            
    elif ext == '.pdf':
        try:
            import pdfplumber
            full_text = []
            pages_read = 0
            with pdfplumber.open(filepath) as pdf:
                total_pages = len(pdf.pages)
                pages_to_process = min(max_pages, total_pages) if max_pages else total_pages
                
                for i in range(pages_to_process):
                    p_text = pdf.pages[i].extract_text()
                    if p_text:
                        full_text.append(p_text)
                    pages_read += 1
            return "\n".join(full_text), pages_read
        except ImportError:
            # Fallback to pypdf if pdfplumber is missing
            import pypdf
            reader = pypdf.PdfReader(filepath)
            total_pages = len(reader.pages)
            pages_to_process = min(max_pages, total_pages) if max_pages else total_pages
            full_text = []
            for i in range(pages_to_process):
                p_text = reader.pages[i].extract_text()
                if p_text:
                    full_text.append(p_text)
            return "\n".join(full_text), pages_to_process
    else:
        raise ValueError(f"Formato de arquivo não suportado: {ext}")

def parse_options_text(content, source_filename, pages_read=1):
    """
    Parses options text content and extracts Ticker, Price, Type (Call/Put), and Expiration Date.
    """
    # Extract reference date from text if available (e.g. "Atualizado em: 11/08/2026")
    ref_date_match = re.search(r"Atualizado em:\s*(\d{2})/(\d{2})/(\d{4})", content, re.IGNORECASE)
    if ref_date_match:
        ref_day, ref_month, ref_year = map(int, ref_date_match.groups())
        ref_date_str = f"{ref_day:02d}/{ref_month:02d}/{ref_year}"
    else:
        now = datetime.date.today()
        ref_day, ref_month, ref_year = now.day, now.month, now.year
        ref_date_str = now.strftime("%d/%m/%Y")

    # Match pattern: TICKER R$ PRECO
    matches = re.findall(r"([A-Z0-9]+)\s+R\$\s*([\d\.,]+)", content)

    parsed_options = []

    for ticker_raw, price_raw in matches:
        ticker = ticker_raw.strip()
        
        # Format price
        try:
            val_float = float(price_raw.replace('.', '').replace(',', '.')) if ',' in price_raw and '.' in price_raw else float(price_raw.replace(',', '.'))
        except ValueError:
            val_float = 0.0
            
        valor_str = f"R$ {val_float:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

        # Parse ticker components
        # Pattern: Asset (letters+digits before month code), Month letter (A-X), Strike+Suffix
        m = re.match(r"^([A-Z0-9]+?)([A-X])(\d.*)$", ticker)
        if not m:
            continue

        asset, month_code, rest = m.groups()

        if month_code in CALL_LETTERS:
            tipo = "Call"
            m_num = CALL_LETTERS.index(month_code) + 1
        elif month_code in PUT_LETTERS:
            tipo = "Put"
            m_num = PUT_LETTERS.index(month_code) + 1
        else:
            continue

        # Check for weekly series suffix (e.g. W1, W2, W4)
        w_match = re.search(r"W([1-5])$", ticker, re.IGNORECASE)
        w_num = int(w_match.group(1)) if w_match else None

        # Determine option year
        if m_num >= ref_month:
            target_year = ref_year
        else:
            target_year = ref_year + 1

        # Calculate Fridays of target month
        fridays = []
        for day in range(1, 32):
            try:
                d = datetime.date(target_year, m_num, day)
                if d.weekday() == 4: # Friday
                    fridays.append(d)
            except ValueError:
                break

        if not fridays:
            continue

        if w_num:
            if w_num <= len(fridays):
                venc_date = fridays[w_num - 1]
            else:
                venc_date = fridays[-1]
        else:
            # Standard monthly option: 3rd Friday
            if len(fridays) >= 3:
                venc_date = fridays[2]
            else:
                venc_date = fridays[-1]

        venc_str = venc_date.strftime("%d/%m/%Y")
        venc_iso = venc_date.strftime("%Y-%m-%d")

        parsed_options.append({
            "ticker": ticker,
            "asset": asset,
            "tipo": tipo,
            "valor": valor_str,
            "raw_valor": val_float,
            "vencimento": venc_str,
            "vencimento_iso": venc_iso
        })

    return parsed_options, ref_date_str

def generate_html(options_data, ref_date_str, source_info, output_html_path):
    """
    Generates a high-end interactive HTML page with search, filters, sorting, and metrics.
    """
    json_data = json.dumps(options_data, ensure_ascii=False)

    html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Consulta de Opções B3 - {source_info['filename']}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-main: #0B0E14;
            --bg-card: #151923;
            --bg-input: #1C2230;
            --border-color: #2A3245;
            --text-primary: #F1F5F9;
            --text-secondary: #94A3B8;
            --accent-call: #10B981;
            --accent-call-bg: rgba(16, 185, 129, 0.12);
            --accent-put: #EF4444;
            --accent-put-bg: rgba(239, 68, 68, 0.12);
            --accent-blue: #3B82F6;
            --accent-blue-bg: rgba(59, 130, 246, 0.12);
            --hover-row: #1E2536;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-main);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 2rem 1.5rem;
        }}

        .container {{
            max-width: 1200px;
            margin: 0 auto;
        }}

        /* Header */
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 2rem;
            padding-bottom: 1.25rem;
            border-bottom: 1px solid var(--border-color);
        }}

        .header h1 {{
            font-size: 1.75rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #FFFFFF 0%, #94A3B8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }}

        .header h1 span.badge {{
            font-size: 0.75rem;
            font-weight: 600;
            padding: 0.25rem 0.6rem;
            border-radius: 9999px;
            background: var(--accent-blue-bg);
            color: var(--accent-blue);
            border: 1px solid rgba(59, 130, 246, 0.3);
            -webkit-text-fill-color: var(--accent-blue);
        }}

        .ref-date {{
            font-size: 0.875rem;
            color: var(--text-secondary);
            background: var(--bg-card);
            padding: 0.5rem 1rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }}

        /* Dashboard Cards */
        .metrics-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }}

        .metric-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            transition: transform 0.2s ease, border-color 0.2s ease;
        }}

        .metric-card:hover {{
            transform: translateY(-2px);
            border-color: #3B82F6;
        }}

        .metric-title {{
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-secondary);
        }}

        .metric-value {{
            font-size: 1.8rem;
            font-weight: 700;
            font-family: 'JetBrains Mono', monospace;
        }}

        .metric-value.call {{ color: var(--accent-call); }}
        .metric-value.put {{ color: var(--accent-put); }}
        .metric-value.total {{ color: var(--text-primary); }}

        /* Controls Section */
        .controls-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.25rem;
            margin-bottom: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }}

        .search-row {{
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }}

        .search-box {{
            flex: 1;
            min-width: 280px;
            position: relative;
        }}

        .search-box input {{
            width: 100%;
            padding: 0.75rem 1rem 0.75rem 2.75rem;
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--text-primary);
            font-size: 0.95rem;
            outline: none;
            transition: border-color 0.2s;
        }}

        .search-box input:focus {{
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }}

        .search-icon {{
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-secondary);
            pointer-events: none;
        }}

        .filter-group {{
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            align-items: center;
        }}

        .filter-btn {{
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 0.55rem 1rem;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }}

        .filter-btn:hover {{
            background: #252D3F;
            color: var(--text-primary);
        }}

        .filter-btn.active {{
            background: var(--accent-blue);
            color: #FFFFFF;
            border-color: var(--accent-blue);
        }}

        .filter-btn.active.call-btn {{
            background: var(--accent-call);
            border-color: var(--accent-call);
        }}

        .filter-btn.active.put-btn {{
            background: var(--accent-put);
            border-color: var(--accent-put);
        }}

        .select-input {{
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 0.55rem 1rem;
            border-radius: 8px;
            font-size: 0.85rem;
            outline: none;
            cursor: pointer;
        }}

        /* Table */
        .table-container {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }}

        th {{
            background: #11141C;
            color: var(--text-secondary);
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            user-select: none;
            transition: color 0.2s;
        }}

        th:hover {{
            color: var(--text-primary);
        }}

        th.sort-active {{
            color: var(--accent-blue);
        }}

        td {{
            padding: 0.9rem 1.25rem;
            border-bottom: 1px solid rgba(42, 50, 69, 0.5);
            font-size: 0.9rem;
            color: var(--text-primary);
        }}

        tr:last-child td {{
            border-bottom: none;
        }}

        tr:hover td {{
            background-color: var(--hover-row);
        }}

        .ticker-cell {{
            font-family: 'JetBrains Mono', monospace;
            font-weight: 700;
            letter-spacing: 0.03em;
            color: #FFFFFF;
        }}

        .badge-tipo {{
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.25rem 0.65rem;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }}

        .badge-tipo.call {{
            background: var(--accent-call-bg);
            color: var(--accent-call);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }}

        .badge-tipo.put {{
            background: var(--accent-put-bg);
            color: var(--accent-put);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }}

        .price-cell {{
            font-family: 'JetBrains Mono', monospace;
            font-weight: 600;
            color: #F8FAFC;
        }}

        .date-cell {{
            color: var(--text-secondary);
            font-weight: 500;
        }}

        /* Pagination & Footer */
        .pagination-container {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.25rem;
            background: #11141C;
            border-top: 1px solid var(--border-color);
            flex-wrap: wrap;
            gap: 1rem;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }}

        .pagination-controls {{
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }}

        .page-btn {{
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 0.35rem 0.75rem;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background 0.2s;
        }}

        .page-btn:disabled {{
            opacity: 0.4;
            cursor: not-allowed;
        }}

        .page-btn:not(:disabled):hover {{
            background: var(--accent-blue);
            border-color: var(--accent-blue);
        }}

        .empty-state {{
            padding: 3rem;
            text-align: center;
            color: var(--text-secondary);
        }}

        .empty-state svg {{
            margin-bottom: 1rem;
            color: #475569;
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>
                Opções B3
                <span class="badge">{source_info['filename']} ({source_info['pages_str']})</span>
            </h1>
            <div class="ref-date">
                📅 Referência: <strong>{ref_date_str}</strong>
            </div>
        </div>

        <!-- Metrics Cards -->
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">Total de Opções</div>
                <div class="metric-value total" id="metric-total">0</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Opções Call</div>
                <div class="metric-value call" id="metric-calls">0</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Opções Put</div>
                <div class="metric-value put" id="metric-puts">0</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Ativos Na Lista</div>
                <div class="metric-value" style="color: var(--accent-blue);" id="metric-assets">0</div>
            </div>
        </div>

        <!-- Controls -->
        <div class="controls-card">
            <div class="search-row">
                <div class="search-box">
                    <svg class="search-icon" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <input type="text" id="search-input" placeholder="Buscar por Ticker (ex: ABEVA100, BRKM, Put, 21/08)...">
                </div>
                
                <div class="filter-group">
                    <button class="filter-btn active" data-tipo="ALL" onclick="filterTipo('ALL')">Todos</button>
                    <button class="filter-btn call-btn" data-tipo="Call" onclick="filterTipo('Call')">Calls</button>
                    <button class="filter-btn put-btn" data-tipo="Put" onclick="filterTipo('Put')">Puts</button>
                    
                    <select id="asset-select" class="select-input" onchange="applyFilters()">
                        <option value="ALL">Todos os Ativos</option>
                    </select>

                    <select id="venc-select" class="select-input" onchange="applyFilters()">
                        <option value="ALL">Todos os Vencimentos</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Table Container -->
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th onclick="sortTable('ticker')">Ticker <span id="sort-ticker"></span></th>
                        <th onclick="sortTable('tipo')">Tipo <span id="sort-tipo"></span></th>
                        <th onclick="sortTable('raw_valor')">Valor <span id="sort-raw_valor"></span></th>
                        <th onclick="sortTable('vencimento_iso')">Vencimento <span id="sort-vencimento_iso"></span></th>
                    </tr>
                </thead>
                <tbody id="table-body">
                    <!-- Dynamic Rows -->
                </tbody>
            </table>

            <div id="empty-message" class="empty-state" style="display: none;">
                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p>Nenhuma opção encontrada para os filtros aplicados.</p>
            </div>

            <!-- Pagination -->
            <div class="pagination-container">
                <div id="page-info">Mostrando 0 de 0 opções</div>
                <div class="pagination-controls">
                    <button class="page-btn" id="btn-prev" onclick="changePage(-1)">Anterior</button>
                    <span id="page-number">Página 1 de 1</span>
                    <button class="page-btn" id="btn-next" onclick="changePage(1)">Próxima</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Raw Data from Python Parser
        const allData = {json_data};

        let currentFilteredData = [...allData];
        let currentTipoFilter = 'ALL';
        let sortColumn = 'ticker';
        let sortDirection = 'asc'; // 'asc' or 'desc'

        let currentPage = 1;
        const pageSize = 50;

        function initApp() {{
            updateMetrics(allData);
            populateDropdowns(allData);
            applyFilters();
        }}

        function updateMetrics(data) {{
            document.getElementById('metric-total').textContent = data.length.toLocaleString('pt-BR');
            
            const calls = data.filter(d => d.tipo === 'Call').length;
            const puts = data.filter(d => d.tipo === 'Put').length;
            const assets = new Set(data.map(d => d.asset)).size;

            document.getElementById('metric-calls').textContent = calls.toLocaleString('pt-BR');
            document.getElementById('metric-puts').textContent = puts.toLocaleString('pt-BR');
            document.getElementById('metric-assets').textContent = assets;
        }}

        function populateDropdowns(data) {{
            const assetSelect = document.getElementById('asset-select');
            const vencSelect = document.getElementById('venc-select');

            const assets = [...new Set(data.map(d => d.asset))].sort();
            const vencimentos = [...new Set(data.map(d => d.vencimento))].sort((a, b) => {{
                const [da, ma, ya] = a.split('/').map(Number);
                const [db, mb, yb] = b.split('/').map(Number);
                return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
            }});

            assets.forEach(a => {{
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = a;
                assetSelect.appendChild(opt);
            }});

            vencimentos.forEach(v => {{
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                vencSelect.appendChild(opt);
            }});
        }}

        function filterTipo(tipo) {{
            currentTipoFilter = tipo;
            document.querySelectorAll('.filter-btn').forEach(btn => {{
                if (btn.dataset.tipo === tipo) {{
                    btn.classList.add('active');
                }} else {{
                    btn.classList.remove('active');
                }}
            }});
            applyFilters();
        }}

        function applyFilters() {{
            const query = document.getElementById('search-input').value.trim().toLowerCase();
            const selectedAsset = document.getElementById('asset-select').value;
            const selectedVenc = document.getElementById('venc-select').value;

            currentFilteredData = allData.filter(item => {{
                const matchesQuery = !query || 
                    item.ticker.toLowerCase().includes(query) ||
                    item.asset.toLowerCase().includes(query) ||
                    item.tipo.toLowerCase().includes(query) ||
                    item.valor.toLowerCase().includes(query) ||
                    item.vencimento.includes(query);

                const matchesTipo = (currentTipoFilter === 'ALL') || (item.tipo === currentTipoFilter);
                const matchesAsset = (selectedAsset === 'ALL') || (item.asset === selectedAsset);
                const matchesVenc = (selectedVenc === 'ALL') || (item.vencimento === selectedVenc);

                return matchesQuery && matchesTipo && matchesAsset && matchesVenc;
            }});

            currentPage = 1;
            sortData();
            renderTable();
        }}

        function sortTable(column) {{
            if (sortColumn === column) {{
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            }} else {{
                sortColumn = column;
                sortDirection = 'asc';
            }}
            sortData();
            renderTable();
        }}

        function sortData() {{
            currentFilteredData.sort((a, b) => {{
                let valA = a[sortColumn];
                let valB = b[sortColumn];

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            }});

            ['ticker', 'tipo', 'raw_valor', 'vencimento_iso'].forEach(col => {{
                const el = document.getElementById('sort-' + col);
                if (el) {{
                    if (col === sortColumn) {{
                        el.textContent = sortDirection === 'asc' ? ' ▲' : ' ▼';
                        el.parentElement.classList.add('sort-active');
                    }} else {{
                        el.textContent = '';
                        el.parentElement.classList.remove('sort-active');
                    }}
                }}
            }});
        }}

        function renderTable() {{
            const tbody = document.getElementById('table-body');
            const emptyMsg = document.getElementById('empty-message');
            tbody.innerHTML = '';

            if (currentFilteredData.length === 0) {{
                emptyMsg.style.display = 'block';
                document.getElementById('page-info').textContent = 'Mostrando 0 de 0 opções';
                document.getElementById('page-number').textContent = 'Página 0 de 0';
                document.getElementById('btn-prev').disabled = true;
                document.getElementById('btn-next').disabled = true;
                return;
            }}

            emptyMsg.style.display = 'none';

            const totalPages = Math.ceil(currentFilteredData.length / pageSize);
            if (currentPage > totalPages) currentPage = totalPages;

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, currentFilteredData.length);
            const pageData = currentFilteredData.slice(startIndex, endIndex);

            pageData.forEach(item => {{
                const tr = document.createElement('tr');
                const tipoBadgeClass = item.tipo === 'Call' ? 'call' : 'put';

                tr.innerHTML = `
                    <td class="ticker-cell">${{item.ticker}}</td>
                    <td>
                        <span class="badge-tipo ${{tipoBadgeClass}}">
                            ${{item.tipo}}
                        </span>
                    </td>
                    <td class="price-cell">${{item.valor}}</td>
                    <td class="date-cell">${{item.vencimento}}</td>
                `;
                tbody.appendChild(tr);
            }});

            document.getElementById('page-info').textContent = `Mostrando ${{startIndex + 1}}–${{endIndex}} de ${{currentFilteredData.length.toLocaleString('pt-BR')}} opções`;
            document.getElementById('page-number').textContent = `Página ${{currentPage}} de ${{totalPages}}`;
            document.getElementById('btn-prev').disabled = currentPage === 1;
            document.getElementById('btn-next').disabled = currentPage === totalPages;
        }}

        function changePage(delta) {{
            currentPage += delta;
            renderTable();
        }}

        document.getElementById('search-input').addEventListener('input', applyFilters);
        window.addEventListener('DOMContentLoaded', initApp);
    </script>
</body>
</html>
"""

    with open(output_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"--> HTML gerado com sucesso em: {output_html_path}")


def download_pdf_from_btg(url=DEFAULT_BTG_URL, dest_path="btg_margens.pdf"):
    """
    Faz o download do PDF de margens de opções diretamente do BTG Pactual.
    """
    print(f"Obtendo PDF atualizado do BTG: {url}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8'
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read()
            if len(content) < 1000:
                raise ValueError("O conteúdo baixado é muito curto para ser um PDF válido.")
            with open(dest_path, "wb") as f:
                f.write(content)
        print(f"--> PDF baixado com sucesso ({len(content):,} bytes) e salvo em: {dest_path}")
        return dest_path
    except Exception as e:
        print(f"[AVISO] Falha ao baixar PDF de {url}: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Importador de Opções B3 (BTG Pactual PDF e TXT)")
    parser.add_argument("source", nargs="?", default=None, help="Caminho do arquivo TXT/PDF local ou URL. Se não informado, baixa da URL do BTG.")
    parser.add_argument("--url", type=str, default=DEFAULT_BTG_URL, help="URL de origem do PDF de margens do BTG")
    parser.add_argument("--offline", action="store_true", help="Usar arquivo local existente sem tentar baixar da web")
    parser.add_argument("--max-pages", type=int, default=1, help="Número máximo de páginas a importar (para PDF). Padrão: 1")
    parser.add_argument("--output-html", type=str, default=None, help="Nome do arquivo HTML de saída")
    parser.add_argument("--no-browser", action="store_true", help="Não abrir o navegador automaticamente após gerar o HTML")
    
    args = parser.parse_args()

    current_dir = os.path.dirname(os.path.abspath(__file__))
    default_local_pdf = os.path.join(current_dir, "btg_margens.pdf")

    source_input = args.source
    input_path = None

    if source_input and (source_input.startswith("http://") or source_input.startswith("https://")):
        downloaded = download_pdf_from_btg(source_input, default_local_pdf)
        if not downloaded:
            print("[ERRO] Não foi possível baixar o PDF da URL informada.")
            sys.exit(1)
        input_path = default_local_pdf
    elif source_input and os.path.exists(source_input if os.path.isabs(source_input) else os.path.join(current_dir, source_input)):
        input_path = source_input if os.path.isabs(source_input) else os.path.join(current_dir, source_input)
    elif args.offline:
        input_path = default_local_pdf
        if not os.path.exists(input_path):
            print(f"[ERRO] Modo offline solicitado, mas o arquivo local não foi encontrado: {input_path}")
            sys.exit(1)
    else:
        # Padrão online: tenta baixar da URL do BTG
        downloaded = download_pdf_from_btg(args.url, default_local_pdf)
        if downloaded:
            input_path = default_local_pdf
        elif os.path.exists(default_local_pdf):
            print(f"[INFO] Utilizando arquivo local como fallback: {default_local_pdf}")
            input_path = default_local_pdf
        else:
            print("[ERRO] Não foi possível obter o PDF online e nenhum arquivo local foi encontrado.")
            sys.exit(1)

    filename_base = os.path.basename(input_path)
    output_html_name = args.output_html if args.output_html else f"opcoes_{os.path.splitext(filename_base)[0]}.html"
    output_html_path = os.path.join(current_dir, output_html_name)

    print(f"Processando arquivo: {input_path} (Máx Páginas: {args.max_pages if input_path.lower().endswith('.pdf') else 'N/A'})...")
    
    content, pages_read = extract_text_from_file(input_path, max_pages=args.max_pages)
    source_info = {
        "filename": filename_base,
        "pages_str": f"{pages_read} pág." if input_path.lower().endswith('.pdf') else "TXT"
    }

    options_data, ref_date_str = parse_options_text(content, filename_base, pages_read)

    if options_data:
        print(f"--> Sucesso! {len(options_data)} opções extraídas e validadas.")
        
        # Salva o JSON no diretório raiz e em public/
        json_content = json.dumps(options_data, ensure_ascii=False, indent=2)
        root_json_path = os.path.join(current_dir, "options_data.json")
        public_json_path = os.path.join(current_dir, "public", "options_data.json")
        
        with open(root_json_path, "w", encoding="utf-8") as f:
            f.write(json_content)
            
        if os.path.exists(os.path.join(current_dir, "public")):
            with open(public_json_path, "w", encoding="utf-8") as f:
                f.write(json_content)
            print(f"--> JSON atualizado em: {public_json_path}")
            
        generate_html(options_data, ref_date_str, source_info, output_html_path)
        if not args.no_browser:
            print("\nAbrindo visualizador no navegador...")
            webbrowser.open(f"file:///{output_html_path.replace(os.sep, '/')}")
    else:
        print("[ERRO] Falha ao processar dados do arquivo.")

if __name__ == "__main__":
    main()
