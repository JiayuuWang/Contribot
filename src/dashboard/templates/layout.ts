export function layoutTemplate(title: string, content: string, activePage = "overview"): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ===== Theme variables ===== */
    [data-theme="dark"] {
      --bg-primary: #0d0d0d;
      --bg-secondary: #161616;
      --bg-tertiary: #1e1e1e;
      --bg-elevated: #1a1a1a;
      --sidebar-bg: #000000;
      --sidebar-text: #ececf1;
      --sidebar-hover: #1a1a1a;
      --sidebar-active: #2a2a2a;
      --text-primary: #ececf1;
      --text-secondary: #9a9a9a;
      --text-tertiary: #666;
      --border: #2a2a2a;
      --border-subtle: #1f1f1f;
      --accent: #10a37f;
      --accent-hover: #1ab98b;
      --accent-glow: rgba(16,163,127,0.15);
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #6366f1;
      --card-shadow: 0 0 0 1px var(--border);
      --radius: 12px;
      --radius-lg: 16px;
      --terminal-bg: #0a0a0a;
      --terminal-text: #d4d4d4;
      --terminal-dim: #555;
      --terminal-accent: #10a37f;
      --terminal-error: #f87171;
      --terminal-warn: #fbbf24;
      --terminal-info: #818cf8;
    }

    [data-theme="light"] {
      --bg-primary: #ffffff;
      --bg-secondary: #f9f9f9;
      --bg-tertiary: #f0f0f0;
      --bg-elevated: #ffffff;
      --sidebar-bg: #0d0d0d;
      --sidebar-text: #ececf1;
      --sidebar-hover: #1a1a1a;
      --sidebar-active: #2a2a2a;
      --text-primary: #0d0d0d;
      --text-secondary: #6e6e80;
      --text-tertiary: #8e8ea0;
      --border: #e5e5e5;
      --border-subtle: #eee;
      --accent: #10a37f;
      --accent-hover: #0d8c6d;
      --accent-glow: rgba(16,163,127,0.08);
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #6366f1;
      --card-shadow: 0 1px 3px rgba(0,0,0,0.06);
      --radius: 12px;
      --radius-lg: 16px;
      --terminal-bg: #1a1a2e;
      --terminal-text: #e0e0e0;
      --terminal-dim: #666;
      --terminal-accent: #10a37f;
      --terminal-error: #f87171;
      --terminal-warn: #fbbf24;
      --terminal-info: #818cf8;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-secondary);
      color: var(--text-primary);
      display: flex;
      min-height: 100vh;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== Sidebar ===== */
    .sidebar {
      width: 260px;
      background: var(--sidebar-bg);
      color: var(--sidebar-text);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      z-index: 100;
      padding: 16px 12px;
      border-right: 1px solid var(--border-subtle);
    }

    .sidebar-brand {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; margin-bottom: 24px;
      font-size: 16px; font-weight: 700;
      color: #fff; text-decoration: none;
    }
    .sidebar-brand svg { flex-shrink: 0; }

    .sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; }

    .sidebar-nav a {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: var(--radius);
      color: var(--sidebar-text); text-decoration: none;
      font-size: 14px; font-weight: 500;
      transition: background 0.15s;
    }
    .sidebar-nav a:hover { background: var(--sidebar-hover); }
    .sidebar-nav a.active { background: var(--sidebar-active); color: #fff; }
    .sidebar-nav a svg { width: 18px; height: 18px; opacity: 0.7; }

    .sidebar-section {
      font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--text-tertiary); padding: 20px 12px 6px;
    }

    .sidebar-footer {
      padding: 12px; border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 12px; color: var(--text-tertiary);
    }

    /* ===== Main ===== */
    .main { margin-left: 260px; flex: 1; min-height: 100vh; }

    .topbar {
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border);
      padding: 16px 32px;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 50;
      backdrop-filter: blur(12px);
    }
    .topbar h1 { font-size: 18px; font-weight: 600; }
    .topbar-actions { display: flex; gap: 8px; align-items: center; }

    .content { padding: 24px 32px; }

    /* ===== Cards ===== */
    .card {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--card-shadow);
      overflow: hidden;
    }
    .card-header {
      padding: 16px 20px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .card-header h2 { font-size: 15px; font-weight: 600; }
    .card-body { padding: 20px; }
    .card-body.no-pad { padding: 0; }

    /* ===== Stats ===== */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px; margin-bottom: 24px;
    }
    .stat-card {
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 20px;
      box-shadow: var(--card-shadow);
    }
    .stat-card .stat-label { font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 4px; }
    .stat-card .stat-value { font-size: 28px; font-weight: 700; color: var(--text-primary); }
    .stat-card .stat-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }

    /* ===== Tables ===== */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th {
      text-align: left; padding: 10px 16px;
      font-weight: 600; font-size: 12px;
      text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--text-secondary); background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }
    tbody td { padding: 12px 16px; border-bottom: 1px solid var(--border); color: var(--text-primary); }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--bg-tertiary); }

    /* ===== Badges ===== */
    .badge {
      display: inline-block; padding: 2px 10px;
      border-radius: 99px; font-size: 12px; font-weight: 600; line-height: 1.6;
    }
    [data-theme="dark"] .badge-success { background: rgba(16,163,127,0.15); color: #34d399; }
    [data-theme="dark"] .badge-danger  { background: rgba(239,68,68,0.15); color: #f87171; }
    [data-theme="dark"] .badge-warning { background: rgba(245,158,11,0.15); color: #fbbf24; }
    [data-theme="dark"] .badge-info    { background: rgba(99,102,241,0.15); color: #818cf8; }
    [data-theme="dark"] .badge-neutral { background: var(--bg-tertiary); color: var(--text-secondary); }
    [data-theme="light"] .badge-success { background: #dcfce7; color: #166534; }
    [data-theme="light"] .badge-danger  { background: #fee2e2; color: #991b1b; }
    [data-theme="light"] .badge-warning { background: #fef3c7; color: #92400e; }
    [data-theme="light"] .badge-info    { background: #dbeafe; color: #1e40af; }
    [data-theme="light"] .badge-neutral { background: var(--bg-tertiary); color: var(--text-secondary); }

    /* ===== Buttons ===== */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: var(--radius);
      font-size: 13px; font-weight: 500;
      border: 1px solid var(--border); background: var(--bg-primary);
      color: var(--text-primary); cursor: pointer;
      transition: all 0.15s; text-decoration: none;
    }
    .btn:hover { background: var(--bg-tertiary); text-decoration: none; }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-ghost { border: none; background: transparent; }
    .btn-ghost:hover { background: var(--bg-tertiary); }

    /* ===== Links ===== */
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ===== Terminal / log container ===== */
    .log-container {
      background: var(--terminal-bg);
      border-radius: 0;
      padding: 12px 16px;
      overflow-y: auto;
      font-family: 'Microsoft YaHei Mono', 'Cascadia Mono', 'Consolas', monospace;
      font-size: 12.5px;
      line-height: 1.7;
      color: var(--terminal-text);
    }
    .log-entry { display: flex; gap: 8px; padding: 1px 0; }
    .log-time { color: var(--terminal-dim); flex-shrink: 0; }
    .log-source { color: var(--terminal-accent); flex-shrink: 0; min-width: 90px; font-size: 11px; }
    .log-msg { color: var(--terminal-text); word-break: break-all; }
    .log-entry.level-error .log-msg { color: var(--terminal-error); }
    .log-entry.level-warn .log-msg { color: var(--terminal-warn); }
    .log-entry.level-debug .log-msg { color: var(--terminal-dim); }
    .log-repo { color: var(--terminal-info); font-size: 11px; }

    /* ===== Detail grid ===== */
    .detail-grid { display: grid; grid-template-columns: 160px 1fr; gap: 0; }
    .detail-grid dt { padding: 10px 16px; font-weight: 500; color: var(--text-secondary); border-bottom: 1px solid var(--border); font-size: 13px; }
    .detail-grid dd { padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }

    /* ===== Empty state ===== */
    .empty-state { text-align: center; padding: 48px 20px; color: var(--text-tertiary); }
    .empty-state p { margin-top: 8px; font-size: 13px; }

    /* ===== Pagination ===== */
    .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px; font-size: 13px; color: var(--text-secondary); }

    /* ===== Section spacing ===== */
    .section { margin-bottom: 24px; }

    /* ===== Theme toggle ===== */
    .theme-toggle {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; border: 1px solid var(--border);
      background: var(--bg-primary); cursor: pointer;
      color: var(--text-secondary); transition: all 0.2s;
    }
    .theme-toggle:hover { background: var(--bg-tertiary); color: var(--text-primary); }
    .theme-toggle svg { width: 16px; height: 16px; }

    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }

    /* ===== Responsive ===== */
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; }
      .content { padding: 16px; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <nav class="sidebar">
    <a href="/" class="sidebar-brand">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      Contribot
    </a>

    <div class="sidebar-nav">
      <a href="/" class="${activePage === "overview" ? "active" : ""}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Overview
      </a>
      <a href="/history" class="${activePage === "history" ? "active" : ""}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
        History
      </a>
      <a href="/logs" class="${activePage === "logs" ? "active" : ""}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Live Logs
      </a>

      <div class="sidebar-section">Repositories</div>
    </div>

    <div class="sidebar-footer">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span id="sidebar-live-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#555"></span>
          <span id="sidebar-live-label" style="font-size:11px">Checking…</span>
        </div>
        Contribot v0.1.0
      </div>
    </nav>

    <div class="main">
      ${content}
    </div>

    <script>
      // ===== Theme =====
      (function() {
        const saved = localStorage.getItem('contribot-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
      })();
      function toggleTheme() {
        const html = document.documentElement;
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('contribot-theme', next);
        // Update icon
        const btn = document.getElementById('theme-btn');
        if (btn) btn.innerHTML = next === 'dark'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
      }

      // ===== Sidebar status =====
      async function updateSidebarStatus() {
        try {
          const res = await fetch('/api/status');
          const d = await res.json();
          const dot = document.getElementById('sidebar-live-dot');
          const lbl = document.getElementById('sidebar-live-label');
          const n = d.activeTasks ?? 0;
          if (n > 0) {
            dot.style.background = '#10a37f';
            dot.style.animation = 'pulse 1.5s ease-in-out infinite';
            lbl.textContent = n + ' repo' + (n > 1 ? 's' : '') + ' working';
          } else {
            dot.style.background = '#555';
            dot.style.animation = '';
            lbl.textContent = 'Idle';
          }
        } catch(e) {
          document.getElementById('sidebar-live-label').textContent = 'Offline';
        }
      }
      updateSidebarStatus();
      setInterval(updateSidebarStatus, 5000);
    </script>
</body>
</html>`;
}
