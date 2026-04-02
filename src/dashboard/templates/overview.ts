interface OverviewData {
  repos: any[];
  totalContributions: number;
  successfulPRs: number;
  recentContributions: any[];
  activeInstances: any[];
  todayPRMap: Map<number, number>;
  repoStatusMap: Map<string, any>;
  activeCount: number;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    pr_created: "badge-success", merged: "badge-success", completed: "badge-success",
    failed: "badge-danger", interrupted: "badge-danger",
    coding: "badge-info", scanning: "badge-info", pushing: "badge-info",
    in_progress: "badge-info", running: "badge-info", contributing: "badge-info",
    "pr-description": "badge-info", "issue-creating": "badge-info",
    pending: "badge-warning", planning: "badge-warning",
    idle: "badge-neutral", enabled: "badge-success", disabled: "badge-danger",
  };
  return `<span class="badge ${map[status] ?? "badge-neutral"}">${status}</span>`;
}

export function overviewTemplate(data: OverviewData): string {
  const repoRows = data.repos
    .map((r) => {
      const todayCount = data.todayPRMap.get(r.id) ?? 0;
      const status = data.repoStatusMap.get(r.fullName);
      const phase = status?.phase ?? "idle";
      const focusTags = JSON.parse(r.focus).map((f: string) => `<span class="badge badge-neutral">${f}</span>`).join(" ");
      const phaseHtml = phase !== "idle"
        ? `<span class="badge badge-info" style="font-family:monospace;font-size:11px">${phase}</span>`
        : (r.enabled ? statusBadge("idle") : statusBadge("disabled"));

      return `
    <tr>
      <td><a href="/repo/${r.fullName}" style="font-weight:500">${r.fullName}</a></td>
      <td>${focusTags || '<span style="color:var(--text-tertiary)">all</span>'}</td>
      <td>${phaseHtml}</td>
      <td style="color:var(--text-secondary);font-size:12px">${r.lastScannedAt ? new Date(r.lastScannedAt).toLocaleString() : "Never"}</td>
      <td>
        <span style="font-weight:600;color:${todayCount >= r.maxPrsPerDay ? "var(--warning)" : "var(--accent)"}">${todayCount}</span>
        <span style="color:var(--text-tertiary)"> / ${r.maxPrsPerDay}</span>
      </td>
      <td><a href="/repo/${r.fullName}" class="btn btn-sm">Details →</a></td>
    </tr>`;
    })
    .join("");

  const statusRowsHtml = data.repos
    .map((r) => {
      const s = data.repoStatusMap.get(r.fullName);
      if (!s || s.phase === "idle") return "";
      const elapsed = Math.round((Date.now() - new Date(s.updatedAt).getTime()) / 1000);
      const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
      return `<div class="instance-row">
        <span class="pulse"></span>
        <span class="instance-repo">${r.fullName}</span>
        <span class="instance-phase">${s.phase}</span>
        <span class="instance-prompt">${escapeHtml(s.currentTask ?? "")}</span>
        <span class="instance-elapsed">${elapsedStr} ago</span>
      </div>`;
    })
    .filter(Boolean).join("");

  const contribRows = data.recentContributions.map((c) => {
    const statusMap: Record<string, string> = {
      pr_created: "badge-success", merged: "badge-success", completed: "badge-success",
      failed: "badge-danger", interrupted: "badge-danger",
      coding: "badge-info", scanning: "badge-info", pushing: "badge-info", in_progress: "badge-info",
      pending: "badge-warning", planning: "badge-warning",
    };
    const badge = `<span class="badge ${statusMap[c.status] ?? "badge-neutral"}">${c.status}</span>`;
    const cost = c.claudeCostUsd != null ? `<span style="color:var(--text-tertiary);font-size:11px">$${Number(c.claudeCostUsd).toFixed(4)}</span>` : "";
    const duration = c.startedAt && c.completedAt
      ? `<span style="color:var(--text-tertiary);font-size:11px">${Math.round((new Date(c.completedAt).getTime() - new Date(c.startedAt).getTime()) / 1000)}s</span>`
      : "";
    return `
    <tr>
      <td><a href="/repo/${c.repoName}">${c.repoName}</a></td>
      <td><span class="badge badge-neutral">${c.type}</span></td>
      <td>${badge}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.title ?? "-")}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank" class="btn btn-sm">View PR</a>` : "-"}</td>
      <td>${cost} ${duration}</td>
    </tr>`;
  }).join("");

  return `
    <div class="topbar">
      <h1>Overview</h1>
      <div class="topbar-actions">
        <a href="/logs" class="btn btn-sm">Live Logs</a>
        <button class="theme-toggle" id="theme-btn" onclick="toggleTheme()" title="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
        <span style="color:var(--text-tertiary);font-size:13px" hx-get="/partials/clock" hx-trigger="every 30s" hx-swap="innerHTML">${new Date().toLocaleTimeString()}</span>
      </div>
    </div>

    <div class="content">
      <!-- Stats -->
      <div class="stats-grid section" hx-get="/partials/stats" hx-trigger="every 5s" hx-swap="innerHTML">
        <div class="stat-card">
          <div class="stat-label">Active Repos</div>
          <div class="stat-value" style="color:${data.activeCount > 0 ? "var(--accent)" : "inherit"}">${data.activeCount}</div>
          <div class="stat-sub">Currently working</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Contributions</div>
          <div class="stat-value">${data.totalContributions}</div>
          <div class="stat-sub">All time</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Successful PRs</div>
          <div class="stat-value">${data.successfulPRs}</div>
          <div class="stat-sub">Created or merged</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Claude Instances</div>
          <div class="stat-value" style="color:${data.activeInstances.length > 0 ? "var(--accent)" : "inherit"}">${data.activeInstances.length}</div>
          <div class="stat-sub">Running now</div>
        </div>
      </div>

      <!-- Active repo work (from DB, cross-process) -->
      <div class="card section">
        <div class="card-header">
          <h2>Active Work</h2>
          <span style="color:var(--text-tertiary);font-size:12px">${data.activeCount > 0 ? data.activeCount + " repo(s) busy" : "Idle"}</span>
        </div>
        <div id="active-instances-body" hx-get="/partials/repo-status" hx-trigger="every 3s" hx-swap="innerHTML">
          ${statusRowsHtml || `<div class="empty-state" style="padding:16px"><p>Orchestrator idle — no active work</p></div>`}
        </div>
      </div>

      <!-- Repositories -->
      <div class="card section">
        <div class="card-header">
          <h2>Repositories</h2>
          <span style="color:var(--text-tertiary);font-size:13px">${data.repos.length} repos</span>
        </div>
        <div class="card-body no-pad">
          ${data.repos.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Repository</th><th>Focus</th><th>Phase</th><th>Last Scan</th><th>PRs Today</th><th></th></tr></thead>
              <tbody>${repoRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No repos configured. Add [[repos]] to contribot.toml.</p></div>`}
        </div>
      </div>

      <!-- Recent Contributions -->
      <div class="card section">
        <div class="card-header">
          <h2>Recent Contributions</h2>
          <a href="/history" class="btn btn-sm">View all</a>
        </div>
        <div class="card-body no-pad">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Repo</th><th>Type</th><th>Status</th><th>Title</th><th>PR</th><th>Cost / Duration</th></tr></thead>
              <tbody id="recent-contribs" hx-get="/partials/recent-contribs" hx-trigger="every 8s" hx-swap="innerHTML">
                ${contribRows || `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:24px">No contributions yet</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <style>
      .instance-row {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 13px;
      }
      .instance-row:last-child { border-bottom: none; }
      .instance-phase {
        font-family: 'Microsoft YaHei Mono', 'Consolas', monospace; font-size: 11px;
        padding: 2px 7px; background: var(--accent-glow, rgba(16,163,127,0.15)); color: var(--accent);
        border-radius: 4px; flex-shrink: 0;
      }
      .instance-repo { font-weight: 600; flex-shrink: 0; min-width: 120px; }
      .instance-elapsed { color: var(--text-tertiary); font-size: 12px; margin-left: auto; flex-shrink: 0; }
      .instance-prompt { color: var(--text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
      .pulse { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s ease-in-out infinite; flex-shrink: 0; }
      @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
    </style>
    <script>
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { statusBadge };
