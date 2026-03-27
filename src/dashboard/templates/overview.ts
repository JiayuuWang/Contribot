interface OverviewData {
  repos: any[];
  activeTasks: number;
  pendingTasks: number;
  recentContributions: any[];
}

export function overviewTemplate(data: OverviewData): string {
  const repoRows = data.repos
    .map(
      (r) => `
    <tr>
      <td><a href="/repo/${r.fullName}">${r.fullName}</a></td>
      <td>${JSON.parse(r.focus).join(", ")}</td>
      <td><span class="status-badge ${r.enabled ? "status-completed" : "status-failed"}">${r.enabled ? "enabled" : "disabled"}</span></td>
      <td>${r.lastScannedAt ?? "never"}</td>
    </tr>`
    )
    .join("");

  const contribRows = data.recentContributions
    .map(
      (c) => `
    <tr>
      <td>${c.repoName}</td>
      <td>${c.type}</td>
      <td><span class="status-badge status-${c.status}">${c.status}</span></td>
      <td>${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank">View</a>` : "-"}</td>
    </tr>`
    )
    .join("");

  return `
    <h1>Dashboard</h1>

    <section hx-get="/partials/status" hx-trigger="every 10s" hx-swap="innerHTML">
      <div class="grid">
        <div class="card"><h3>${data.activeTasks}</h3><p>Active Tasks</p></div>
        <div class="card"><h3>${data.pendingTasks}</h3><p>Pending Tasks</p></div>
        <div class="card"><h3>${data.repos.length}</h3><p>Total Repos</p></div>
      </div>
    </section>

    <h2>Repositories</h2>
    <table>
      <thead>
        <tr><th>Repo</th><th>Focus</th><th>Status</th><th>Last Scan</th></tr>
      </thead>
      <tbody>${repoRows || "<tr><td colspan='4'>No repos configured</td></tr>"}</tbody>
    </table>

    <h2>Recent Contributions</h2>
    <table>
      <thead>
        <tr><th>Repo</th><th>Type</th><th>Status</th><th>Title</th><th>PR</th></tr>
      </thead>
      <tbody>${contribRows || "<tr><td colspan='5'>No contributions yet</td></tr>"}</tbody>
    </table>
  `;
}
