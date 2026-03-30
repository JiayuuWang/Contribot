import type { LogEntry } from "../../utils/activity-log.js";

export function logsTemplate(recentLogs: LogEntry[], initialLastId = 0): string {
  const initialHtml = recentLogs.map((e) => formatLogEntry(e)).join("");

  return `
    <div class="topbar">
      <h1>Live Logs</h1>
      <div class="topbar-actions">
        <label class="filter-label">
          <select id="log-level-filter" class="filter-select">
            <option value="">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </label>
        <label class="filter-label">
          <input id="log-repo-filter" class="filter-input" type="text" placeholder="Filter by repo…" />
        </label>
        <label class="filter-label">
          <input id="log-text-filter" class="filter-input" type="text" placeholder="Search text…" />
        </label>
        <button class="btn btn-sm" id="scroll-lock-btn" title="Toggle auto-scroll">⬇ Auto-scroll</button>
        <button class="btn btn-sm" id="clear-btn">Clear</button>
        <span class="badge badge-info" id="sse-status">Connecting…</span>
      </div>
    </div>

    <div class="content" style="padding-bottom:0">
      <!-- Claude instances panel -->
      <div class="card section" id="claude-instances-card">
        <div class="card-header">
          <h2>Active Claude Instances</h2>
          <span style="color:var(--text-tertiary);font-size:12px" id="instance-count">Loading…</span>
        </div>
        <div class="card-body no-pad" id="claude-instances-body">
          <div class="empty-state"><p>No active Claude instances</p></div>
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column;height:calc(100vh - 330px);min-height:400px">
        <div class="card-header" style="flex-shrink:0">
          <h2>Activity Stream</h2>
          <span style="color:var(--text-tertiary);font-size:12px" id="log-count">0 entries</span>
        </div>
        <div class="log-container" id="log-view" style="flex:1;max-height:none;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
          <div id="log-inner">${initialHtml}</div>
        </div>
      </div>
    </div>

    <!-- Hidden SSE receiver -->
    <div id="sse-receiver"
         hx-ext="sse"
         sse-connect="/api/logs/stream"
         sse-swap="log"
         hx-target="#sse-buffer"
         hx-swap="innerHTML"
         style="display:none">
    </div>
    <div id="sse-buffer" style="display:none"></div>

    <style>
      .filter-label { display:flex;align-items:center;gap:4px; }
      .filter-select, .filter-input {
        padding: 5px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font-size: 12px;
        background: var(--bg-primary);
        color: var(--text-primary);
        outline: none;
      }
      .filter-input { width: 130px; }
      .filter-select:focus, .filter-input:focus { border-color: var(--accent); }
      #scroll-lock-btn.locked { background: var(--accent); color: #fff; border-color: var(--accent); }

      .instance-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
      }
      .instance-row:last-child { border-bottom: none; }
      .instance-phase {
        font-family: 'SF Mono', monospace;
        font-size: 11px;
        padding: 2px 7px;
        background: #1a1a2e;
        color: var(--accent);
        border-radius: 4px;
        flex-shrink: 0;
      }
      .instance-repo { font-weight: 600; flex-shrink: 0; }
      .instance-elapsed { color: var(--text-tertiary); font-size: 12px; margin-left:auto; flex-shrink:0; }
      .instance-prompt { color: var(--text-secondary); font-size: 12px; overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0; }
      .pulse { display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 1.5s ease-in-out infinite; }
      @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
    </style>

    <script>
      // === SSE wiring ===
      const sseStatus = document.getElementById('sse-status');
      const logInner  = document.getElementById('log-inner');
      const logView   = document.getElementById('log-view');
      const logCount  = document.getElementById('log-count');

      let totalEntries = ${recentLogs.length};
      let autoScroll   = true;
      let lastId       = ${initialLastId};

      document.body.addEventListener('htmx:sseOpen', () => {
        sseStatus.textContent = 'Connected';
        sseStatus.className   = 'badge badge-success';
      });
      document.body.addEventListener('htmx:sseError', () => {
        sseStatus.textContent = 'Disconnected';
        sseStatus.className   = 'badge badge-danger';
      });

      // SSE puts HTML into #sse-buffer — we move it into #log-inner
      const bufferObserver = new MutationObserver(() => {
        const buf = document.getElementById('sse-buffer');
        if (!buf || !buf.children.length) return;
        const frags = Array.from(buf.children);
        buf.innerHTML = '';
        frags.forEach(el => {
          applyFilters(el);
          logInner.appendChild(el);
        });
        // Trim to 500 entries
        while (logInner.children.length > 500) logInner.removeChild(logInner.firstChild);
        totalEntries += frags.length;
        logCount.textContent = totalEntries + ' entries';
        if (autoScroll) logView.scrollTop = logView.scrollHeight;
      });
      bufferObserver.observe(document.getElementById('sse-buffer'), { childList: true });

      // === Auto-scroll toggle ===
      const scrollBtn = document.getElementById('scroll-lock-btn');
      scrollBtn.addEventListener('click', () => {
        autoScroll = !autoScroll;
        scrollBtn.textContent = autoScroll ? '⬇ Auto-scroll' : '⏸ Paused';
        scrollBtn.classList.toggle('locked', autoScroll);
        if (autoScroll) logView.scrollTop = logView.scrollHeight;
      });
      // Re-enable auto-scroll when user manually scrolls to bottom
      logView.addEventListener('scroll', () => {
        const atBottom = logView.scrollHeight - logView.scrollTop - logView.clientHeight < 40;
        if (atBottom && !autoScroll) {
          autoScroll = true;
          scrollBtn.textContent = '⬇ Auto-scroll';
          scrollBtn.classList.add('locked');
        } else if (!atBottom && autoScroll) {
          autoScroll = false;
          scrollBtn.textContent = '⏸ Paused';
          scrollBtn.classList.remove('locked');
        }
      });

      // === Clear button ===
      document.getElementById('clear-btn').addEventListener('click', () => {
        logInner.innerHTML = '';
        totalEntries = 0;
        logCount.textContent = '0 entries';
      });

      // === Filtering ===
      const levelFilter = document.getElementById('log-level-filter');
      const repoFilter  = document.getElementById('log-repo-filter');
      const textFilter  = document.getElementById('log-text-filter');

      function applyFilters(el) {
        const lvl  = levelFilter.value;
        const repo = repoFilter.value.trim().toLowerCase();
        const txt  = textFilter.value.trim().toLowerCase();
        const elLvl  = el.dataset.level  ?? '';
        const elRepo = (el.dataset.repo  ?? '').toLowerCase();
        const elTxt  = el.textContent.toLowerCase();
        const show = (!lvl  || elLvl  === lvl) &&
                     (!repo || elRepo.includes(repo)) &&
                     (!txt  || elTxt.includes(txt));
        el.style.display = show ? '' : 'none';
      }

      function reapplyFilters() {
        Array.from(logInner.children).forEach(applyFilters);
      }

      levelFilter.addEventListener('change', reapplyFilters);
      repoFilter.addEventListener('input',  reapplyFilters);
      textFilter.addEventListener('input',  reapplyFilters);

      // === Claude instances polling ===
      async function refreshInstances() {
        try {
          const res  = await fetch('/api/claude/instances');
          const data = await res.json();
          const body  = document.getElementById('claude-instances-body');
          const count = document.getElementById('instance-count');

          const active = data.active ?? [];
          count.textContent = active.length > 0
            ? active.length + ' running'
            : 'None running';

          if (active.length === 0) {
            body.innerHTML = '<div class="empty-state"><p>No active Claude instances</p></div>';
          } else {
            body.innerHTML = active.map(inst => {
              const elapsed = Math.round((Date.now() - new Date(inst.startedAt).getTime()) / 1000);
              const elapsedStr = elapsed >= 60 ? Math.floor(elapsed/60) + 'm ' + (elapsed%60) + 's' : elapsed + 's';
              return \`<div class="instance-row">
                <span class="pulse"></span>
                <span class="instance-repo">\${inst.repo}</span>
                <span class="instance-phase">\${inst.phase}</span>
                <span class="instance-prompt">\${inst.prompt}</span>
                <span class="instance-elapsed">\${elapsedStr}</span>
              </div>\`;
            }).join('');
          }
        } catch(e) { /* ignore */ }
      }

      refreshInstances();
      setInterval(refreshInstances, 3000);

      // Scroll to bottom on load
      logView.scrollTop = logView.scrollHeight;
      logCount.textContent = totalEntries + ' entries';
    </script>
  `;
}

export function formatLogEntry(e: LogEntry): string {
  const time = e.timestamp.split("T")[1]?.slice(0, 8) ?? "";
  const repo = e.repo ? `<span class="log-repo" data-repo="${escapeAttr(e.repo)}">[${escapeHtml(e.repo)}]</span> ` : "";
  return `<div class="log-entry level-${e.level}" data-level="${e.level}" data-repo="${escapeAttr(e.repo ?? "")}">`
    + `<span class="log-time">${time}</span>`
    + `<span class="log-source">${escapeHtml(e.source)}</span>`
    + repo
    + `<span class="log-msg">${escapeHtml(e.message)}</span>`
    + `</div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;");
}
