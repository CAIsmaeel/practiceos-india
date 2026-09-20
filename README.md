# Practice OS

Build a practice management web app called PracticeOS for Indian CA firms.

Use React with Tailwind CSS. Connect to Supabase.


The app should have:

1. SIDEBAR NAVIGATION with links to:

   - Dashboard

   - Clients

   - Engagements

   - Tasks

2. DASHBOARD PAGE showing:

   - Total clients count

   - Active engagements count  

   - Tasks due this week count

   - Overdue engagements count

   - A list of upcoming deadlines (next 7 days)

3. CLIENTS PAGE:

   - Table showing all clients (name, firm_name, email, phone)

   - "Add Client" button that opens a form modal

   - Form fields: Name, Firm Name, Email, Phone

   - On submit, save to Supabase 'clients' table

4. ENGAGEMENTS PAGE:

   - Table showing all engagements with client name, title, type, deadline, status, assigned_to

   - Status shown as colored badge: pending=yellow, in_progress=blue, completed=green, billed=purple

   - "Add Engagement" button with form: select client, title, type dropdown (GST Return, ITR Filing, Statutory Audit, Tax Audit, ROC Filing, MCA Compliance, Other), deadline date picker, assigned_to text, status

   - On submit save to Supabase 'engagements' table

   - Client name should be fetched by joining with clients table

5. TASKS PAGE:

   - List of all tasks grouped by engagement

   - Checkbox to mark complete (updates is_complete in Supabase)

   - "Add Task" button with form: select engagement, task title, assigned_to

   - Completed tasks shown with strikethrough

Design: Clean, professional, dark sidebar (#1e293b), white main area, blue accent (#3b82f6). Indian rupee symbol where needed. Mobile responsive.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://practiceos-india.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/80b1b061-1b82-42cc-9df1-41bc5de20286).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
