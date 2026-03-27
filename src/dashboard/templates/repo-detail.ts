import { statusBadge } from "./overview.js";

interface RepoDetailData {
  repo: any;
  contributions: any[];
  scans: any[];
}

export function repoDetailTemplate(data: RepoDetailData): string {
  const { repo } = data;
  const focus: string[] = JSON.parse(repo.focus);
  const labels: string[] = JSON.parse(repo.issueLabels);

  const contribRows = data.contributions
    .map(
      (c) => `
    <tr>
      <td><span class="badge badge-neutral">${c.type}</span></td>
      <td>${statusBadge(c.status)}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank">#${c.prNumber}</a>` : c.issueNumber ? `#${c.issueNumber}` : "-"}</td>
      <td style="color:var(--text-secondary)">${c.startedAt ? new Date(c.startedAt).toLocaleString() : "-"}</td>
      <td style="color:var(--danger);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.errorMessage ?? ""}</td>
    </tr>`
    )
    .join("");

  const scanRows = data.scans
    .map(
      (s) => `
    <tr>
      <td>${statusBadge(s.status === "completed" ? "completed" : s.status === "running" ? "in_progress" : "failed")}</td>
      <td>${s.issuesFound ?? 0}</td>
      <td>${s.opportunitiesFound ?? 0}</td>
      <td style="color:var(--text-secondary)">${new Date(s.startedAt).toLocaleString()}</td>
      <td style="color:var(--text-secondary)">${s.completedAt ? new Date(s.completedAt).toLocaleString() : "-"}</td>
    </tr>`
    )
    .join("");

  return `
    <div class="topbar">
      <h1>
        <a href="/" style="color:var(--text-tertiary);text-decoration:none;font-weight:400">&larr;</a>
        &nbsp; ${repo.fullName}
      </h1>
      <div class="topbar-actions">
        ${repo.enabled
          ? `<span class="badge badge-success">Enabled</span>`
          : `<span class="badge badge-danger">Disabled</span>`}
      </div>
    </div>

    <div class="content">
      <!-- Config -->
      <div class="card section">
        <div class="card-header">
          <h2>Configuration</h2>
          <a href="https://github.com/${repo.fullName}" target="_blank" class="btn btn-sm">View on GitHub</a>
        </div>
        <div class="card-body no-pad">
          <dl class="detail-grid">
            <dt>Repository</dt>
            <dd><a href="https://github.com/${repo.fullName}" target="_blank">${repo.fullName}</a></dd>
            <dt>Focus Areas</dt>
            <dd>${focus.map((f) => `<span class="badge badge-neutral">${f}</span> `).join("")}</dd>
            <dt>Issue Labels</dt>
            <dd>${labels.map((l) => `<span class="badge badge-info">${l}</span> `).join("")}</dd>
            <dt>Reasons</dt>
            <dd>${repo.reasons || "<span style='color:var(--text-tertiary)'>Not specified</span>"}</dd>
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

      <!-- Stats row -->
      <div class="stats-grid section">
        <div class="stat-card">
          <div class="stat-label">Total Contributions</div>
          <div class="stat-value">${data.contributions.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">PRs Created</div>
          <div class="stat-value">${data.contributions.filter((c) => c.status === "pr_created" || c.status === "merged").length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Scans</div>
          <div class="stat-value">${data.scans.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Failed</div>
          <div class="stat-value" style="color:${data.contributions.filter((c) => c.status === "failed").length > 0 ? "var(--danger)" : "inherit"}">${data.contributions.filter((c) => c.status === "failed").length}</div>
        </div>
      </div>

      <!-- Scan History -->
      <div class="card section">
        <div class="card-header"><h2>Scan History</h2></div>
        <div class="card-body no-pad">
          ${data.scans.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Issues Found</th><th>Opportunities</th><th>Started</th><th>Completed</th></tr></thead>
              <tbody>${scanRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No scans yet</p></div>`}
        </div>
      </div>

      <!-- Contributions -->
      <div class="card section">
        <div class="card-header"><h2>Contributions</h2></div>
        <div class="card-body no-pad">
          ${data.contributions.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Status</th><th>Title</th><th>PR/Issue</th><th>Started</th><th>Error</th></tr></thead>
              <tbody>${contribRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No contributions yet</p></div>`}
        </div>
      </div>
    </div>
  `;
}
