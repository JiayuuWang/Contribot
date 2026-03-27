interface OverviewData {
  repos: any[];
  activeTasks: number;
  pendingTasks: number;
  totalContributions: number;
  successfulPRs: number;
  recentContributions: any[];
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    pr_created: "badge-success",
    merged: "badge-success",
    completed: "badge-success",
    failed: "badge-danger",
    interrupted: "badge-danger",
    coding: "badge-info",
    scanning: "badge-info",
    pushing: "badge-info",
    in_progress: "badge-info",
    pending: "badge-warning",
    planning: "badge-warning",
  };
  return `<span class="badge ${map[status] ?? "badge-neutral"}">${status}</span>`;
}

export function overviewTemplate(data: OverviewData): string {
  const repoRows = data.repos
    .map(
      (r) => `
    <tr>
      <td><a href="/repo/${r.fullName}" style="font-weight:500">${r.fullName}</a></td>
      <td>${JSON.parse(r.focus).map((f: string) => `<span class="badge badge-neutral">${f}</span> `).join("")}</td>
      <td>${r.enabled ? statusBadge("enabled") : statusBadge("disabled")}</td>
      <td style="color:var(--text-secondary)">${r.lastScannedAt ? new Date(r.lastScannedAt).toLocaleString() : "Never"}</td>
      <td><a href="/repo/${r.fullName}" class="btn btn-sm">Details</a></td>
    </tr>`
    )
    .join("");

  const contribRows = data.recentContributions
    .map(
      (c) => `
    <tr>
      <td><a href="/repo/${c.repoName}">${c.repoName}</a></td>
      <td><span class="badge badge-neutral">${c.type}</span></td>
      <td>${statusBadge(c.status)}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank" class="btn btn-sm">View PR</a>` : "-"}</td>
    </tr>`
    )
    .join("");

  return `
    <div class="topbar">
      <h1>Overview</h1>
      <div class="topbar-actions">
        <span style="color:var(--text-tertiary);font-size:13px" hx-get="/partials/clock" hx-trigger="every 60s" hx-swap="innerHTML">${new Date().toLocaleTimeString()}</span>
      </div>
    </div>

    <div class="content">
      <div class="stats-grid section" hx-get="/partials/stats" hx-trigger="every 10s" hx-swap="innerHTML">
        <div class="stat-card">
          <div class="stat-label">Active Tasks</div>
          <div class="stat-value">${data.activeTasks}</div>
          <div class="stat-sub">Currently running</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pending Tasks</div>
          <div class="stat-value">${data.pendingTasks}</div>
          <div class="stat-sub">In queue</div>
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
      </div>

      <div class="card section">
        <div class="card-header">
          <h2>Repositories</h2>
          <span style="color:var(--text-tertiary);font-size:13px">${data.repos.length} repos</span>
        </div>
        <div class="card-body no-pad">
          ${data.repos.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Repository</th><th>Focus</th><th>Status</th><th>Last Scan</th><th></th></tr></thead>
              <tbody>${repoRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No repos configured. Add [[repos]] to contribot.toml.</p></div>`}
        </div>
      </div>

      <div class="card section">
        <div class="card-header">
          <h2>Recent Contributions</h2>
          <a href="/history" class="btn btn-sm">View all</a>
        </div>
        <div class="card-body no-pad">
          ${data.recentContributions.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Repo</th><th>Type</th><th>Status</th><th>Title</th><th></th></tr></thead>
              <tbody>${contribRows}</tbody>
            </table>
          </div>` : `<div class="empty-state"><p>No contributions yet. Run the orchestrator to start.</p></div>`}
        </div>
      </div>
    </div>
  `;
}

// Map status to badge class (exported for use by other templates)
export { statusBadge };
