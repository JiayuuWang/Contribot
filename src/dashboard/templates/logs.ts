import type { LogEntry } from "../../utils/activity-log.js";

export function logsTemplate(recentLogs: LogEntry[], initialLastId = 0): string {
  // Filter: only show system-level entries (not claude:live) in the main stream
  const systemLogs = recentLogs.filter((e) => e.source !== "claude:live");
  const initialHtml = systemLogs.map((e) => formatLogEntry(e)).join("");

  return `
    <div class="topbar">
      <h1>Live Logs</h1>
      <div class="topbar-actions">
        <button class="theme-toggle" id="theme-btn" onclick="toggleTheme()" title="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
        <span class="badge badge-info" id="sse-status">Connecting…</span>
      </div>
    </div>

    <div class="content" style="padding-bottom:0;display:flex;flex-direction:column;height:calc(100vh - 65px)">
      <!-- Instance terminals (persistent, scrollable) -->
      <div class="card section" id="claude-instances-card" style="flex-shrink:0">
        <div class="card-header">
          <h2>Claude Code Instances</h2>
          <span style="color:var(--text-tertiary);font-size:12px" id="instance-count">Loading…</span>
        </div>
        <div id="claude-instances-body">
          <div class="empty-state" style="padding:24px"><p>No active or recent Claude instances</p></div>
        </div>
      </div>

      <!-- System log (key info only, no claude:live output) -->
      <div class="card" style="display:flex;flex-direction:column;flex:1;min-height:200px">
        <div class="card-header" style="flex-shrink:0">
          <h2>System Log</h2>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="color:var(--text-tertiary);font-size:12px" id="log-count">0 entries</span>
            <button class="btn btn-sm btn-ghost" id="clear-btn">Clear</button>
          </div>
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
      /* Instance terminal panes */
      .split-panes {
        display: grid; gap: 0;
        border-top: 1px solid var(--border);
      }
      .split-panes.cols-1 { grid-template-columns: 1fr; }
      .split-panes.cols-2 { grid-template-columns: 1fr 1fr; }
      .split-panes.cols-3 { grid-template-columns: 1fr 1fr 1fr; }

      .instance-pane {
        display: flex; flex-direction: column;
        border-right: 1px solid var(--border);
        min-height: 0;
      }
      .instance-pane:last-child { border-right: none; }

      .pane-header {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 14px;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border);
        font-size: 12px; font-weight: 600; flex-shrink: 0;
      }
      .pane-header .pulse { width: 6px; height: 6px; }
      .pane-phase {
        font-family: 'Microsoft YaHei Mono', 'Consolas', monospace;
        font-size: 10px; padding: 1px 6px;
        background: var(--accent-glow); color: var(--accent);
        border-radius: 4px;
      }
      .pane-status-done {
        font-family: 'Microsoft YaHei Mono', 'Consolas', monospace;
        font-size: 10px; padding: 1px 6px;
        background: rgba(239,68,68,0.1); color: var(--text-tertiary);
        border-radius: 4px;
      }
      .pane-elapsed { color: var(--text-tertiary); margin-left: auto; font-weight: 400; font-size: 11px; }

      .pane-output {
        background: var(--terminal-bg);
        color: var(--terminal-text);
        font-family: 'Microsoft YaHei Mono', 'Cascadia Mono', 'Consolas', monospace;
        font-size: 12px;
        line-height: 1.6;
        padding: 10px 14px;
        overflow-y: auto;
        height: 320px;
        scroll-behavior: smooth;
      }
      .pane-output .out-line { color: var(--terminal-text); white-space: pre-wrap; word-break: break-all; padding: 1px 0; }
      .pane-output .err-line { color: var(--terminal-error); white-space: pre-wrap; word-break: break-all; padding: 1px 0; }
      .pane-output .tool-line { color: var(--terminal-accent); }
      .pane-output .result-line { color: var(--terminal-info); }

      .pulse { display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 1.5s ease-in-out infinite;flex-shrink:0; }
      .dot-idle { display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--text-tertiary);flex-shrink:0; }
    </style>

    <script>
      // === SSE wiring ===
      const sseStatus = document.getElementById('sse-status');
      const logInner  = document.getElementById('log-inner');
      const logView   = document.getElementById('log-view');
      const logCount  = document.getElementById('log-count');

      let totalEntries = ${systemLogs.length};

      document.body.addEventListener('htmx:sseOpen', () => {
        sseStatus.textContent = 'Connected';
        sseStatus.className   = 'badge badge-success';
      });
      document.body.addEventListener('htmx:sseError', () => {
        sseStatus.textContent = 'Disconnected';
        sseStatus.className   = 'badge badge-danger';
      });

      // SSE → system log (filter out claude:live entries)
      const bufferObserver = new MutationObserver(() => {
        const buf = document.getElementById('sse-buffer');
        if (!buf || !buf.children.length) return;
        const frags = Array.from(buf.children);
        buf.innerHTML = '';
        frags.forEach(el => {
          // Only show system-level entries in the bottom log
          const src = el.querySelector('.log-source');
          if (src && src.textContent.trim() === 'claude:live') {
            return; // skip — this goes to instance panes only
          }
          logInner.appendChild(el);
        });
        while (logInner.children.length > 500) logInner.removeChild(logInner.firstChild);
        totalEntries = logInner.children.length;
        logCount.textContent = totalEntries + ' entries';
        logView.scrollTop = logView.scrollHeight;
      });
      bufferObserver.observe(document.getElementById('sse-buffer'), { childList: true });

      // === Clear ===
      document.getElementById('clear-btn').addEventListener('click', () => {
        logInner.innerHTML = '';
        totalEntries = 0;
        logCount.textContent = '0 entries';
      });

      // === Instance terminals (persistent) ===
      // We keep output in memory even after instances complete
      const instanceData = new Map(); // id → { repo, phase, startedAt, endedAt, lines[], lastOutputId, autoScroll }

      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      function formatElapsed(ms) {
        const s = Math.round(ms / 1000);
        if (s >= 3600) return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
        if (s >= 60) return Math.floor(s/60) + 'm ' + (s%60) + 's';
        return s + 's';
      }

      async function refreshInstances() {
        try {
          const res  = await fetch('/api/claude/instances');
          const data = await res.json();
          const count = document.getElementById('instance-count');

          const active  = data.active ?? [];
          const history = data.history ?? [];

          // Track active instances
          for (const inst of active) {
            if (!instanceData.has(inst.id)) {
              instanceData.set(inst.id, {
                id: inst.id, repo: inst.repo, phase: inst.phase,
                startedAt: inst.startedAt, endedAt: null,
                lines: [], lastOutputId: 0, autoScroll: true,
              });
            }
          }

          // Track recently completed instances (keep their output visible)
          for (const inst of history.slice(0, 6)) {
            if (!instanceData.has(inst.id)) {
              instanceData.set(inst.id, {
                id: inst.id, repo: inst.repo, phase: inst.phase,
                startedAt: inst.startedAt, endedAt: inst.endedAt,
                success: inst.success, lines: [], lastOutputId: 0, autoScroll: false,
              });
            } else {
              const d = instanceData.get(inst.id);
              if (inst.endedAt && !d.endedAt) {
                d.endedAt = inst.endedAt;
                d.success = inst.success;
              }
            }
          }

          // Mark active instances
          const activeIds = new Set(active.map(i => i.id));
          count.textContent = activeIds.size > 0
            ? activeIds.size + ' running'
            : instanceData.size > 0 ? 'Idle' : 'No instances';

          // Render panes
          renderPanes(activeIds);

          // Poll output for active instances
          for (const inst of active) {
            pollInstanceOutput(inst.id);
          }
        } catch(e) { /* ignore */ }
      }

      function renderPanes(activeIds) {
        const body = document.getElementById('claude-instances-body');
        if (instanceData.size === 0) {
          body.innerHTML = '<div class="empty-state" style="padding:24px"><p>No active or recent Claude instances</p></div>';
          return;
        }

        // Sort: active first, then recent
        const sorted = [...instanceData.values()].sort((a, b) => {
          const aActive = activeIds.has(a.id) ? 0 : 1;
          const bActive = activeIds.has(b.id) ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        });

        // Only show up to 4 panes
        const visible = sorted.slice(0, 4);
        const cols = visible.length <= 1 ? 'cols-1' : visible.length === 2 ? 'cols-2' : 'cols-3';

        // Check if we need to rebuild (new instances added)
        const currentIds = Array.from(body.querySelectorAll('.instance-pane')).map(el => el.dataset.instanceId);
        const newIds = visible.map(d => d.id);
        const needsRebuild = currentIds.length !== newIds.length || currentIds.some((id, i) => id !== newIds[i]);

        if (needsRebuild) {
          let html = '<div class="split-panes ' + cols + '">';
          for (const d of visible) {
            const isActive = activeIds.has(d.id);
            const elapsed = formatElapsed(Date.now() - new Date(d.startedAt).getTime());
            const dotHtml = isActive ? '<span class="pulse"></span>' : '<span class="dot-idle"></span>';
            const phaseHtml = isActive
              ? '<span class="pane-phase">' + escHtml(d.phase) + '</span>'
              : '<span class="pane-status-done">' + (d.success ? 'done' : 'failed') + '</span>';

            html += '<div class="instance-pane" data-instance-id="' + d.id + '">' +
              '<div class="pane-header">' +
                dotHtml +
                '<span style="font-weight:600">' + escHtml(d.repo) + '</span>' +
                phaseHtml +
                '<span class="pane-elapsed">' + elapsed + '</span>' +
              '</div>' +
              '<div class="pane-output" id="pane-' + d.id + '"></div>' +
            '</div>';
          }
          html += '</div>';
          body.innerHTML = html;

          // Restore cached lines into new panes
          for (const d of visible) {
            const pane = document.getElementById('pane-' + d.id);
            if (pane && d.lines.length > 0) {
              const frag = document.createDocumentFragment();
              for (const ln of d.lines) {
                const div = document.createElement('div');
                div.className = ln.cls;
                div.textContent = ln.text;
                frag.appendChild(div);
              }
              pane.appendChild(frag);
              if (d.autoScroll) pane.scrollTop = pane.scrollHeight;
            }
          }

          // Setup scroll listeners for auto-scroll detection
          for (const d of visible) {
            const pane = document.getElementById('pane-' + d.id);
            if (pane) {
              pane.addEventListener('scroll', () => {
                const atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
                d.autoScroll = atBottom;
              });
            }
          }
        } else {
          // Just update headers (elapsed time, status)
          for (const d of visible) {
            const paneEl = body.querySelector('[data-instance-id="' + d.id + '"]');
            if (!paneEl) continue;
            const elapsedEl = paneEl.querySelector('.pane-elapsed');
            if (elapsedEl) elapsedEl.textContent = formatElapsed(Date.now() - new Date(d.startedAt).getTime());
          }
        }
      }

      async function pollInstanceOutput(instanceId) {
        const d = instanceData.get(instanceId);
        if (!d) return;

        try {
          const res = await fetch('/api/claude/output/' + instanceId + '?after=' + d.lastOutputId);
          const rows = await res.json();
          if (!rows.length) return;

          const pane = document.getElementById('pane-' + instanceId);

          for (const row of rows) {
            const cls = row.stream === 'stderr' ? 'err-line'
              : row.line.startsWith('[tool]') ? 'out-line tool-line'
              : row.line.startsWith('[result') ? 'out-line result-line'
              : 'out-line';

            // Cache line
            d.lines.push({ cls, text: row.line });
            if (row.id > d.lastOutputId) d.lastOutputId = row.id;

            // Append to pane if it exists
            if (pane) {
              const div = document.createElement('div');
              div.className = cls;
              div.textContent = row.line;
              pane.appendChild(div);
            }
          }

          // Trim cache to 2000 lines
          while (d.lines.length > 2000) d.lines.shift();

          // Trim DOM to 2000 lines
          if (pane) {
            while (pane.children.length > 2000) pane.removeChild(pane.firstChild);
            if (d.autoScroll) pane.scrollTop = pane.scrollHeight;
          }
        } catch(e) { /* ignore */ }
      }

      refreshInstances();
      setInterval(refreshInstances, 2000);

      // Also poll completed instances once to load their output
      setTimeout(async () => {
        for (const [id, d] of instanceData) {
          if (d.endedAt && d.lines.length === 0) {
            await pollInstanceOutput(id);
          }
        }
      }, 1500);

      logView.scrollTop = logView.scrollHeight;
      logCount.textContent = totalEntries + ' entries';

      // Theme icon sync
      (function() {
        const btn = document.getElementById('theme-btn');
        if (btn) {
          const t = document.documentElement.getAttribute('data-theme');
          btn.innerHTML = t === 'dark'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
        }
      })();
    </script>
  `;
}

export function formatLogEntry(e: LogEntry): string {
  const time = e.timestamp.split("T")[1]?.slice(0, 8) ?? "";
  const repo = e.repo ? `<span class="log-repo" data-repo="${escapeAttr(e.repo)}">[${escapeHtml(e.repo)}]</span> ` : "";
  return `<div class="log-entry level-${e.level}" data-level="${e.level}" data-repo="${escapeAttr(e.repo ?? "")}" data-source="${escapeAttr(e.source)}">`
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
