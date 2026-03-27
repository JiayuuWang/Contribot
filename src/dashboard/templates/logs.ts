import type { LogEntry } from "../../utils/activity-log.js";

export function logsTemplate(recentLogs: LogEntry[]): string {
  return `
    <div class="topbar">
      <h1>Live Logs</h1>
      <div class="topbar-actions">
        <span class="badge badge-info" id="sse-status">Connecting...</span>
      </div>
    </div>

    <div class="content">
      <div class="card">
        <div class="card-header">
          <h2>Claude Code Activity</h2>
          <span style="color:var(--text-tertiary);font-size:12px">Real-time output from Claude Code subprocesses</span>
        </div>
        <div class="card-body">
          <div class="log-container" id="log-view"
               hx-ext="sse"
               sse-connect="/api/logs/stream"
               sse-swap="log"
               hx-swap="beforeend">
            ${recentLogs.map((e) => formatLogEntry(e)).join("")}
          </div>
        </div>
      </div>
    </div>

    <script>
      // SSE connection status
      const logView = document.getElementById('log-view');
      const sseStatus = document.getElementById('sse-status');

      document.body.addEventListener('htmx:sseOpen', () => {
        sseStatus.textContent = 'Connected';
        sseStatus.className = 'badge badge-success';
      });

      document.body.addEventListener('htmx:sseError', () => {
        sseStatus.textContent = 'Disconnected';
        sseStatus.className = 'badge badge-danger';
      });

      // Scroll to bottom on load
      if (logView) logView.scrollTop = logView.scrollHeight;

      // Keep only last 200 entries in DOM
      const observer = new MutationObserver(() => {
        if (logView && logView.children.length > 200) {
          while (logView.children.length > 200) {
            logView.removeChild(logView.firstChild);
          }
        }
      });
      if (logView) observer.observe(logView, { childList: true });
    </script>
  `;
}

export function formatLogEntry(e: LogEntry): string {
  const time = e.timestamp.split("T")[1]?.slice(0, 8) ?? "";
  const repo = e.repo ? `<span class="log-repo">[${e.repo}]</span> ` : "";
  return `<div class="log-entry level-${e.level}"><span class="log-time">${time}</span><span class="log-source">${e.source}</span>${repo}<span class="log-msg">${escapeHtml(e.message)}</span></div>\n`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
