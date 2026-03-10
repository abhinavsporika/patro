// markup-patterns.ts — Static patterns for non-transpilable languages (HTML, CSS, SQL)
// These languages don't map from Python; they have their own idiomatic patterns.

export interface StaticPattern {
  id: string;
  domain: string;
  difficulty: number;
  content: string;
}

export const HTML_PATTERNS: StaticPattern[] = [
  {
    id: "html_001_basic_page",
    domain: "markup",
    difficulty: 0.08,
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Page</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`,
  },
  {
    id: "html_002_form",
    domain: "markup",
    difficulty: 0.15,
    content: `<form action="/submit" method="POST">
  <label for="email">Email:</label>
  <input type="email" id="email" name="email" required>
  <label for="password">Password:</label>
  <input type="password" id="password" name="password" minlength="8" required>
  <button type="submit">Sign In</button>
</form>`,
  },
  {
    id: "html_003_semantic_layout",
    domain: "markup",
    difficulty: 0.2,
    content: `<header>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </nav>
</header>
<main>
  <article>
    <h2>Blog Post Title</h2>
    <p>Content goes here.</p>
  </article>
  <aside>
    <h3>Related Links</h3>
    <ul>
      <li><a href="#">Link 1</a></li>
      <li><a href="#">Link 2</a></li>
    </ul>
  </aside>
</main>
<footer>
  <p>&copy; 2026 My Site</p>
</footer>`,
  },
  {
    id: "html_004_table",
    domain: "markup",
    difficulty: 0.18,
    content: `<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Role</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alice</td>
      <td>Engineer</td>
      <td>Active</td>
    </tr>
    <tr>
      <td>Bob</td>
      <td>Designer</td>
      <td>On Leave</td>
    </tr>
  </tbody>
</table>`,
  },
];

export const CSS_PATTERNS: StaticPattern[] = [
  {
    id: "css_001_flexbox_center",
    domain: "styling",
    difficulty: 0.1,
    content: `.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}`,
  },
  {
    id: "css_002_grid_layout",
    domain: "styling",
    difficulty: 0.22,
    content: `.dashboard {
  display: grid;
  grid-template-columns: 250px 1fr;
  grid-template-rows: 60px 1fr 40px;
  grid-template-areas:
    "sidebar header"
    "sidebar main"
    "sidebar footer";
  height: 100vh;
}

.header { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main { grid-area: main; }
.footer { grid-area: footer; }`,
  },
  {
    id: "css_003_responsive_card",
    domain: "styling",
    difficulty: 0.25,
    content: `.card {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

@media (max-width: 768px) {
  .card { padding: 1rem; }
}`,
  },
  {
    id: "css_004_dark_theme",
    domain: "styling",
    difficulty: 0.3,
    content: `:root {
  --bg: #ffffff;
  --text: #1a1a2e;
  --accent: #e94560;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f23;
    --text: #ccccdd;
    --accent: #ff6b6b;
  }
}

body {
  background: var(--bg);
  color: var(--text);
}`,
  },
];

export const SQL_PATTERNS: StaticPattern[] = [
  {
    id: "sql_001_select_where",
    domain: "query",
    difficulty: 0.1,
    content: `SELECT name, email, created_at
FROM users
WHERE role = 'admin'
  AND active = true
ORDER BY created_at DESC
LIMIT 10;`,
  },
  {
    id: "sql_002_join",
    domain: "query",
    difficulty: 0.25,
    content: `SELECT u.name, o.total, o.created_at
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE o.total > 100.00
ORDER BY o.created_at DESC;`,
  },
  {
    id: "sql_003_aggregate",
    domain: "query",
    difficulty: 0.3,
    content: `SELECT
  department,
  COUNT(*) AS employee_count,
  AVG(salary) AS avg_salary,
  MAX(salary) AS max_salary
FROM employees
GROUP BY department
HAVING COUNT(*) >= 5
ORDER BY avg_salary DESC;`,
  },
  {
    id: "sql_004_create_index_transaction",
    domain: "query",
    difficulty: 0.35,
    content: `BEGIN TRANSACTION;

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

INSERT INTO audit_log (action, table_name, performed_at)
  VALUES ('create_index', 'users', CURRENT_TIMESTAMP);

COMMIT;`,
  },
];

export function getStaticPatterns(language: string): StaticPattern[] {
  switch (language) {
    case "html": return HTML_PATTERNS;
    case "css": return CSS_PATTERNS;
    case "sql": return SQL_PATTERNS;
    default: return [];
  }
}
