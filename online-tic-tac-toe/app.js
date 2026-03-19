// Online Tic‑Tac‑Toe (Firebase RTDB) + local fallback
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  runTransaction,
  onDisconnect,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// 1) Create a Firebase project, then paste your config here.
// 2) Enable: Authentication → Sign-in method → Anonymous
// 3) Create a Realtime Database (test mode is fine for demos)
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDNW4HjAY_Ded2C8npLfrY2rw32GfW5Mcw",
  authDomain: "tiktaktoe-e643e.firebaseapp.com",
  databaseURL: "https://tiktaktoe-e643e-default-rtdb.firebaseio.com",
  projectId: "tiktaktoe-e643e",
  storageBucket: "tiktaktoe-e643e.firebasestorage.app",
  messagingSenderId: "555487160813",
  appId: "1:555487160813:web:624f6f504c653064031fe4",
  measurementId: "G-SER1NNCTBL"
};

const el = (id) => document.getElementById(id);
const setupCard = el("setupCard");
const gameCard = el("gameCard");
const statusText = el("statusText");
const roomMeta = el("roomMeta");
const footNote = el("footNote");
const boardEl = el("board");
const connDot = el("connDot");
const connText = el("connText");

const createRoomBtn = el("createRoomBtn");
const joinRoomBtn = el("joinRoomBtn");
const roomCodeInput = el("roomCodeInput");
const localBtn = el("localBtn");
const resetBtn = el("resetBtn");
const leaveBtn = el("leaveBtn");
const copyInviteBtn = el("copyInviteBtn");

const dialog = el("dialog");
const dialogTitle = el("dialogTitle");
const dialogText = el("dialogText");

const cells = Array.from(boardEl.querySelectorAll(".cell"));

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function showDialog(title, text) {
  dialogTitle.textContent = title;
  dialogText.textContent = text;
  dialog.showModal();
}

function isFirebaseConfigured() {
  return (
    FIREBASE_CONFIG &&
    typeof FIREBASE_CONFIG === "object" &&
    !!FIREBASE_CONFIG.apiKey &&
    !!FIREBASE_CONFIG.projectId &&
    !!FIREBASE_CONFIG.appId &&
    !!FIREBASE_CONFIG.databaseURL
  );
}

function normalizeCode(input) {
  return (input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function newRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function computeWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { mark: board[a], line };
    }
  }
  if (board.every((v) => v)) return { mark: "draw", line: null };
  return null;
}

function setConnState(kind) {
  const map = {
    offline: { text: "Offline", color: "rgba(255,255,255,0.35)" },
    local: { text: "Local", color: "rgba(255,255,255,0.55)" },
    connecting: { text: "Connecting…", color: "rgba(124,92,255,0.95)" },
    online: { text: "Online", color: "rgba(46,229,157,0.95)" },
  };
  const s = map[kind] || map.offline;
  connText.textContent = s.text;
  connDot.style.background = s.color;
  connDot.style.boxShadow = `0 0 0 4px rgba(255,255,255,0.08), 0 0 18px ${s.color}`;
}

function renderBoard(board, disabled, winLine) {
  cells.forEach((btn, i) => {
    const v = board[i] || "";
    btn.textContent = v;
    btn.disabled = disabled || !!v;
    btn.classList.toggle("x", v === "X");
    btn.classList.toggle("o", v === "O");
    btn.classList.toggle("win", !!winLine && winLine.includes(i));
  });
}

function showSetup() {
  setupCard.classList.remove("hidden");
  gameCard.classList.add("hidden");
}

