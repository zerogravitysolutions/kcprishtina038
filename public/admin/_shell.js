/* Renders the shared sidebar + top bar.
   Call: renderShell({ page: 'dashboard' | 'members' | 'applications' | 'events' | ..., crumbs: [...], pageTitle: '...' })
*/

const ADMIN_NAV = [
  {
    group: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "grid" },
      { id: "applications", label: "Applications", href: "applications.html", icon: "inbox", badge: "4" }
    ]
  },
  {
    group: "Roster",
    items: [
      { id: "members", label: "Members", href: "members.html", icon: "users" },
      { id: "sections", label: "Sections", href: "sections.html", icon: "layers" },
      { id: "staff", label: "Staff & coaches", href: "staff.html", icon: "whistle" }
    ]
  },
  {
    group: "Calendar",
    items: [
      { id: "events", label: "Events", href: "events.html", icon: "calendar" },
      { id: "results", label: "Results", href: "results.html", icon: "trophy" }
    ]
  },
  {
    group: "Content",
    items: [
      { id: "news", label: "News", href: "news.html", icon: "doc" },
      { id: "media", label: "Media library", href: "media.html", icon: "image" },
      { id: "sponsors", label: "Sponsors", href: "sponsors.html", icon: "tag" }
    ]
  },
  {
    group: "System",
    items: [
      { id: "settings", label: "Settings", href: "settings.html", icon: "gear" }
    ]
  }
];

const ICONS = {
  grid: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>',
  inbox: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 9V13a1 1 0 001 1h10a1 1 0 001-1V9M2 9l1.5-5A1 1 0 014.46 3.3h7.08A1 1 0 0112.5 4L14 9M2 9h3.5a.5.5 0 01.5.5v.5a2 2 0 004 0v-.5a.5.5 0 01.5-.5H14" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11 6.5a2 2 0 100-4M14 13c0-1.9-1.3-3.4-3-3.85" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  layers: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  whistle: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 6h4M10 6l-2.5 4.5a3 3 0 11-1.5-1L8 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="11" r="2.5" stroke="currentColor" stroke-width="1.4"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 2v3M11 2v3M2 7h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  trophy: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 3h8v3a4 4 0 11-8 0V3z" stroke="currentColor" stroke-width="1.4"/><path d="M4 4H2v1.5a2 2 0 002 2M12 4h2v1.5a2 2 0 01-2 2M6 14h4M8 10v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  doc: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l4 4v8a0 0 0 010 0H3a0 0 0 010 0V2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 2v4h4M5 9h6M5 11h6M5 7h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  image: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M2 11l3.5-3 3 3 2-2L14 12" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  tag: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8l6-6h5v5l-6 6-5-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10" cy="6" r="1" stroke="currentColor" stroke-width="1.4"/></svg>',
  gear: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" stroke-width="1.5"/></svg>',
  external: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2H2v8h8V7M7 2h3v3M10 2L5 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  more: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.4"/><path d="M9 9l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 6a4 4 0 118 0v2l1 2H2l1-2V6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.5 12a1.5 1.5 0 003 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
};

function renderShell({ page, crumbs = [], pageActions = "" }) {
  const sideHtml = `
    <aside class="side">
      <a class="brand" href="../index.html">
        <img src="../assets/logo.jpg" alt="" />
        <div class="brand-text">
          <span class="kc">Prishtina 038</span>
          <span class="sub">Admin · v0.1</span>
        </div>
      </a>
      ${ADMIN_NAV.map(g => `
        <div class="nav-group">${g.group}</div>
        ${g.items.map(it => `
          <a class="nav-item ${it.id === page ? "active" : ""}" href="${it.href}">
            <span class="ic">${ICONS[it.icon] || ""}</span>
            <span>${it.label}</span>
            ${it.badge ? `<span class="badge">${it.badge}</span>` : ""}
          </a>
        `).join("")}
      `).join("")}
      <div class="me">
        <div class="avatar">SP</div>
        <div class="who">
          Shqiponja Pllana
          <span>Owner</span>
        </div>
      </div>
    </aside>
  `;

  const crumbsHtml = crumbs.map((c, i, arr) =>
    i === arr.length - 1
      ? `<strong>${c.label}</strong>`
      : `<a href="${c.href || '#'}">${c.label}</a><span style="opacity:.4;">/</span>`
  ).join("");

  const topHtml = `
    <header class="top">
      <div class="crumbs">${crumbsHtml}</div>
      <div class="search">
        <span style="color:var(--ink-3);">${ICONS.search}</span>
        <input type="text" placeholder="Search members, events, news…" />
        <span class="k">⌘K</span>
      </div>
      <div class="actions">
        <a class="public-link" href="../index.html" target="_blank">View site ${ICONS.external}</a>
        <button class="btn-icon btn">${ICONS.bell}</button>
      </div>
    </header>
  `;

  document.body.insertAdjacentHTML("afterbegin", `
    <div class="app">
      ${sideHtml}
      ${topHtml}
      <main class="main" id="admin-main"></main>
    </div>
  `);

  // Move children that were in <body> into <main>
  const main = document.getElementById("admin-main");
  const pageContent = document.getElementById("page-content");
  if (pageContent) main.appendChild(pageContent);
}
