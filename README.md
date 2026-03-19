# Online Tic‑Tac‑Toe (GitHub Pages)

A clean, modern **tic‑tac‑toe website** that supports:

- **Online multiplayer (real-time)** via **Firebase Realtime Database**
- **Local mode** (same device) if Firebase isn’t configured

## Files

- `index.html` – UI
- `styles.css` – styling
- `app.js` – game logic + Firebase sync

## Run locally (no install)

Open `index.html` in a browser.

If you want the Firebase online mode to work reliably, use a local web server (recommended):

```powershell
cd "C:\Users\Parv Mishra\Documents\GitHub\online-tic-tac-toe"
python -m http.server 5173
```

Then open `http://localhost:5173`.

## Enable Online Multiplayer (Firebase)

### 1) Create Firebase project

- Go to Firebase Console
- Create a project

### 2) Enable Anonymous Auth

- **Authentication** → **Sign-in method** → enable **Anonymous**

### 3) Create Realtime Database

- **Realtime Database** → Create database
- For a quick demo, you can start in **Test mode** (not recommended for production)

### 4) Paste config

Open `app.js` and fill `FIREBASE_CONFIG`:

```js
const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  appId: "...",
};
```

### 5) Add GitHub Pages domain to Firebase Auth (important)

In Firebase Console:

- **Authentication** → **Settings** → **Authorized domains**
- Add:
  - `YOUR_USERNAME.github.io`

If you’re using a project site (repo Pages), it’s still under the same domain.

## Deploy to GitHub Pages

1) Create a new GitHub repository (example: `online-tic-tac-toe`)
2) Commit/push these files to the repo root
3) In GitHub:
   - **Settings** → **Pages**
   - **Build and deployment**
   - Select: **Deploy from a branch**
   - Branch: `main` / folder: `/ (root)`
4) Wait for the Pages URL, then open it.

## How to play

- Click **Create** to generate a room.
- Share the **room code** (or **Copy invite**) with a friend.
- Friend uses **Join** or opens the invite link.

## Notes

- This is a simple demo; for a public production app you should add proper database security rules.
