// Talks to the Node server if it is running. If not (e.g. on GitHub Pages,
// which can only host static files), it falls back to a "demo mode" that keeps
// the same JSON database in the browser's localStorage.
import { calculateLoan, validateLoan } from "./loan.js";

const TOKEN_KEY = "loanweb-token";
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

// ---------- server backend ----------
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

const serverBackend = {
  mode: "server",
  async signup(name, email, password) {
    const d = await request("POST", "api/signup", { name, email, password });
    setToken(d.token);
    return d.user;
  },
  async login(email, password) {
    const d = await request("POST", "api/login", { email, password });
    setToken(d.token);
    return d.user;
  },
  async logout() {
    try { await request("POST", "api/logout"); } catch {}
    setToken(null);
  },
  async me() {
    if (!getToken()) return null;
    try { return (await request("GET", "api/me")).user; } catch { return null; }
  },
  async listLoans() { return (await request("GET", "api/loans")).loans; },
  async applyLoan(amount, months, purpose) { return (await request("POST", "api/loans", { amount, months, purpose })).loan; },
  async decideLoan(id, status, note) { return (await request("PATCH", `api/loans/${id}`, { status, note })).loan; },
};

// ---------- localStorage backend (demo / GitHub Pages) ----------
const DB_KEY = "loanweb-db";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, salt = crypto.randomUUID()) {
  return `${salt}:${await sha256(salt + password)}`;
}
async function checkPassword(password, stored) {
  const [salt] = stored.split(":");
  return (await hashPassword(password, salt)) === stored;
}

async function loadLocalDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw);
  // First visit: same structure as data/db.json, with a demo admin.
  const db = {
    users: [{
      id: crypto.randomUUID(), name: "Administrator", email: "admin@loanweb.no",
      password: await hashPassword("admin123"), role: "admin", createdAt: new Date().toISOString(),
    }],
    loans: [],
    sessions: {},
  };
  saveLocalDb(db);
  return db;
}
const saveLocalDb = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
const publicUser = ({ password, ...u }) => u;

async function currentUser(db) {
  const id = db.sessions?.[getToken()];
  return db.users.find((u) => u.id === id) || null;
}
async function requireUser(db) {
  const u = await currentUser(db);
  if (!u) throw new Error("Please log in.");
  return u;
}
function startSession(db, user) {
  const token = crypto.randomUUID();
  db.sessions = db.sessions || {};
  db.sessions[token] = user.id;
  saveLocalDb(db);
  setToken(token);
  return publicUser(user);
}

const localBackend = {
  mode: "local",
  async signup(name, email, password) {
    const db = await loadLocalDb();
    name = name.trim(); email = email.trim().toLowerCase();
    if (!name || !email || !password) throw new Error("Name, email and password are required.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (db.users.some((u) => u.email === email)) throw new Error("An account with this email already exists.");
    const user = { id: crypto.randomUUID(), name, email, password: await hashPassword(password), role: "user", createdAt: new Date().toISOString() };
    db.users.push(user);
    return startSession(db, user);
  },
  async login(email, password) {
    const db = await loadLocalDb();
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || !(await checkPassword(password, user.password))) throw new Error("Wrong email or password.");
    return startSession(db, user);
  },
  async logout() {
    const db = await loadLocalDb();
    if (db.sessions) delete db.sessions[getToken()];
    saveLocalDb(db);
    setToken(null);
  },
  async me() {
    const u = await currentUser(await loadLocalDb());
    return u ? publicUser(u) : null;
  },
  async listLoans() {
    const db = await loadLocalDb();
    const me = await requireUser(db);
    const loans = me.role === "admin" ? db.loans : db.loans.filter((l) => l.userId === me.id);
    return loans
      .map((l) => { const u = db.users.find((x) => x.id === l.userId); return { ...l, userName: u?.name, userEmail: u?.email }; })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async applyLoan(amount, months, purpose) {
    const db = await loadLocalDb();
    const me = await requireUser(db);
    const error = validateLoan(amount, months);
    if (error) throw new Error(error);
    if (!purpose.trim()) throw new Error("Please tell us what the loan is for.");
    const { schedule, ...calc } = calculateLoan(amount, months);
    const loan = { id: crypto.randomUUID(), userId: me.id, purpose: purpose.trim().slice(0, 200), ...calc,
      status: "pending", createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, adminNote: "" };
    db.loans.push(loan);
    saveLocalDb(db);
    return loan;
  },
  async decideLoan(id, status, note) {
    const db = await loadLocalDb();
    const me = await requireUser(db);
    if (me.role !== "admin") throw new Error("Admins only.");
    const loan = db.loans.find((l) => l.id === id);
    if (!loan) throw new Error("Loan not found.");
    if (loan.status !== "pending") throw new Error(`This loan was already ${loan.status}.`);
    Object.assign(loan, { status, adminNote: (note || "").slice(0, 300), decidedAt: new Date().toISOString(), decidedBy: me.email });
    saveLocalDb(db);
    return loan;
  },
};

// ---------- pick a backend ----------
let backendPromise;
export function api() {
  backendPromise ??= (async () => {
    try {
      const res = await fetch("api/health", { cache: "no-store" });
      if (res.ok && (await res.json()).ok) return serverBackend;
    } catch {}
    return localBackend;
  })();
  return backendPromise;
}
