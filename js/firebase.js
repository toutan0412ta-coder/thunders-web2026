/* ══════════════════════════════════════════════════
   firebase.js
══════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            "AIzaSyDyHEv72GDqgSba2KFgM-x550dHRT6FGgM",
  authDomain:        "thunders-web.firebaseapp.com",
  projectId:         "thunders-web",
  storageBucket:     "thunders-web.firebasestorage.app",
  messagingSenderId: "792066557837",
  appId:             "1:792066557837:web:eb84212de79133a0129fc4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ── 汎用（matches / stats / players） ── */
async function fbLoad(docName) {
  const snap = await db.collection("data").doc(docName).get();
  if (!snap.exists) return [];
  const d = snap.data();
  return Array.isArray(d.items) ? d.items : [];
}

async function fbSave(docName, arr) {
  await db.collection("data").doc(docName).set({ items: arr });
}

function fbWatch(docName, callback) {
  return db.collection("data").doc(docName).onSnapshot(snap => {
    if (snap.exists) {
      const d = snap.data();
      callback(Array.isArray(d.items) ? d.items : []);
    }
  });
}

/* ── 用語集専用 ── */
async function fbLoadGlossary() {
  try {
    const snap = await db.collection("data").doc("glossary").get();
    if (!snap.exists) return [];
    const d = snap.data();
    if (Array.isArray(d.items) && d.items.length > 0) return d.items;
    return [];
  } catch (e) {
    console.error("fbLoadGlossary error:", e);
    return [];
  }
}

async function fbSaveGlossary(arr) {
  await db.collection("data").doc("glossary").set({ items: arr });
}

function fbWatchGlossary(callback) {
  return db.collection("data").doc("glossary").onSnapshot(snap => {
    if (!snap.exists) { callback([]); return; }
    const d = snap.data();
    callback(Array.isArray(d.items) ? d.items : []);
  });
}
