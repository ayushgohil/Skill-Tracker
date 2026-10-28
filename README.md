<div align="center">

# 🚀 Skill Tracker

**The ultimate minimalist cockpit for mastering your craft.**

[![Angular](https://img.shields.io/badge/Angular-21.x-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

[Features](#-key-features) • [Getting Started](#-getting-started) • [Configuration](#-configuration) • [Database](#-database) • [Edge Functions](#-edge-functions) • [Deployment](#-deployment) • [Contributing](#-contributing)

</div>

## 🌟 Overview

Skill Tracker is a productivity app for deep work and skill mastery. You break what you are learning into subjects, topics and subtopics, tick things off as you go, and the app shows your consistency over time. It is built with **Angular**, **Tailwind CSS** and **Supabase**.

Whether you are learning a programming language, an instrument, or preparing for exams, it helps you stay consistent and see your progress without the noise.

---

## ✨ Key Features

- **Hierarchical tracking** — organize learning as Subjects → Topics → Subtopics. A topic with subtopics completes automatically when all of its subtopics are done.
- **Topic depth, stars and notes** — mark each topic as shallow, medium or deep, star the ones that matter, and keep rich-text notes on them. Topics can be reordered by drag and drop.
- **Activity heatmap and streaks** — a GitHub-style heatmap on your profile shows how many items you completed each day.
- **Pomodoro timer** — start a focus session directly from any topic.
- **Weekly focus review** — recap what you completed last week and schedule starred focus topics for the week ahead.
- **Study partners** — share a subject with an invite link. You and your partner can see each other's progress on it.
- **File attachments in your own Google Drive** — attach images, documents, video, audio and more to a topic (up to 50 MB per file). Files are stored in your Google Drive, not on our servers.
- **Backup and restore** — export all your data as JSON, either as a download or into Google Drive, and restore from either one.
- **Accounts** — email and password or Google sign-in, password reset, and account deletion.
- **Light and dark themes**.

Google Drive features (attachments and Drive backups) are optional and only need a Google Cloud setup if you want them. See [Google sign-in and Drive](#google-sign-in-and-drive-optional).

---

## 🛠️ Tech Stack

- **Framework**: [Angular 21](https://angular.dev/) with standalone components and Signals
- **Styling**: [Tailwind CSS 3](https://tailwindcss.com/) with a custom design system
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, Edge Functions)
- **State**: Angular Signals and RxJS, with a small in-memory cache service
- **Notes editor**: [Quill](https://quilljs.com/) via `ngx-quill`
- **Dialogs**: [SweetAlert2](https://sweetalert2.github.io/)
- **Storage for attachments and backups**: Google Drive API (`drive.file` scope)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **20.19+**, **22.12+** or **24+** (required by Angular 21) and npm
- A [Supabase](https://supabase.com/) project
- Optional: the [Supabase CLI](https://supabase.com/docs/guides/cli) to deploy Edge Functions
- Optional: a Google Cloud project, for Google sign-in and Drive features

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ayushgohil/Skill-Tracker.git
   cd Skill-Tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set your Supabase credentials**

   Create `src/environments/environment.ts` (it is git-ignored):
   ```typescript
   export const environment = {
     production: false,
     supabaseUrl: 'YOUR_SUPABASE_URL',
     supabaseKey: 'YOUR_SUPABASE_ANON_KEY'
   };
   ```
   Or generate it from environment variables, the same way the production build does:
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_KEY=your-anon-key node set-env.js
   ```
   Note that `set-env.js` writes `production: true`.

4. **Set up the database** — see [Database](#-database).

5. **Start the dev server**
   ```bash
   npm start
   ```
   Open `http://localhost:4200`.

---

## ⚙️ Configuration

### Environment variables

| Variable | Used by | Description |
| --- | --- | --- |
| `SUPABASE_URL` | `set-env.js` (build) | Your Supabase project URL |
| `SUPABASE_KEY` | `set-env.js` (build) | Your Supabase **anon** key |

The anon key is designed to be public: your data is protected by Row Level Security, not by hiding this key. Never put the `service_role` key in the frontend or in these variables.

### Supabase Auth settings

In the Supabase dashboard under **Authentication → URL Configuration**, set your site URL and add these redirect URLs for every origin you use (for example `http://localhost:4200` and your production domain):

- `<origin>/auth/callback` (sign-in with Google and Drive connection)
- `<origin>/reset-password` (password reset emails)

### Google sign-in and Drive (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Drive API**, configure the OAuth consent screen, and create an **OAuth client ID** of type *Web application*. Add your Supabase callback as an authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase under **Authentication → Providers → Google**, enable the provider and paste the client ID and secret.
3. Give the `google-token` Edge Function the same credentials:
   ```bash
   supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
   ```

The app asks for the `drive.file` scope, which only lets it see files it created itself. Everything lives under a `NextLyr SkillTracker` folder in the user's Drive: attachments in `<Subject>/<Topic>` subfolders and backups in `Backups`.

---

## 🗄️ Database

Run the SQL files in the Supabase SQL editor. They are safe to run more than once.

| File | When to run it |
| --- | --- |
| `supabase_migration.sql` | New installs: creates `activity_logs` with Row Level Security |
| `supabase_migration_activity_daily.sql` | After the one above, on new and existing installs: makes `tasks_completed` a per-day count and converts old rows |
| `supabase_migration_restore_function.sql` | New and existing installs, **before** deploying the app: creates the `restore_user_data` function that makes backup restore all-or-nothing, and adds the missing delete policy on `activity_logs`. Needs the per-day migration above to have been run first |
| `supabase_migration_google_token_table.sql` | New and existing installs, **before** deploying the Edge Function and the app: creates the locked-down `user_google_tokens` table |
| `supabase_migration_google_token_cleanup.sql` | Existing installs only, **after** deploying: drops the old `profiles.google_refresh_token` column |
| `supabase_migration_drop_increment_activity_log.sql` | Existing installs only: removes an old, unsafe function the app no longer uses |

> **Heads up:** this repository only ships SQL for `activity_logs` and the Google token table. The other tables (`profiles`, `subjects`, `topics`, `subtopics`, `user_progress`, `weekly_goals`, `weekly_reviews`, `topic_media`, `subject_invites`, `subject_members`) and the sharing functions (`get_invite_preview`, `join_subject_by_code`, `get_partner_profiles`) are not included yet. A brand-new Supabase project therefore cannot be fully set up from this repo alone. Exporting the full schema into the repo is still to do.

---

## ⚡ Edge Functions

Two Supabase Edge Functions live in `supabase/functions/`:

| Function | What it does |
| --- | --- |
| `google-token` | Checks the caller's sign-in, reads their stored Google refresh token (service role only) and returns a short-lived Google access token. The refresh token is never sent to the browser. |
| `delete-account` | Deletes the signed-in user's data and their auth account. |

Deploy them with:

```bash
supabase functions deploy google-token
supabase functions deploy delete-account
```

---

## 📜 Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Dev server at `http://localhost:4200` |
| `npm run build` | Runs `set-env.js`, then a production build into `dist/skilltracker/browser` |
| `npm run watch` | Development build that rebuilds on change |
| `npm test` | Runs the unit tests |

---

## 🌐 Deployment

The app builds as a static single-page site, so it can be hosted anywhere that serves `index.html` for every route (the repo includes `public/vercel.json` with that rewrite for Vercel).

- **Build command:** `npm run build`
- **Output directory:** `dist/skilltracker/browser`
- **Build environment variables:** `SUPABASE_URL` and `SUPABASE_KEY`, because `set-env.js` writes them into `environment.ts` at build time

Server-side rendering is switched off (`"ssr": false` in `angular.json`). `src/server.ts` and the `serve:ssr:skilltracker` script are left over from the Angular scaffold.

The production build downloads Google Fonts to inline them, so the build machine needs internet access.

---

## 🏗️ Project Structure

```text
src/
├── app/
│   ├── auth/          # Login, register, password reset, OAuth callback
│   ├── core/          # Services, guards, models, utils and the Supabase client
│   ├── dashboard/     # Main tracking view and topic items
│   ├── landing/       # Landing page
│   ├── profile/       # Profile, heatmap, Drive settings, backup/restore, delete account
│   ├── shared/        # Media gallery, Pomodoro timer, toasts
│   ├── subjects/      # Subject detail, sharing and invite acceptance
│   └── weekly/        # Weekly focus review
├── assets/            # Static assets (timer alarm sound)
└── styles.css         # Global design system and tokens
supabase/functions/    # Edge Functions (google-token, delete-account)
supabase_migration*.sql  # Database migrations
set-env.js             # Generates environment.ts from environment variables
```

---

## 🔒 Security notes

- Your Supabase anon key is public by design. Access control relies on Row Level Security in your database.
- The Google refresh token is stored in `user_google_tokens`, a table the browser cannot read or write. Only the `google-token` Edge Function can read it, and the browser only receives short-lived access tokens.
- The Drive integration uses the narrow `drive.file` scope.

---

## 🤝 Contributing

Contributions are welcome and appreciated.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">

Built with ❤️ for masters of their craft.

[Follow on GitHub](https://github.com/ayushgohil) • [Report Bug](https://github.com/ayushgohil/Skill-Tracker/issues)

</div>
