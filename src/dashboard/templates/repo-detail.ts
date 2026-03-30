import { statusBadge } from "./overview.js";

interface RepoDetailData {
  repo: any;
  contributions: any[];
  scans: any[];
  claudeHistory: any[];  // DB rows — nullable fields
  currentStatus: any | null;
}

export function repoDetailTemplate(data: RepoDetailData): string {
  const { repo } = data;
  const focus: string[] = JSON.parse(repo.focus);
  const labels: string[] = JSON.parse(repo.issueLabels);
  const fullName: string = repo.fullName;

  // Stats
  const prsCreated = data.contributions.filter((c) => c.status === "pr_created" || c.status === "merged").length;
  const failed = data.contributions.filter((c) => c.status === "failed").length;
  const totalCost = data.claudeHistory.reduce((sum, i) => sum + (i.costUsd ?? 0), 0);
  const avgDuration = data.claudeHistory.length > 0
    ? Math.round(data.claudeHistory.reduce((s, i) => s + (i.durationMs ?? 0), 0) / data.claudeHistory.length / 1000)
    : 0;

  const contribRows = data.contributions
    .map((c) => {
      const dur = c.startedAt && c.completedAt
        ? `${Math.round((new Date(c.completedAt).getTime() - new Date(c.startedAt).getTime()) / 1000)}s`
        : "";
      const cost = c.claudeCostUsd != null ? `$${Number(c.claudeCostUsd).toFixed(4)}` : "";
      return `
    <tr>
      <td><span class="badge badge-neutral">${c.type}</span></td>
      <td>${statusBadge(c.status)}</td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(c.title ?? "")}">${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank">#${c.prNumber}</a>` : c.issueNumber ? `#${c.issueNumber}` : "-"}</td>
      <td style="color:var(--text-secondary);font-size:12px">${c.startedAt ? new Date(c.startedAt).toLocaleString() : "-"}</td>
      <td style="font-size:12px;color:var(--text-tertiary)">${dur}</td>
      <td style="font-size:12px;color:var(--accent)">${cost}</td>
      <td style="color:var(--danger);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(c.errorMessage ?? "")}">${c.errorMessage ?? ""}</td>
    </tr>`;
    })
    .join("");

  const scanRows = data.scans
    .map((s) => {
      const durMs = s.startedAt && s.completedAt
        ? Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
        : null;
      return `
    <tr>
      <td>${statusBadge(s.status === "completed" ? "completed" : s.status === "running" ? "in_progress" : "failed")}</td>
      <td>${s.issuesFound ?? 0}</td>
      <td>${s.opportunitiesFound ?? 0}</td>
      <td style="color:var(--text-secondary)">${new Date(s.startedAt).toLocaleString()}</td>
      <td style="color:var(--text-secondary)">${s.completedAt ? new Date(s.completedAt).toLocaleString() : "-"}</td>
      <td style="color:var(--text-tertiary);font-size:12px">${durMs != null ? durMs + "s" : ""}</td>
    </tr>`;
    })
    .join("");

  const claudeRows = data.claudeHistory
    .map((inst) => {
      const dur = inst.durationMs != null ? (inst.durationMs / 1000).toFixed(1) + "s" : "";
      const cost = inst.costUsd != null ? `$${inst.costUsd.toFixed(4)}` : "";
      const success = inst.success === true ? "badge-success" : inst.success === false ? "badge-danger" : "badge-neutral";
      const successLabel = inst.success === true ? "ok" : inst.success === false ? "fail" : "?";
      return `
    <tr>
      <td style="font-family:monospace;font-size:11px;color:var(--accent)">${inst.phase}</td>
      <td><span class="badge ${success}">${successLabel}</span></td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-secondary)" title="${escapeAttr(inst.prompt)}">${escapeHtml(inst.prompt)}</td>
      <td style="color:var(--text-secondary);font-size:12px">${new Date(inst.startedAt).toLocaleString()}</td>
      <td style="font-size:12px;color:var(--text-tertiary)">${dur}</td>
      <td style="font-size:12px;color:var(--accent)">${cost}</td>
      <td style="color:var(--danger);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(inst.error ?? "")}">${escapeHtml(inst.error ?? "")}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="topbar">
      <h1>
        <a href="/" style="color:var(--text-tertiary);text-decoration:none;font-weight:400">&larr;</a>
        &nbsp; ${fullName}
      </h1>
      <div class="topbar-actions">
        <a href="/logs" class="btn btn-sm">Live Logs</a>
        <a href="https://github.com/${fullName}" target="_blank" class="btn btn-sm">GitHub &nearr;</a>
        ${data.currentStatus && data.currentStatus.phase !== "idle"
          ? `<span class="badge badge-info" style="font-family:monospace">${data.currentStatus.phase}</span>`
          : repo.enabled
            ? `<span class="badge badge-success">Enabled</span>`
            : `<span class="badge badge-danger">Disabled</span>`}
      </div>
    </div>

    <div class="content">
      <!-- Stats row -->
      <div class="stats-grid section">
        <div class="stat-card">
          <div class="stat-label">Total Contributions</div>
          <div class="stat-value">${data.contributions.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">PRs Created</div>
          <div class="stat-value">${prsCreated}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Scans</div>
          <div class="stat-value">${data.scans.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Failed</div>
          <div class="stat-value" style="color:${failed > 0 ? "var(--danger)" : "inherit"}">${failed}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Claude Calls</div>
          <div class="stat-value">${data.claudeHistory.length}</div>
          <div class="stat-sub">Avg ${avgDuration}s</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Claude Cost (session)</div>
          <div class="stat-value" style="font-size:20px">$${totalCost.toFixed(4)}</div>
          <div class="stat-sub">This session only</div>
        </div>
      </div>

      <!-- Config -->
      <div class="card section">
        <div class="card-header">
          <h2>Configuration</h2>
        </div>
        <div class="card-body no-pad">
          <dl class="detail-grid">
            <dt>Focus Areas</dt>
            <dd>${focus.length > 0 ? focus.map((f) => `<span class="badge badge-neutral">${f}</span>`).join(" ") : '<span style="color:var(--text-tertiary)">All (unrestricted)</span>'}</dd>
            <dt>Issue Labels</dt>
            <dd>${labels.length > 0 ? labels.map((l) => `<span class="badge badge-info">${l}</span>`).join(" ") : '<span style="color:var(--text-tertiary)">All (no filter)</span>'}</dd>
            <dt>Reasons</dt>
            <dd>${repo.reasons || `<span style='color:var(--text-tertiary)'>Not specified</span>`}</dd>
            <dt>Max PRs/Day</dt>
            <dd>${repo.maxPrsPerDay}</dd>
            <dt>Local Path</dt>
            <dd><code style="font-size:12px;color:var(--text-secondary)">${repo.localPath ?? "Not cloned yet"}</code></dd>
            <dt>Fork Created</dt>
            <dd>${repo.forkCreated ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-neutral">No</span>'}</dd>
            <dt>Last Scanned</dt>
            <dd>${repo.lastScannedAt ? new Date(repo.lastScannedAt).toLocaleString() : "Never"}</dd>
          </dl>
        </div>
      </div>

      <!-- Claude Instance History -->
      <div class="card section">
        <div class="card-header">
          <h2>Claude Instance History (this session)</h2>
          <span style="color:var(--text-tertiary);font-size:12px">${data.claudeHistory.length} calls</span>
        </div>
        <div class="card-body no-pad">
          ${data.claudeHistory.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Phase</th><th>Result</th><th>Prompt</th><th>Started</th><th>Duration</th><th>Cost</th><th>Error</th></tr></thead>
              <tbody>${claudeRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No Claude calls recorded for this repo yet</p></div>`}
        </div>
      </div>

      <!-- Scan History -->
      <div class="card section">
        <div class="card-header"><h2>Scan History</h2></div>
        <div class="card-body no-pad">
          ${data.scans.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Issues Found</th><th>Opportunities</th><th>Started</th><th>Completed</th><th>Duration</th></tr></thead>
              <tbody>${scanRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No scans yet</p></div>`}
        </div>
      </div>

      <!-- Contributions -->
      <div class="card section">
        <div class="card-header"><h2>Contributions</h2><span style="color:var(--text-tertiary);font-size:12px">${data.contributions.length} total</span></div>
        <div class="card-body no-pad">
          ${data.contributions.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Status</th><th>Title</th><th>PR/Issue</th><th>Started</th><th>Duration</th><th>Cost</th><th>Error</th></tr></thead>
              <tbody>${contribRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No contributions yet</p></div>`}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