function showGame() {
  setupCard.classList.add("hidden");
  gameCard.classList.remove("hidden");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// -------------------- Local mode --------------------
let local = null;

function startLocalGame() {
  local = {
    mode: "local",
    board: Array(9).fill(""),
    turn: "X",
    winner: null,
    winLine: null,
  };
  setConnState("local");
  roomMeta.textContent = "Local game";
  statusText.textContent = "Local: X to move";
  footNote.textContent = "Tip: Use Create/Join for real-time online play (requires Firebase setup).";
  renderBoard(local.board, false, null);
  showGame();
}

function localClick(i) {
  if (!local || local.winner || local.board[i]) return;
  local.board[i] = local.turn;
  const w = computeWinner(local.board);
  if (w) {
    local.winner = w.mark;
    local.winLine = w.line;
  } else {
    local.turn = local.turn === "X" ? "O" : "X";
  }
  const done = !!local.winner;
  renderBoard(local.board, done, local.winLine);
  if (local.winner === "draw") statusText.textContent = "Local: Draw";
  else if (local.winner) statusText.textContent = `Local: ${local.winner} wins`;
  else statusText.textContent = `Local: ${local.turn} to move`;
}

// -------------------- Online mode --------------------
let firebase = null; // { app, db, auth, uid }
let online = null; // { roomId, myMark, unsub, roomRef }

function getInvite(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

function defaultRoomState(roomId) {
  return {
    roomId,
    board: Array(9).fill(""),
    turn: "X",
    winner: null, // "X" | "O" | "draw" | null
    winLine: null, // [a,b,c] | null
    players: { X: null, O: null },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function onlineStatusFromState(state, myMark) {
  if (!state) return "Loading…";
  if (state.winner === "draw") return "Draw";
  if (state.winner === "X" || state.winner === "O") return `${state.winner} wins`;
  const turn = state.turn || "X";
  if (!myMark) return `${turn} to move`;
  if (turn === myMark) return `Your turn (${myMark})`;
  return `Opponent’s turn (${turn})`;
}

function setOnlineNote(state, myMark) {
  const x = state?.players?.X ? "X: joined" : "X: empty";
  const o = state?.players?.O ? "O: joined" : "O: empty";
  const you = myMark ? `You are ${myMark}.` : "Spectating.";
  footNote.textContent = `${you} Players — ${x}, ${o}.`;
}

function updateOnlineUI(state, myMark) {
  const status = onlineStatusFromState(state, myMark);
  statusText.textContent = status;
  const roomId = state?.roomId || online?.roomId || "";
  roomMeta.textContent = roomId ? `Room: ${roomId}` : "";

  const w = state?.winner ? { mark: state.winner, line: state.winLine || null } : computeWinner(state?.board || Array(9).fill(""));
  const done = !!(state?.winner || (w && w.mark));
  const turn = state?.turn || "X";
  const allowMove = !!myMark && !done && turn === myMark;

  renderBoard(state?.board || Array(9).fill(""), !allowMove, w?.line || null);
  setOnlineNote(state, myMark);
}

async function ensureFirebase() {
  if (firebase) return firebase;
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");

  setConnState("connecting");
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);
  const auth = getAuth(app);

  await signInAnonymously(auth);

  const uid = await new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        if (u) {
          unsub();
          resolve(u.uid);
        }
      },
      reject
    );
    setTimeout(() => reject(new Error("Auth timeout")), 12000);
  });

  firebase = { app, db, auth, uid };
  setConnState("online");
  return firebase;
}

async function leaveOnlineRoom() {
  if (!online || !firebase) return;
  const { roomRef, myMark, roomId } = online;
  try {
    if (myMark === "X" || myMark === "O") {
      await update(roomRef, { [`players/${myMark}`]: null, updatedAt: serverTimestamp() });
    }
  } catch {
    // ignore
  }
  online.unsub?.();
  online = null;
  roomMeta.textContent = "";
}

async function attachRoom(roomId, myMark) {
  const { db, uid } = await ensureFirebase();
  const roomRef = ref(db, `rooms/${roomId}`);

  // keep slot tidy if tab closes (best-effort)
  if (myMark === "X" || myMark === "O") {
    try {
      onDisconnect(ref(db, `rooms/${roomId}/players/${myMark}`)).set(null);
    } catch {
      // ignore
    }
  }

  const unsub = onValue(roomRef, (snap) => {
    const state = snap.val();
    updateOnlineUI(state, myMark);
  });

  online = { roomId, myMark, unsub, roomRef, uid };
  showGame();
}

async function createRoom() {
  const roomId = newRoomCode();
  const { db, uid } = await ensureFirebase();
  const roomRef = ref(db, `rooms/${roomId}`);
  const state = defaultRoomState(roomId);
  state.players.X = uid;
  await set(roomRef, state);
  await attachRoom(roomId, "X");
  history.replaceState(null, "", getInvite(roomId));
  showDialog("Room created", `Share this code with a friend: ${roomId}`);
}

