#!/usr/bin/env bash
# Apunta la app al Supabase local (Docker) escribiendo .env.local.
# Expo carga .env.local por encima de .env, así que para volver a la nube
# alcanza con `npm run env:cloud` (borra .env.local).
#
# Uso:
#   npm run env:local                 # simulador iOS (127.0.0.1)
#   npm run env:local -- --device     # iPhone físico en la misma Wi-Fi (IP LAN del Mac)
#   npm run env:local -- --android    # emulador Android (10.0.2.2)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "✖ Docker no está corriendo. Abrí Docker Desktop u OrbStack y reintentá." >&2
  exit 1
fi

STATUS="$(npx supabase status -o env 2>/dev/null || true)"
if [[ -z "$STATUS" ]]; then
  echo "✖ Supabase local no está levantado. Corré: npm run db:start" >&2
  exit 1
fi

get() { printf '%s\n' "$STATUS" | grep -E "^$1=" | head -1 | cut -d= -f2- | tr -d '"'; }
KEY="$(get PUBLISHABLE_KEY)"; [[ -z "$KEY" ]] && KEY="$(get ANON_KEY)"
PORT="$(get API_URL | sed -E 's#.*:([0-9]+)/?$#\1#')"; PORT="${PORT:-54321}"

HOST="127.0.0.1"
case "${1:-}" in
  --device)  HOST="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
             [[ -z "$HOST" ]] && { echo "✖ No encontré la IP LAN del Mac." >&2; exit 1; } ;;
  --android) HOST="10.0.2.2" ;;
  "") ;;
  *) echo "Opción desconocida: $1" >&2; exit 1 ;;
esac

cat > .env.local <<ENV
# Generado por scripts/supabase-local-env.sh — Supabase local en Docker
EXPO_PUBLIC_SUPABASE_URL=http://$HOST:$PORT
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$KEY
ENV

echo "✔ .env.local → http://$HOST:$PORT"
echo "  Studio: http://127.0.0.1:54323"
echo "  Reiniciá Metro con caché limpia: npx expo start --dev-client -c"
