import { statusBadge } from "./overview.js";

interface HistoryData {
  contributions: any[];
  page: number;
}

export function historyTemplate(data: HistoryData): string {
  const rows = data.contributions
    .map(
      (c) => `
    <tr>
      <td><a href="/repo/${c.repoName}">${c.repoName}</a></td>
      <td><span class="badge badge-neutral">${c.type}</span></td>
      <td>${statusBadge(c.status)}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank" class="btn btn-sm">View PR</a>` : "-"}</td>
      <td style="color:var(--text-secondary)">${c.startedAt ? new Date(c.startedAt).toLocaleString() : "-"}</td>
      <td style="color:var(--danger);font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.errorMessage ?? ""}</td>
    </tr>`
    )
    .join("");

  const prevPage = data.page > 1 ? `<a href="/history?page=${data.page - 1}" class="btn btn-sm">&larr; Previous</a>` : "";
  const nextPage = data.contributions.length === 20 ? `<a href="/history?page=${data.page + 1}" class="btn btn-sm">Next &rarr;</a>` : "";

  return `
    <div class="topbar">
      <h1>Contribution History</h1>
      <div class="topbar-actions">
        <button class="theme-toggle" id="theme-btn" onclick="toggleTheme()" title="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
      </div>
    </div>

    <div class="content">
      <div class="card">
        <div class="card-body no-pad">
          ${data.contributions.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Repo</th><th>Type</th><th>Status</th><th>Title</th><th>PR</th><th>Started</th><th>Error</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="pagination">
            ${prevPage}
            <span>Page ${data.page}</span>
            ${nextPage}
          </div>` : `<div class="empty-state"><p>No contributions yet. Run the orchestrator to start contributing.</p></div>`}
        </div>
      </div>
    </div>
  `;
}
