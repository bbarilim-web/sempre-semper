// ═══════════════════════════════════════════════════════════════════════
//  FIREBASE HOOKS — replaces window.storage
//  Real-time Firestore sync + Google Auth
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import {
  doc, collection, onSnapshot,
  setDoc, deleteDoc, serverTimestamp,
  getDocs, writeBatch,
} from "firebase/firestore";
import {
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
} from "firebase/auth";
import { db, auth, provider } from "./firebase";

// ── Collections ──────────────────────────────────────────────────────
const COL = {
  schedules: "schedules",
  pinnwand:  "pinnwand",
  settings:  "settings",   // per-user doc: settings/{uid}
  users:     "users",      // user profiles: users/{uid}
};

// ═══════════════════════════════════════════════════════════════════════
//  AUTH HOOK
// ═══════════════════════════════════════════════════════════════════════
export function useAuth() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = loading
  const [profile,  setProfile]  = useState(undefined); // undefined = loading

  useEffect(() => {
    let profileUnsub = null;

    const unsub = onAuthStateChanged(auth, (u) => {
      console.log("[Auth] onAuthStateChanged:", u ? u.email : "null");
      setAuthUser(u ?? null);

      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (u) {
        profileUnsub = onSnapshot(doc(db, COL.users, u.uid), snap => {
          console.log("[Auth] profile snap exists:", snap.exists(), snap.data());
          setProfile(snap.exists() ? { id: u.uid, ...snap.data() } : null);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login error:", e.code, e.message);
      throw e;
    }
  };

  const logout = () => signOut(auth);

  const saveProfile = async (uid, data) => {
    await setDoc(doc(db, COL.users, uid), data, { merge: true });
  };

  return { authUser, profile, loginWithGoogle, logout, saveProfile };
}

// ═══════════════════════════════════════════════════════════════════════
//  SCHEDULES HOOK  — real-time
// ═══════════════════════════════════════════════════════════════════════
export function useSchedules(seedData, uid) {
  const [scheds, setScheds] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid) { setLoaded(false); return; }
    const unsub = onSnapshot(collection(db, COL.schedules), async snap => {
      if (snap.empty && seedData?.length) {
        const batch = writeBatch(db);
        seedData.forEach(e => {
          batch.set(doc(db, COL.schedules, e.id), e);
        });
        await batch.commit();
      } else {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        setScheds(data);
        setLoaded(true);
      }
    });
    return unsub;
  }, [uid]);

  const saveEvent = async (event) => {
    await setDoc(doc(db, COL.schedules, event.id), {
      ...event,
      updatedAt: Date.now(),
      _edited: true,
    }, { merge: true });
  };

  const deleteEvent = async (id) => {
    await deleteDoc(doc(db, COL.schedules, id));
  };

  const saveAllScheds = async (events) => {
    const batch = writeBatch(db);
    events.forEach(e => batch.set(doc(db, COL.schedules, e.id), e));
    await batch.commit();
  };

  return { scheds, loaded, saveEvent, deleteEvent, saveAllScheds };
}

// ═══════════════════════════════════════════════════════════════════════
//  PINNWAND HOOK  — real-time
// ═══════════════════════════════════════════════════════════════════════
export function usePinnwand(seedData, uid) {
  const [pinnwand, setPinnwand] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, COL.pinnwand), async snap => {
      if (snap.empty && seedData?.length) {
        const batch = writeBatch(db);
        seedData.forEach(p => batch.set(doc(db, COL.pinnwand, p.id), p));
        await batch.commit();
      } else {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        setPinnwand(data);
      }
    });
    return unsub;
  }, [uid]);

  const savePost = async (post) => {
    await setDoc(doc(db, COL.pinnwand, post.id), post);
  };

  const deletePost = async (id) => {
    await deleteDoc(doc(db, COL.pinnwand, id));
  };

  const updatePost = async (id, changes) => {
    await setDoc(doc(db, COL.pinnwand, id), changes, { merge: true });
  };

  return { pinnwand, savePost, deletePost, updatePost };
}

// ═══════════════════════════════════════════════════════════════════════
//  SETTINGS HOOK  — per user
// ═══════════════════════════════════════════════════════════════════════
export function useSettings(uid) {
  const [settings, setSettings] = useState({ defaultView: "woche" });

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, COL.settings, uid), snap => {
      if (snap.exists()) setSettings(snap.data());
    });
    return unsub;
  }, [uid]);

  const saveSettings = async (data) => {
    if (!uid) return;
    setSettings(data);
    await setDoc(doc(db, COL.settings, uid), data);
  };

  return { settings, saveSettings };
}

// ═══════════════════════════════════════════════════════════════════════
//  COMBINED HOOK — useFirebase()
// ═══════════════════════════════════════════════════════════════════════
export function useFirebase() {
  const { authUser, profile, loginWithGoogle, logout, saveProfile } = useAuth();
  const uid = authUser?.uid ?? null;
  const { scheds, saveAllScheds } = useSchedules([], uid);
  const { pinnwand, savePost, deletePost, updatePost } = usePinnwand([], uid);
  const { settings, saveSettings } = useSettings(uid);

  const loading = authUser === undefined || (authUser !== null && profile === undefined);

  return {
    user: authUser,
    profile,
    loading,
    loginWithGoogle,
    logout,
    saveProfile,
    scheds,
    saveScheds: saveAllScheds,
    pinnwand,
    savePinnwand: (arr) => arr.forEach(p => savePost(p)),
    settings,
    saveSettings,
  };
}
