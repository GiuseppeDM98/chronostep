# ChronoStep Setup Guide

Complete guide to setting up ChronoStep for local development.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Firebase Project Setup](#firebase-project-setup)
3. [Local Development Setup](#local-development-setup)
4. [Firestore Security Rules Deployment](#firestore-security-rules-deployment)
5. [Running the Application](#running-the-application)
6. [Troubleshooting](#troubleshooting)

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

## 6. Troubleshooting

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
