// Stockage en mémoire du JWT access token.
// Intentionnellement hors du localStorage/sessionStorage pour limiter la surface XSS.
// Le token est perdu au rechargement de page → AuthProvider le restaure via le cookie refreshToken.

let _token: string | null = null;

export const tokenStore = {
  get: () => _token,
  set: (token: string | null) => {
    _token = token;
  },
};
