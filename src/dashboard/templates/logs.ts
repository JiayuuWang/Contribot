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
        <button class="btn btn-sm" id="scroll-lock-btn" title="Toggle auto-scroll">Auto-scroll</button>
        <button class="btn btn-sm" id="clear-btn">Clear</button>
        <span class="badge badge-info" id="sse-status">Connecting…</span>
      </div>
    </div>

    <div class="content" style="padding-bottom:0">
      <!-- Active Claude Instances with split-screen output -->
      <div class="card section" id="claude-instances-card">
        <div class="card-header">
          <h2>Active Claude Instances</h2>
          <span style="color:var(--text-tertiary);font-size:12px" id="instance-count">Loading…</span>
        </div>
        <div id="claude-instances-body">
          <div class="empty-state" style="padding:16px"><p>No active Claude instances</p></div>
        </div>
      </div>

      <!-- Activity Stream -->
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

      /* Instance rows */
      .instance-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
        cursor: pointer;
        transition: background 0.1s;
      }
      .instance-row:hover { background: var(--bg-secondary); }
      .instance-row:last-child { border-bottom: none; }
      .instance-row.expanded { background: var(--bg-secondary); }
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

      /* Split-screen panes */
      .split-panes {
        display: grid;
        gap: 0;
        border-top: 1px solid var(--border);
      }
      .split-panes.cols-1 { grid-template-columns: 1fr; }
      .split-panes.cols-2 { grid-template-columns: 1fr 1fr; }
      .split-panes.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
      .split-panes.cols-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }

      .instance-pane {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--border);
        min-height: 0;
      }
      .instance-pane:last-child { border-right: none; }
      .split-panes.cols-4 .instance-pane { border-bottom: 1px solid var(--border); }

      .pane-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border);
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
      }
      .pane-header .pulse { width: 6px; height: 6px; }
      .pane-phase {
        font-family: 'SF Mono', monospace;
        font-size: 10px;
        padding: 1px 5px;
        background: #1a1a2e;
        color: var(--accent);
        border-radius: 3px;
      }
      .pane-elapsed { color: var(--text-tertiary); margin-left: auto; font-weight: 400; }

      .pane-output {
        background: #1a1a2e;
        color: #e0e0e0;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        line-height: 1.6;
        padding: 8px 12px;
        overflow-y: auto;
        flex: 1;
        min-height: 200px;
        max-height: 400px;
      }
      .pane-output .out-line { color: #e0e0e0; }
      .pane-output .err-line { color: #f87171; }
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
        scrollBtn.textContent = autoScroll ? 'Auto-scroll' : 'Paused';
        scrollBtn.classList.toggle('locked', autoScroll);
        if (autoScroll) logView.scrollTop = logView.scrollHeight;
      });
      logView.addEventListener('scroll', () => {
        const atBottom = logView.scrollHeight - logView.scrollTop - logView.clientHeight < 40;
        if (atBottom && !autoScroll) {
          autoScroll = true;
          scrollBtn.textContent = 'Auto-scroll';
          scrollBtn.classList.add('locked');
        } else if (!atBottom && autoScroll) {
          autoScroll = false;
          scrollBtn.textContent = 'Paused';
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

      // === Claude instances polling + split-screen output ===
      const outputPollers = new Map(); // instanceId → { timer, lastOutputId }

      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

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
            body.innerHTML = '<div class="empty-state" style="padding:16px"><p>No active Claude instances</p></div>';
            // Stop all output pollers
            for (const [id, poller] of outputPollers) {
              clearInterval(poller.timer);
            }
            outputPollers.clear();
            return;
          }

          // Build instance rows
          const colsClass = active.length <= 1 ? 'cols-1' : active.length === 2 ? 'cols-2' : active.length === 3 ? 'cols-3' : 'cols-4';

          let html = '';
          // Instance header rows
          active.forEach(inst => {
            const elapsed = Math.round((Date.now() - new Date(inst.startedAt).getTime()) / 1000);
            const elapsedStr = elapsed >= 60 ? Math.floor(elapsed/60) + 'm ' + (elapsed%60) + 's' : elapsed + 's';
            html += '<div class="instance-row">' +
              '<span class="pulse"></span>' +
              '<span class="instance-repo">' + escHtml(inst.repo) + '</span>' +
              '<span class="instance-phase">' + escHtml(inst.phase) + '</span>' +
              '<span class="instance-prompt">' + escHtml(inst.prompt || '') + '</span>' +
              '<span class="instance-elapsed">' + elapsedStr + '</span>' +
            '</div>';
          });

          // Split-screen output panes
          html += '<div class="split-panes ' + colsClass + '">';
          active.forEach(inst => {
            const elapsed = Math.round((Date.now() - new Date(inst.startedAt).getTime()) / 1000);
            const elapsedStr = elapsed >= 60 ? Math.floor(elapsed/60) + 'm ' + (elapsed%60) + 's' : elapsed + 's';
            html += '<div class="instance-pane">' +
              '<div class="pane-header">' +
                '<span class="pulse"></span>' +
                '<span>' + escHtml(inst.repo) + '</span>' +
                '<span class="pane-phase">' + escHtml(inst.phase) + '</span>' +
                '<span class="pane-elapsed">' + elapsedStr + '</span>' +
              '</div>' +
              '<div class="pane-output" id="pane-' + inst.id + '"></div>' +
            '</div>';
          });
          html += '</div>';

          body.innerHTML = html;

          // Setup output pollers for each active instance
          const activeIds = new Set(active.map(i => i.id));

          // Stop pollers for instances that are no longer active
          for (const [id, poller] of outputPollers) {
            if (!activeIds.has(id)) {
              clearInterval(poller.timer);
              outputPollers.delete(id);
            }
          }

          // Start pollers for new instances
          for (const inst of active) {
            if (!outputPollers.has(inst.id)) {
              const poller = { timer: null, lastOutputId: 0 };
              poller.timer = setInterval(() => pollInstanceOutput(inst.id, poller), 1000);
              outputPollers.set(inst.id, poller);
              // Fetch initial output immediately
              pollInstanceOutput(inst.id, poller);
            }
          }
        } catch(e) { /* ignore */ }
      }

      async function pollInstanceOutput(instanceId, poller) {
        try {
          const res = await fetch('/api/claude/output/' + instanceId + '?after=' + poller.lastOutputId);
          const rows = await res.json();
          if (!rows.length) return;

          const pane = document.getElementById('pane-' + instanceId);
          if (!pane) return;

          for (const row of rows) {
            const div = document.createElement('div');
            div.className = row.stream === 'stderr' ? 'err-line' : 'out-line';
            div.textContent = row.line;
            pane.appendChild(div);
            if (row.id > poller.lastOutputId) poller.lastOutputId = row.id;
          }

          // Trim to 500 lines
          while (pane.children.length > 500) pane.removeChild(pane.firstChild);

          // Auto-scroll pane
          pane.scrollTop = pane.scrollHeight;
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
