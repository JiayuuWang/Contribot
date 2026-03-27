export function layoutTemplate(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    :root {
      --pico-font-size: 15px;
    }
    body { padding-top: 1rem; }
    nav { margin-bottom: 2rem; }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: 600;
    }
    .status-pr_created, .status-merged, .status-completed { background: #d4edda; color: #155724; }
    .status-failed, .status-interrupted { background: #f8d7da; color: #721c24; }
    .status-coding, .status-scanning, .status-pushing, .status-in_progress { background: #cce5ff; color: #004085; }
    .status-pending, .status-planning { background: #fff3cd; color: #856404; }
    .card {
      background: var(--pico-card-background-color);
      border: 1px solid var(--pico-muted-border-color);
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
    }
    .card h3 { margin: 0; font-size: 2rem; }
    .card p { margin: 0.5rem 0 0; color: var(--pico-muted-color); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
    table { font-size: 0.9em; }
  </style>
</head>
<body>
  <main class="container">
    <nav>
      <ul>
        <li><strong>Contribot</strong></li>
      </ul>
      <ul>
        <li><a href="/">Overview</a></li>
        <li><a href="/history">History</a></li>
      </ul>
    </nav>
    ${content}
  </main>
</body>
</html>`;
}
