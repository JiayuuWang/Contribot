interface HistoryData {
  contributions: any[];
  page: number;
}

export function historyTemplate(data: HistoryData): string {
  const rows = data.contributions
    .map(
      (c) => `
    <tr>
      <td>${c.repoName}</td>
      <td>${c.type}</td>
      <td><span class="status-badge status-${c.status}">${c.status}</span></td>
      <td>${c.title ?? "-"}</td>
      <td>${c.prUrl ? `<a href="${c.prUrl}" target="_blank">View</a>` : "-"}</td>
      <td>${c.startedAt ?? "-"}</td>
      <td>${c.errorMessage ?? "-"}</td>
    </tr>`
    )
    .join("");

  const prevPage = data.page > 1 ? `<a href="/history?page=${data.page - 1}">← Previous</a>` : "";
  const nextPage =
    data.contributions.length === 20
      ? `<a href="/history?page=${data.page + 1}">Next →</a>`
      : "";

  return `
    <h1>Contribution History</h1>

    <table>
      <thead>
        <tr>
          <th>Repo</th>
          <th>Type</th>
          <th>Status</th>
          <th>Title</th>
          <th>PR</th>
          <th>Started</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>${rows || "<tr><td colspan='7'>No contributions yet</td></tr>"}</tbody>
    </table>

    <nav>
      ${prevPage}
      <span> Page ${data.page} </span>
      ${nextPage}
    </nav>
  `;
}
