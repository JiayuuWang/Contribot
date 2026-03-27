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
