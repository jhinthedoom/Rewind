import { 
  getFirestore, 
  getAuth, 
  getStorage, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from './firebase-mock';

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();

export async function signIn(email: string, pass: string) {
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

export async function signUp(email: string, pass: string) {
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
}

export async function logOut() {
  await signOut(auth);
}

export let connectionErrorState: string | null = null;
const connectionErrorListeners = new Set<(error: string | null) => void>();

export function subscribeToConnectionError(listener: (error: string | null) => void) {
  connectionErrorListeners.add(listener);
  listener(connectionErrorState);
  return () => {
    connectionErrorListeners.delete(listener);
  };
}
