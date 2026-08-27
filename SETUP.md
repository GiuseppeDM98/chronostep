# ChronoStep Setup Guide

Complete guide to setting up ChronoStep for local development.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Firebase Project Setup](#firebase-project-setup)
3. [Local Development Setup](#local-development-setup)
4. [Firestore Security Rules Deployment](#firestore-security-rules-deployment)
5. [Running the Application](#running-the-application)
6. [Cattura da note (Claude API)](#6-cattura-da-note-claude-api)
7. [The demo account is read-only](#7-the-demo-account-is-read-only)
8. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

### Required Software

- **Node.js** 18.x or 20.x (LTS recommended)
- **npm** 9.x or later (comes with Node.js)
- **Git**
- **Firebase account** (free tier is sufficient)

### Verify Installation

Open your terminal and run:

```bash
node --version  # Should show v18.x or v20.x
npm --version   # Should show 9.x or later
git --version   # Should show 2.x or later
```

If any of these commands fail, install the missing software:
- Node.js: [https://nodejs.org/](https://nodejs.org/)
- Git: [https://git-scm.com/](https://git-scm.com/)

---

## 2. Firebase Project Setup

### 2.1 Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** (or **"Create a project"**)
3. Enter a project name (e.g., `chronostep-dev`)
4. (Optional) Disable Google Analytics if you don't need it for development
5. Click **"Create project"**
6. Wait for the project to be provisioned, then click **"Continue"**

### 2.2 Enable Authentication

1. In the Firebase Console, select your project
2. In the left sidebar, navigate to **Build > Authentication**
3. Click **"Get started"**
4. Under the **"Sign-in method"** tab, find **"Email/Password"**
5. Click on it, then toggle the **"Enable"** switch
6. Click **"Save"**

### 2.3 Create Firestore Database

1. In the left sidebar, navigate to **Build > Firestore Database**
2. Click **"Create database"**
3. Select **"Start in production mode"** (we'll deploy security rules later)
4. Choose a location closest to you or your users:
   - For Europe: `eur3 (europe-west)`
   - For US: `us-central1` or `us-east1`
5. Click **"Enable"**
6. Wait for the database to be created

### 2.4 Register Web App

1. In the Firebase Console, go to **Project Overview** (home icon in sidebar)
2. Click the **Web icon** (`</>`) to add a web app
3. Enter an app nickname (e.g., `chronostep-web`)
4. **Do NOT** check "Also set up Firebase Hosting"
5. Click **"Register app"**
6. You'll see a code snippet with your Firebase configuration. It looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  appId: "1:123456789:web:abcdef1234567890"
};
```

7. **Keep this window open** or copy these values somewhere safe. You'll need them in step 3.3
8. Click **"Continue to console"**

---

## 3. Local Development Setup

### 3.1 Clone the Repository

```bash
git clone https://github.com/[username]/chronostep.git
cd chronostep
```

> **Note**: Replace `[username]` with the actual GitHub username where ChronoStep is hosted.

### 3.2 Install Dependencies

```bash
npm install
```

This will install all required packages listed in `package.json`. It may take a few minutes.

### 3.3 Configure Environment Variables

1. Copy the example environment file:

```bash
cp .env.example .env
```

On Windows (if `cp` doesn't work):
```cmd
copy .env.example .env
```

2. Open the `.env` file in your text editor
3. Fill in your Firebase credentials from step 2.4:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your_actual_app_id_here
```

**Example** (with fake values):
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=chronostep-dev-12345.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=chronostep-dev-12345
NEXT_PUBLIC_FIREBASE_APP_ID=1:788973220328:web:a3a81d77b1dbc67578345d
```

**Optional**: Lock down new registrations by default:
```env
NEXT_PUBLIC_DISABLE_SIGNUPS=true
NEXT_PUBLIC_SIGNUP_WHITELIST=admin@example.com,team@example.com
```

**Optional**: Turn on the Cattura screen, which needs an Anthropic API key. Neither variable is
`NEXT_PUBLIC_`, so neither reaches the browser — see [section 6](#6-cattura-da-note-claude-api) for
why the allow list matters:
```env
ANTHROPIC_API_KEY=sk-ant-...
AI_ALLOWED_EMAILS=you@example.com
```

**Security Warning**: Never commit the `.env` file to version control. It's already in `.gitignore`, but double-check before pushing to GitHub.

---

## 4. Firestore Security Rules Deployment

ChronoStep includes security rules that ensure users can only access their own data. You must deploy these rules before the app will work correctly.

### 4.1 Install Firebase CLI

If you haven't already installed the Firebase CLI globally:

```bash
npm install -g firebase-tools
```

Verify installation:
```bash
firebase --version
```

### 4.2 Login to Firebase

```bash
firebase login
```

This will open a browser window for you to authenticate with your Google account. Allow Firebase CLI to access your account.

### 4.3 Select Your Project

Link the local project to your Firebase project:

```bash
firebase use your-project-id
```

Replace `your-project-id` with your actual Firebase project ID from step 2.4.

Alternatively, you can select from a list:
```bash
firebase use
```

### 4.4 Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

You should see output like:
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project-id/overview
```

**Verify**: Go to Firebase Console > Firestore Database > Rules to confirm your rules are deployed.

---

## 5. Running the Application

### 5.1 Start Development Server

```bash
npm run dev
```

You should see output like:
```
   ▲ Next.js 14.1.0
   - Local:        http://localhost:3000
   - Network:      http://192.168.x.x:3000

 ✓ Ready in 2.3s
```

The application is now running at [http://localhost:3000](http://localhost:3000)

### 5.2 Create Your First Account

1. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)
2. You'll be redirected to the authentication page
3. Click **"Sign Up"** (or similar button)
4. Enter your email and password (minimum 6 characters)
5. Click **"Create Account"** (or **"Sign Up"**)
6. You'll be redirected to the home page

**Congratulations!** You can now start creating tasks, steps, and work logs.

---

## 6. Cattura da note (Claude API)

The **Cattura** screen turns pasted notes into proposed tasks, nested steps and work-log entries.
It is the only feature in ChronoStep that reaches a server: `/api/ai/capture` holds the Anthropic
API key, because a key in a browser is a key anyone can read. That route talks to Claude and
nothing else — it opens no database connection and writes nothing. Every write still happens in the
client, through the ordinary store, under `firestore.rules`.

The app runs perfectly well without any of this configured; the screen simply reports that the
feature is off.

### 6.1 Get an Anthropic API key

Create one at [console.anthropic.com](https://console.anthropic.com/) under **API Keys**. Set a
spend limit on the account while you are there — this endpoint is guarded, but a spend limit is the
only ceiling that cannot be reasoned around.

### 6.2 Configure it locally

Add to `.env` (never committed — see `.gitignore`):

```bash
ANTHROPIC_API_KEY=sk-ant-...
AI_ALLOWED_EMAILS=you@example.com
```

`AI_ALLOWED_EMAILS` is the list of accounts allowed to spend that key. **Leave it empty and the
route is open in development and closed in production.** That default is deliberate: the demo
account's credentials are printed on the sign-in screen, so without a list "any signed-in user"
means "anyone holding the link", and every request costs real money.

Neither variable is `NEXT_PUBLIC_`, so neither is bundled into the client.

### 6.3 Configure it on Vercel

Project Settings → Environment Variables → add `ANTHROPIC_API_KEY` and `AI_ALLOWED_EMAILS` for the
environments you want it in, then redeploy. Environment variables are read at build and at runtime,
so an existing deployment does not pick them up until it is rebuilt.

### 6.4 What travels to Anthropic

Everything in this list, and nothing else:

- the notes you type;
- for each of your tasks: its title, status, **due date** and document id;
- for each of their steps: title, status and document id;
- the tags already in use across your tasks and work log.

The model needs the ids and titles to say "add these steps to *that* task" instead of creating a
duplicate. Work-log **messages** are not sent, and neither are durations. The hint under the input
on the Cattura screen says the same thing — if you change what `buildContextPayload` sends, change
both.

### 6.5 If it does not work

| What the screen says | What it means |
|---|---|
| «La Claude API non è configurata su questo ambiente.» | `ANTHROPIC_API_KEY` is unset where the app is running. On Vercel, redeploy after adding it. |
| «Questo account non è abilitato a usare l'AI.» | The signed-in address is not in `AI_ALLOWED_EMAILS`, or the list is empty and this is production. |
| «La chiave della Claude API non è valida.» | The key is set but Anthropic rejects it — revoked, mistyped, or from another organisation. |
| «La sessione è scaduta. Esci e rientra.» | The Firebase ID token was refused. Signing out and back in issues a fresh one. |
| «Hai fatto molte richieste in un'ora.» | Thirty calls per account per hour, counted per server instance. |

---

## 7. The demo account is read-only

The credentials on the sign-in screen are public, so "the demo account" means "everyone who has the
link". It can open every screen and read everything, and it cannot create, edit or delete anything.

### 7.1 Where that is enforced

In `firestore.rules`, and nowhere else. `isDemoAccount()` matches the demo address against the
token's email claim, and `mayWrite()` gates every `create`, `update` and `delete` on all three
collections. `npm run test:rules` proves it in pairs: each check is the same write, refused for the
demo account and accepted for a normal one.

The interface also stops offering write controls to that account and explains why in a band across
the top. That is a courtesy, not the boundary — the interface is JavaScript served to the same
public, and a hidden button is a suggestion.

### 7.2 The two places the address is written

| Where | What it does |
|---|---|
| `isDemoAccount()` in `firestore.rules` | Refuses the writes. This is the control. |
| `NEXT_PUBLIC_DEMO_EMAIL` | Lets the interface stop offering what the rules will refuse, and fills the address shown on the sign-in screen. |

**They must name the same account.** If they drift, the app offers actions the database then
rejects, which is the exact failure the arrangement exists to prevent. `NEXT_PUBLIC_DEMO_EMAIL`
defaults to `admin@example.com` — the address the sign-in screen has always shown — so a deployment
that never sets it is still correct.

### 7.3 Deploy order, which matters

Once the rules are deployed, **nobody can write to the demo account any more, including you**: there
is no admin path in this project. So if you want to put sample data in it, do that first.

1. Sign in as the demo account and create whatever should be on display, **or** write it from the
   Firebase console.
2. `firebase deploy --only firestore:rules`.
3. Verify: sign in as the demo account and confirm the band appears and the write controls are gone.

To change that data afterwards, use the Firebase console, or temporarily point `isDemoAccount()` at
a different address, deploy, edit, and put it back.

### 7.4 Filling it: `scripts/seed-demo.mjs`

Read-only freezes whatever is there. An empty demo account shows empty screens, and Timeline, Report
and Insights have nothing to say without work logs — which is most of what distinguishes this app.

```bash
node scripts/seed-demo.mjs --yes --replace
```

It signs in with the demo credentials and writes a full diary: all four task statuses, all three
priorities and none, one task overdue and one due today, a task with no steps beside one nested
three levels deep, steps with their own due dates, start/stop sessions and hand-written notes, notes
carrying a duration, time attached to specific steps, and six months of history so the trend chart
and the month-over-month comparison have something to compare. Everything is generated relative to
today, from a fixed seed, so two runs produce the same demo — and so it ages: re-run it when the
demo starts looking like a museum.

`--yes` is required and there is no npm alias: it writes to production. `--replace` empties the
account first. Add `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` with `DEMO_EMAIL`/`DEMO_PASSWORD` to
rehearse it against the emulators, which is worth doing before pointing it at a real project.

### 7.5 Verifying, without breaking anything

A ruleset does not take effect everywhere the moment `firebase deploy` returns: for a while
afterwards, consecutive requests can be evaluated against different rulesets. So a single pass
proves nothing, and **a deny rule must never be verified with a destructive operation** — a
`delete` that lands on the old ruleset really deletes.

Probe with an `update` that touches only `updatedAt`, and repeat until the answer is stable. A
refused update leaves the document exactly as it was.

---

## 8. Troubleshooting

### Firebase Authentication Errors

#### Error: `Firebase: Error (auth/invalid-api-key)`
**Cause**: Your API key is incorrect or missing.
**Solution**: Double-check `NEXT_PUBLIC_FIREBASE_API_KEY` in your `.env` file against the value in Firebase Console.

#### Error: `Firebase: Error (auth/project-not-found)`
**Cause**: Your project ID doesn't match.
**Solution**: Verify `NEXT_PUBLIC_FIREBASE_PROJECT_ID` matches your Firebase project ID exactly.

#### Error: `Firebase: Error (auth/operation-not-allowed)`
**Cause**: Email/Password authentication is not enabled.
**Solution**: Go to Firebase Console > Authentication > Sign-in method and enable Email/Password.

---

### Firestore Permission Denied Errors

#### Error: `Missing or insufficient permissions`
**Causes**:
1. Firestore security rules are not deployed
2. You're not signed in
3. Rules are in "Locked mode"

**Solutions**:
1. Deploy rules: `firebase deploy --only firestore:rules`
2. Make sure you're signed in to the app
3. Check Firebase Console > Firestore Database > Rules. If you see only deny rules, switch to production mode and deploy your rules

---

### Module Not Found Errors

#### Error: `Cannot find module '...'` or `Module not found`
**Cause**: Dependencies are corrupted or not fully installed.
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

On Windows PowerShell:
```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

---

### Port Already in Use

#### Error: `Port 3000 is already in use`
**Cause**: Another application is using port 3000.
**Solution**: Use a different port:

```bash
PORT=3001 npm run dev
```

On Windows:
```cmd
set PORT=3001 && npm run dev
```

Or stop the other application using port 3000.

---

### Changes Not Appearing in Browser

**Symptoms**: You make code changes, but they don't show up in the browser.

**Solutions**:
1. **Hard refresh**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. **Clear browser cache**: Go to DevTools (F12) > Network tab > Check "Disable cache"
3. **Restart dev server**: Stop the server (`Ctrl+C`) and run `npm run dev` again
4. **Clear Next.js cache**:
   ```bash
   rm -rf .next
   npm run dev
   ```

---

### Firebase CLI Issues

#### Error: `firebase: command not found`
**Cause**: Firebase CLI is not installed or not in PATH.
**Solution**:
```bash
npm install -g firebase-tools
```

If that doesn't work, try:
```bash
npx firebase-tools --version
```

And use `npx firebase-tools` instead of `firebase` for all commands.

---

## Next Steps

- **Explore the app**: Create some tasks, steps, and work logs to understand the workflow
- **Read technical docs**: See [CLAUDE.md](./CLAUDE.md) for detailed architecture information
- **Report issues**: Found a bug? [Open an issue on GitHub](https://github.com/[username]/chronostep/issues)
- **Customize**: Check out the codebase structure and start building features!

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Need help?** Open an issue on the [GitHub repository](https://github.com/[username]/chronostep/issues) with details about your problem, and we'll assist you!
