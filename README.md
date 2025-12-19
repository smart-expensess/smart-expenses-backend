## Smart Expense Pro – Backend

Node.js / TypeScript API for Smart Expense Pro. It uses Express, Prisma, and PostgreSQL.

### Tech stack

- **Runtime**: Node.js 20 (TypeScript)
- **Framework**: Express
- **ORM**: Prisma
- **Database**: PostgreSQL

### Local development

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

Create a `.env` file in the backend root:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smart_expense
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=change_me
GROQ_API_KEY=your_groq_api_key_here
```

3. **Run Prisma migrations**

```bash
npx prisma migrate deploy
```

4. **Start dev server**

```bash
npm run dev
```

API will run on `http://localhost:4000`.

### Docker usage

Build and run the backend + PostgreSQL with Docker Compose:

```bash
docker-compose up --build
```

This will:

- **db**: start PostgreSQL on port `5432`
- **backend**: start the API on port `4000`

### Scripts

- **`npm run dev`**: start dev server with `nodemon` (TypeScript)
- **`npm run build`**: compile TypeScript to `dist`
- **`npm start`**: run compiled app (`dist/server.js`)

### CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) will, on push/PR to `main`:

- Install dependencies
- Generate Prisma client
- Run migrations against a CI Postgres service
- Build the TypeScript project
- Run tests (placeholder command for now)
