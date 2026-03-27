interface RepoDetailData {
  repo: any;
  contributions: any[];
  scans: any[];
}

export function repoDetailTemplate(data: RepoDetailData): string {
  const { repo } = data;
  const focus = JSON.parse(repo.focus);
  const labels = JSON.parse(repo.issueLabels);

  const contribRows = data.contributions
    .map(
      (c) => `
    <tr>
      <td>${c.type}</td>
      <td><span class="status-badge status-${c.status}">${c.status}</span></td>
      <td>${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank">#${c.prNumber}</a>` : c.issueNumber ? `#${c.issueNumber}` : "-"}</td>
      <td>${c.startedAt ?? "-"}</td>
      <td>${c.errorMessage ?? "-"}</td>
    </tr>`
    )
    .join("");

  const scanRows = data.scans
    .map(
      (s) => `
    <tr>
      <td><span class="status-badge status-${s.status === "completed" ? "completed" : s.status === "running" ? "in_progress" : "failed"}">${s.status}</span></td>
      <td>${s.issuesFound ?? 0}</td>
      <td>${s.opportunitiesFound ?? 0}</td>
      <td>${s.startedAt}</td>
      <td>${s.completedAt ?? "-"}</td>
    </tr>`
    )
    .join("");

  return `
    <h1><a href="/">←</a> ${repo.fullName}</h1>

    <div class="grid">
      <div class="card">
        <h3>${repo.enabled ? "Enabled" : "Disabled"}</h3>
        <p>Status</p>
      </div>
      <div class="card">
        <h3>${repo.maxPrsPerDay}</h3>
        <p>Max PRs/Day</p>
      </div>
      <div class="card">
        <h3>${data.contributions.length}</h3>
        <p>Contributions</p>
      </div>
    </div>

    <h3>Config</h3>
    <table>
      <tr><td><strong>Focus</strong></td><td>${focus.join(", ")}</td></tr>
      <tr><td><strong>Labels</strong></td><td>${labels.join(", ")}</td></tr>
      <tr><td><strong>Reasons</strong></td><td>${repo.reasons || "-"}</td></tr>
      <tr><td><strong>Last Scan</strong></td><td>${repo.lastScannedAt ?? "never"}</td></tr>
      <tr><td><strong>Local Path</strong></td><td>${repo.localPath ?? "not cloned"}</td></tr>
    </table>

    <h3>Scan History</h3>
    <table>
      <thead><tr><th>Status</th><th>Issues</th><th>Opportunities</th><th>Started</th><th>Completed</th></tr></thead>
      <tbody>${scanRows || "<tr><td colspan='5'>No scans yet</td></tr>"}</tbody>
    </table>

    <h3>Contributions</h3>
    <table>
      <thead><tr><th>Type</th><th>Status</th><th>Title</th><th>PR/Issue</th><th>Started</th><th>Error</th></tr></thead>
      <tbody>${contribRows || "<tr><td colspan='6'>No contributions yet</td></tr>"}</tbody>
    </table>
  `;
}
