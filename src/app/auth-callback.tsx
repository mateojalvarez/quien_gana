import { Redirect } from 'expo-router';

/**
 * En Android el redirect OAuth (quiengana://auth-callback) puede abrir la app
 * por deep link además de resolver openAuthSessionAsync. Esta ruta lo absorbe.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
