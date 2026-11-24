# LoanWeb

A loan application website. Users sign up, calculate what a loan will cost, and apply. An admin approves or rejects the applications. Data is stored in a **JSON file** (`data/db.json`).

Built with Node.js + Express (backend), Bootstrap 5 (frontend), and plain JavaScript modules.

## Features

- **Sign up / log in / log out.** Passwords are hashed (scrypt) and never stored in plain text.
- **Loan calculator.** Pick an amount (10 000 – 500 000 NOK) and a period (6 – 120 months) to see the monthly payment, interest, fees, effective rate, total cost and a full monthly repayment plan.
- **Interest depends on the period:**

  | Period        | Nominal rate |
  |---------------|-------------|
  | 6–12 months   | 7.90 %      |
  | 13–36 months  | 9.90 %      |
  | 37–60 months  | 11.90 %     |
  | 61–120 months | 13.90 %     |

  Plus an establishment fee of 950 NOK and a monthly fee of 45 NOK. Loans are annuity loans: you pay the same amount every month.
- **Apply for a loan.** Users see their applications and status: pending, approved or rejected.
- **Admin page.** Admins see all applications, filter them by status, and approve or reject them with an optional note.
- **Breadcrumbs** on every page.

## Run it locally (full version with the JSON database)

```bash
npm install
npm start
```

Open <http://localhost:3000>.

On first start the server creates `data/db.json` with an admin user:

- Email: `admin@loanweb.no`
- Password: `admin123`

You can choose your own admin login with `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm start`. `data/db.json` is in `.gitignore`, so your test users are not pushed to GitHub. `data/db.example.json` shows what the file looks like.

## Project structure

```
server.js            Express server + REST API + JSON file database
data/db.json         the database (created automatically)
docs/                the website (also what GitHub Pages serves)
  index.html         loan calculator
  signup.html        create account
  login.html         log in
  apply.html         apply for a loan + my applications
  admin.html         approve / reject applications
  js/loan.js         loan maths (shared by browser and server)
  js/api.js          talks to the server, or falls back to demo mode
  js/calculator.js   calculator component
  js/common.js       navbar, breadcrumb, helpers
```

### API

| Method | URL               | Who   | Body                          |
|--------|-------------------|-------|-------------------------------|
| POST   | `/api/signup`     | all   | `{ name, email, password }`   |
| POST   | `/api/login`      | all   | `{ email, password }`         |
| POST   | `/api/logout`     | user  |                               |
| GET    | `/api/me`         | user  |                               |
| GET    | `/api/loans`      | user  | own loans (admin: all loans)  |
| POST   | `/api/loans`      | user  | `{ amount, months, purpose }` |
| PATCH  | `/api/loans/:id`  | admin | `{ status: "approved" \| "rejected", note }` |