async function joinRoom(roomId) {
  roomId = normalizeCode(roomId);
  if (!roomId) {
    showDialog("Missing code", "Enter a room code to join.");
    return;
  }

  const { db, uid } = await ensureFirebase();
  const roomRef = ref(db, `rooms/${roomId}`);

  const result = await runTransaction(roomRef, (current) => {
    if (current === null) return; // abort (room does not exist)
    const players = current.players || { X: null, O: null };

    // re-join if already in room
    if (players.X === uid) return current;
    if (players.O === uid) return current;

    // claim empty slot if possible
    if (!players.X) {
      players.X = uid;
      return { ...current, players, updatedAt: serverTimestamp() };
    }
    if (!players.O) {
      players.O = uid;
      return { ...current, players, updatedAt: serverTimestamp() };
    }

    // both slots full → spectator
    return current;
  });

  if (!result.committed || !result.snapshot.exists()) {
    showDialog("Room not found", `No room exists with code ${roomId}. Ask your friend to create one.`);
    return;
  }

  const state = result.snapshot.val();
  let myMark = null;
  if (state?.players?.X === uid) myMark = "X";
  else if (state?.players?.O === uid) myMark = "O";
  await attachRoom(roomId, myMark);
  history.replaceState(null, "", getInvite(roomId));
}

async function onlineClick(i) {
  if (!online || !firebase) return;
  const { roomRef, myMark } = online;
  if (!myMark) return;

  await runTransaction(roomRef, (current) => {
    if (!current) return current;
    const board = Array.isArray(current.board) ? current.board.slice(0, 9) : Array(9).fill("");
    const turn = current.turn || "X";
    if (current.winner) return current;
    if (turn !== myMark) return current;
    if (board[i]) return current;

    board[i] = myMark;
    const w = computeWinner(board);
    const nextTurn = myMark === "X" ? "O" : "X";

    return {
      ...current,
      board,
      turn: w ? turn : nextTurn,
      winner: w ? w.mark : null,
      winLine: w ? w.line : null,
      updatedAt: serverTimestamp(),
    };
  });
}

async function resetOnlineRoom() {
  if (!online || !firebase) return;
  const { roomRef } = online;
  await update(roomRef, {
    board: Array(9).fill(""),
    turn: "X",
    winner: null,
    winLine: null,
    updatedAt: serverTimestamp(),
  });
}

// -------------------- Wire up UI --------------------
cells.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const i = Number(btn.dataset.i);
    if (Number.isNaN(i)) return;
    if (local?.mode === "local") localClick(i);
    else await onlineClick(i);
  });
});

createRoomBtn.addEventListener("click", async () => {
  local = null;
  try {
    await createRoom();
  } catch (e) {
    setConnState("offline");
    showDialog(
      "Firebase not configured",
      "To play online, add your Firebase config in app.js (FIREBASE_CONFIG). For now, use Local mode."
    );
  }
});

joinRoomBtn.addEventListener("click", async () => {
  local = null;
  const code = normalizeCode(roomCodeInput.value);
  roomCodeInput.value = code;
  try {
    await joinRoom(code);
  } catch {
    setConnState("offline");
    showDialog(
      "Firebase not configured",
      "To play online, add your Firebase config in app.js (FIREBASE_CONFIG). For now, use Local mode."
    );
  }
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = normalizeCode(roomCodeInput.value);
});

localBtn.addEventListener("click", async () => {
  await leaveOnlineRoom();
  local = null;
  startLocalGame();
});

resetBtn.addEventListener("click", async () => {
  if (local?.mode === "local") {
    startLocalGame();
    return;
  }
  await resetOnlineRoom();
});

leaveBtn.addEventListener("click", async () => {
  await leaveOnlineRoom();
  local = null;
  setConnState(isFirebaseConfigured() ? "online" : "offline");
  history.replaceState(null, "", window.location.pathname);
  showSetup();
});

copyInviteBtn.addEventListener("click", async () => {
  if (local?.mode === "local") {
    showDialog("Local game", "Invites are only for online rooms.");
    return;
  }
  const roomId = online?.roomId;
  if (!roomId) return;
  const invite = getInvite(roomId);
  const ok = await copyText(invite);
  showDialog(ok ? "Copied" : "Copy failed", ok ? "Invite link copied to clipboard." : invite);
});

// -------------------- Auto-join via URL --------------------
(async function boot() {
  showSetup();
  setConnState(isFirebaseConfigured() ? "connecting" : "offline");

  const url = new URL(window.location.href);
  const room = normalizeCode(url.searchParams.get("room"));
  if (room) {
    local = null;
    try {
      await joinRoom(room);
      return;
    } catch {
      setConnState("offline");
      showDialog(
        "Online join unavailable",
        "Couldn’t join online (Firebase not configured or blocked). You can still play locally."
      );
    }
  }

  if (isFirebaseConfigured()) {
    try {
      await ensureFirebase();
    } catch {
      setConnState("offline");
    }
  }
})();

