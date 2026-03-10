# Aditi Billing App

A full-stack construction management and billing application designed for government construction projects. It tracks sites, materials, labour, fuel, machinery, office expenses, sale bills, BOQ (Bill of Quantities), vendor management, daily reports, and document uploads — all from a single dashboard.

---

## Features

- **Dashboard** – At-a-glance KPIs and charts across all active sites
- **Site Management** – Create and manage multiple construction sites
- **Materials** – Track material purchases and inventory per site
- **Labour** – Record daily labour attendance and wages
- **Fuel Expenses** – Log fuel consumption for vehicles and equipment
- **Machinery** – Manage machinery usage and maintenance costs
- **Office Expenses** – Track miscellaneous office/overhead expenses
- **Government / Taxes** – Manage government levies and tax entries
- **Sale Bills** – Raise and manage sale/invoice bills
- **BOQ (Bill of Quantities)** – Create and monitor project BOQs
- **Vendors** – Maintain a vendor directory with contact details
- **Daily Reports** – Generate and view daily progress reports
- **Documents** – Upload and manage site-related documents (PDF, images, etc.)
- **Alerts** – Configurable alerts for budget thresholds and deadlines
- **User Management** – Role-based access control with JWT authentication

---

## Tech Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18, React Router v7, Recharts, Tailwind CSS, Vite |
| Backend   | Node.js, Express 4 |
| Database  | SQLite via `better-sqlite3` |
| Auth      | JWT (`jsonwebtoken`), password hashing (`bcryptjs`) |
| File uploads | Multer |
| Dev tools | Concurrently, Jest, Supertest |

---

## Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/JAYNESHBHAISAPOLIYA/aditi-billing-app.git
cd aditi-billing-app

# 2. Install root (server) dependencies
npm install

# 3. Install client dependencies
cd client && npm install && cd ..
```

### Environment Variables

Create a `.env` file in the project root (it is git-ignored):

```env
PORT=5000
JWT_SECRET=your_jwt_secret_here
NODE_ENV=development
```

---

## Running the App

### Development (frontend + backend concurrently)

```bash
npm run dev
```

- Backend API: `http://localhost:5000`
- Frontend dev server: `http://localhost:5173` (Vite default)

### Production

```bash
# Build the React frontend
npm run build

# Start the production server (serves the built frontend)
npm start
```

### Seed the Database

```bash
npm run seed
```

This creates the SQLite database schema and populates it with sample data.

---

## Running Tests

```bash
# Run all tests with coverage
npm test

# Watch mode
npm run test:watch
```

Tests use **Jest** and **Supertest** and are located alongside the server source files.

---

## Project Structure

```
aditi-billing-app/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── context/         # React context (auth, etc.)
│   │   ├── pages/           # Page-level components
│   │   ├── api.js           # Axios/fetch wrapper
│   │   └── main.jsx         # App entry point
│   ├── index.html
│   └── vite.config.js
├── server/                  # Express backend
│   ├── middleware/          # Auth & error middleware
│   ├── routes/              # REST API route handlers
│   │   ├── auth.js
│   │   ├── sites.js
│   │   ├── materials.js
│   │   ├── labour.js
│   │   ├── fuel.js
│   │   ├── machinery.js
│   │   ├── expenses.js
│   │   ├── government.js
│   │   ├── sales.js
│   │   ├── boq.js
│   │   ├── vendors.js
│   │   ├── reports.js
│   │   ├── documents.js
│   │   ├── alerts.js
│   │   └── dashboard.js
│   ├── utils/               # Helper utilities
│   ├── db.js                # Database initialization
│   ├── seed.js              # Database seeding script
│   └── index.js             # Express app entry point
├── uploads/                 # Uploaded files (git-ignored)
├── package.json             # Root package (scripts + server deps)
└── README.md
```

---

## API Overview

All API routes are prefixed with `/api`.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/login` | Login and receive JWT |
| POST | `/auth/register` | Register a new user |
| GET/POST | `/sites` | List / create sites |
| GET/POST | `/materials` | Materials entries |
| GET/POST | `/labour` | Labour records |
| GET/POST | `/fuel` | Fuel expense records |
| GET/POST | `/machinery` | Machinery records |
| GET/POST | `/expenses` | Office expense records |
| GET/POST | `/government` | Government levy records |
| GET/POST | `/sales` | Sale bill records |
| GET/POST | `/boq` | Bill of Quantities |
| GET/POST | `/vendors` | Vendor directory |
| GET/POST | `/daily-reports` | Daily progress reports |
| GET/POST | `/documents` | Document uploads |
| GET/POST | `/alerts` | Alert configuration |
| GET | `/dashboard` | Aggregated dashboard stats |
| GET | `/health` | Server health check |

> Protected routes require an `Authorization: Bearer <token>` header.

---

## License

This project is private. All rights reserved.
