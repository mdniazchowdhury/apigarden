# Inter-Office Memo Management System

A complete Flask + SQLAlchemy multi-tenant memo workflow application built for CSE226 Summer 2026 Project-3.

## Main features
- Multi-tenant organizations with strict `org_id` scoping
- Authentication, password hashing, session security and CSRF protection
- Organization admin, regular-user roles, department/user management
- Memo creation, drafts, editing and submission
- Ordered workflow with Approve, Reject, Request Changes, Comment and Forward/Complete Review
- Workflow history, comments, versions and delegation
- Secure attachment storage in the database (no guessable public file URL)
- In-app notifications
- Search/filtering respecting tenant and authorization boundaries
- Dashboard and admin reporting
- PDF memo export
- Audit log
- Responsive UI

## Quick start
1. Python 3.11+ recommended.
2. Create a virtual environment: `python -m venv .venv`
3. Activate it.
4. Install: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and set a strong `SECRET_KEY`.
6. For local demo, SQLite works by default. For production use PostgreSQL via `DATABASE_URL`.
7. Initialize/seed: `flask --app app init-db`
8. Run: `flask --app app run` or `python app.py`

## Demo accounts
All demo users are seeded automatically on first run.
- Admin: `admin@demo.local` / `Admin123!`
- Employee: `alice@demo.local` / `User123!`
- Department Head: `bob@demo.local` / `User123!`
- Finance Manager: `finance@demo.local` / `User123!`
- Director: `director@demo.local` / `User123!`
- Other tenant: `other@demo.local` / `Other123!`

Change demo passwords before any real deployment.

## Render deployment
Create a PostgreSQL database on Render, copy its internal/external connection string into `DATABASE_URL`, and deploy this repository using `render.yaml`. The app creates its tables automatically on startup; the CLI command can reseed a fresh database.

## Security notes
Secrets are not included. Tenant isolation is enforced by server-side queries using `org_id`; authorization is checked for memo access and workflow actions. Attachments are served only after authorization. Passwords are hashed with Werkzeug. Input is sanitized with Bleach and uploaded file types/sizes are restricted.

## CSE226 documentation checklist
The course specification requires a public deployed URL, source ZIP URL, installation/build/run instructions, technology/architecture/database/workflow/security documentation, AI prompt/response history, demonstration credentials, and disclosure of known limitations. Keep the actual AI conversation export separately and link it from your project document; do not replace the complete history with a summary.
