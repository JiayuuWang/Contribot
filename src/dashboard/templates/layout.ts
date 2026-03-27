export function layoutTemplate(title: string, content: string, activePage = "overview"): string {
  return `<!DOCTYPE html>
<html lang="en">
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

    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f7f7f8;
      --bg-tertiary: #ececf1;
      --sidebar-bg: #0d0d0d;
      --sidebar-text: #ececf1;
      --sidebar-hover: #1a1a2e;
      --sidebar-active: #2a2a3e;
      --text-primary: #0d0d0d;
      --text-secondary: #6e6e80;
      --text-tertiary: #8e8ea0;
      --border: #e5e5e5;
      --accent: #10a37f;
      --accent-hover: #0d8c6d;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --card-shadow: 0 1px 3px rgba(0,0,0,0.08);
      --radius: 8px;
      --radius-lg: 12px;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-secondary);
      color: var(--text-primary);
      display: flex;
      min-height: 100vh;
      font-size: 14px;
      line-height: 1.5;
    }

    /* Sidebar */
    .sidebar {
      width: 260px;
      background: var(--sidebar-bg);
      color: var(--sidebar-text);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 100;
      padding: 16px 12px;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      margin-bottom: 24px;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      text-decoration: none;
    }

    .sidebar-brand svg { flex-shrink: 0; }

    .sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; }

    .sidebar-nav a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius);
      color: var(--sidebar-text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.15s;
    }

    .sidebar-nav a:hover { background: var(--sidebar-hover); }
    .sidebar-nav a.active { background: var(--sidebar-active); color: #fff; }

    .sidebar-nav a svg {
      width: 18px;
      height: 18px;
      opacity: 0.7;
    }

    .sidebar-section {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
      padding: 20px 12px 6px;
    }

    .sidebar-footer {
      padding: 12px;
      border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 12px;
      color: var(--text-tertiary);
    }

    /* Main content */
    .main {
      margin-left: 260px;
      flex: 1;
      min-height: 100vh;
    }

    .topbar {
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border);
      padding: 16px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .topbar h1 {
      font-size: 18px;
      font-weight: 600;
    }

    .topbar-actions { display: flex; gap: 8px; align-items: center; }

    .content { padding: 24px 32px; }

    /* Cards */
    .card {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--card-shadow);
    }

    .card-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-header h2 {
      font-size: 15px;
      font-weight: 600;
    }

    .card-body { padding: 20px; }
    .card-body.no-pad { padding: 0; }

    /* Stats grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--card-shadow);
    }

    .stat-card .stat-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .stat-card .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-card .stat-sub {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-top: 4px;
    }

    /* Tables */
    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead th {
      text-align: left;
      padding: 10px 16px;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }

    tbody td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      color: var(--text-primary);
    }

    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--bg-secondary); }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.6;
    }

    .badge-success { background: #dcfce7; color: #166534; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-info { background: #dbeafe; color: #1e40af; }
    .badge-neutral { background: var(--bg-tertiary); color: var(--text-secondary); }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      border: 1px solid var(--border);
      background: var(--bg-primary);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.15s;
      text-decoration: none;
    }

    .btn:hover { background: var(--bg-secondary); }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }

    /* Links */
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Live log */
    .log-container {
      background: #1a1a2e;
      border-radius: var(--radius);
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.7;
      color: #e0e0e0;
    }

    .log-entry { display: flex; gap: 8px; }
    .log-time { color: #666; flex-shrink: 0; }
    .log-source { color: var(--accent); flex-shrink: 0; min-width: 100px; }
    .log-msg { color: #e0e0e0; word-break: break-all; }
    .log-entry.level-error .log-msg { color: #f87171; }
    .log-entry.level-warn .log-msg { color: #fbbf24; }
    .log-entry.level-debug .log-msg { color: #888; }
    .log-repo { color: #818cf8; font-size: 11px; }

    /* Detail list */
    .detail-grid {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 0;
    }

    .detail-grid dt {
      padding: 10px 16px;
      font-weight: 500;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }

    .detail-grid dd {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 48px 20px;
      color: var(--text-tertiary);
    }

    .empty-state p { margin-top: 8px; font-size: 13px; }

    /* Pagination */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    /* Section spacing */
    .section { margin-bottom: 24px; }

    /* Responsive */
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

    <div class="sidebar-footer">Contribot v0.1.0</div>
  </nav>

  <div class="main">
    ${content}
  </div>

  <script>
    // Auto-scroll log container
    function scrollLog() {
      const el = document.querySelector('.log-container');
      if (el) el.scrollTop = el.scrollHeight;
    }
    // SSE append handler
    document.body.addEventListener('htmx:sseMessage', scrollLog);
  </script>
</body>
</html>`;
}
