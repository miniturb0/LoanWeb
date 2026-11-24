// LoanWeb server: Express + a JSON file as the database (data/db.json).
import express from "express";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateLoan, validateLoan } from "./docs/js/loan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "data", "db.json");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@loanweb.no";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// ---------- JSON "database" ----------
let db;
let writeQueue = Promise.resolve();

async function loadDb() {
  try {
    db = JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    db = { users: [], loans: [] };
    db.users.push({
      id: crypto.randomUUID(),
      name: "Administrator",
      email: ADMIN_EMAIL,
      password: hashPassword(ADMIN_PASSWORD),
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    await saveDb();
    console.log(`Created ${DB_FILE} with admin user ${ADMIN_EMAIL}`);
  }
}

// Writes go one at a time, to a temp file that is then renamed,
// so the JSON file is never left half-written.
function saveDb() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    const tmp = DB_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, DB_FILE);
  });
  return writeQueue;
}

// ---------- passwords & sessions ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

const sessions = new Map(); // token -> userId (logged out when server restarts)

const publicUser = ({ password, ...u }) => u;

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const user = db.users.find((u) => u.id === sessions.get(token));
  if (!user) return res.status(401).json({ error: "Please log in." });
  req.user = user;
  req.token = token;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
}

function startSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.id);
  return { token, user: publicUser(user) };
}

// ---------- routes ----------
const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, mode: "server" }));

app.post("/api/signup", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password are required." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: "An account with this email already exists." });

  const user = { id: crypto.randomUUID(), name, email, password: hashPassword(password), role: "user", createdAt: new Date().toISOString() };
  db.users.push(user);
  await saveDb();
  res.status(201).json(startSession(user));
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (!user || !checkPassword(String(req.body.password || ""), user.password))
    return res.status(401).json({ error: "Wrong email or password." });
  res.json(startSession(user));
});

app.post("/api/logout", auth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

// Users see their own loans, admins see everyone's.
app.get("/api/loans", auth, (req, res) => {
  const loans = req.user.role === "admin" ? db.loans : db.loans.filter((l) => l.userId === req.user.id);
  const withNames = loans.map((l) => {
    const u = db.users.find((x) => x.id === l.userId);
    return { ...l, userName: u?.name, userEmail: u?.email };
  });
  res.json({ loans: withNames.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.post("/api/loans", auth, async (req, res) => {
  const amount = Number(req.body.amount);
  const months = Number(req.body.months);
  const purpose = String(req.body.purpose || "").trim().slice(0, 200);
  const error = validateLoan(amount, months);
  if (error) return res.status(400).json({ error });
  if (!purpose) return res.status(400).json({ error: "Please tell us what the loan is for." });

  const { schedule, ...calc } = calculateLoan(amount, months);
  const loan = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    purpose,
    ...calc,
    status: "pending",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
    adminNote: "",
  };
  db.loans.push(loan);
  await saveDb();
  res.status(201).json({ loan });
});

app.patch("/api/loans/:id", auth, adminOnly, async (req, res) => {
  const loan = db.loans.find((l) => l.id === req.params.id);
  if (!loan) return res.status(404).json({ error: "Loan not found." });
  const { status, note } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected." });
  if (loan.status !== "pending") return res.status(409).json({ error: `This loan was already ${loan.status}.` });

  loan.status = status;
  loan.adminNote = String(note || "").slice(0, 300);
  loan.decidedAt = new Date().toISOString();
  loan.decidedBy = req.user.email;
  await saveDb();
  res.json({ loan });
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// The frontend lives in /docs (that is also the folder GitHub Pages serves).
app.use(express.static(path.join(__dirname, "docs")));

await loadDb();
app.listen(PORT, () => console.log(`LoanWeb running on http://localhost:${PORT}`));
