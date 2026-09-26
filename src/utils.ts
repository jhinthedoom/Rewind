import { auth } from './firebase';
import { OperationType, FirestoreErrorInfo } from './types';

const errorListeners = new Set<(error: FirestoreErrorInfo) => void>();

export function subscribeToFirestoreErrors(listener: (error: FirestoreErrorInfo) => void) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Distribute error to registered UI listeners
  errorListeners.forEach(listener => listener(errInfo));
  
  throw new Error(JSON.stringify(errInfo));
}

