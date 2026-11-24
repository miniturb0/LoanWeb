import { api } from "./api.js";

export const nok = (n, decimals = 0) =>
  new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
export const pct = (n) => `${n.toFixed(2).replace(".", ",")} %`;
export const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const BADGE = { pending: "text-bg-warning", approved: "text-bg-success", rejected: "text-bg-danger" };
export function statusBadge(status) {
  return `<span class="badge rounded-pill ${BADGE[status]} text-capitalize">${status}</span>`;
}

// Shows a Bootstrap alert inside `el`. type: "danger" | "success" | ...
export function showMessage(el, text, type = "danger") {
  el.className = `alert alert-${type} py-2 mb-0`;
  el.textContent = text;
  el.hidden = !text;
}

// Builds the navbar + breadcrumb, checks login, and redirects if the page needs a role.
// require: null | "user" | "admin";  guestOnly: send logged-in users away.
// crumbs: e.g. [["Home", "index.html"], ["My loans"]]
export async function initPage({ require = null, guestOnly = false, crumbs = [] } = {}) {
  const backend = await api();
  const user = await backend.me();

  if (require && !user) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname.split("/").pop())}`;
    return new Promise(() => {});
  }
  if (require === "admin" && user.role !== "admin") {
    location.href = "apply.html";
    return new Promise(() => {});
  }
  if (guestOnly && user) {
    location.href = user.role === "admin" ? "admin.html" : "apply.html";
    return new Promise(() => {});
  }

  renderNav(backend, user);
  renderBreadcrumb(crumbs);
  renderFooter(backend);
  return { backend, user };
}

function renderNav(backend, user) {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const here = location.pathname.split("/").pop() || "index.html";
  const item = (href, text) =>
    `<li class="nav-item"><a class="nav-link ${here === href ? "active" : ""}" href="${href}">${text}</a></li>`;
  const links = [item("index.html", "Calculator")];
  if (user) {
    links.push(item("apply.html", "My loans"));
    if (user.role === "admin") links.push(item("admin.html", "Admin"));
  }
  nav.className = "navbar navbar-expand-md navbar-dark bg-success";
  nav.innerHTML = `
    <div class="container">
      <a class="navbar-brand fw-bold" href="index.html">LoanWeb</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navMenu">
        <ul class="navbar-nav me-auto">${links.join("")}</ul>
        <div class="d-flex align-items-center gap-2">
          ${user
            ? `<span class="navbar-text">${escapeHtml(user.name)}${user.role === "admin" ? ' <span class="badge text-bg-warning">admin</span>' : ""}</span>
               <button class="btn btn-outline-light btn-sm" id="logout">Log out</button>`
            : `<a class="btn btn-outline-light btn-sm" href="login.html">Log in</a>
               <a class="btn btn-light btn-sm" href="signup.html">Sign up</a>`}
        </div>
      </div>
    </div>`;
  nav.querySelector("#logout")?.addEventListener("click", async () => {
    await backend.logout();
    location.href = "index.html";
  });
}

function renderBreadcrumb(crumbs) {
  const el = document.getElementById("breadcrumb");
  if (!el || !crumbs.length) return;
  el.setAttribute("aria-label", "breadcrumb");
  el.innerHTML = `<ol class="breadcrumb">${crumbs
    .map(([text, href], i) =>
      i === crumbs.length - 1 || !href
        ? `<li class="breadcrumb-item active" aria-current="page">${text}</li>`
        : `<li class="breadcrumb-item"><a href="${href}">${text}</a></li>`)
    .join("")}</ol>`;
}

function renderFooter(backend) {
  const footer = document.getElementById("footer");
  if (!footer) return;
  footer.className = "border-top py-3 text-center small text-body-secondary mt-auto";
  footer.innerHTML =
    backend.mode === "server"
      ? `LoanWeb · data stored in <code>data/db.json</code> on the server`
      : `LoanWeb · <strong>Demo mode</strong>: no server found, so data is kept in this browser (localStorage). Run <code>npm start</code> to use the JSON file database.`;
}
