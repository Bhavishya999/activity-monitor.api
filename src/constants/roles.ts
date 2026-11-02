export const ROLES = { DEVELOPER: "DEVELOPER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const SESSION_COOKIE = "gam_session";
export const CSRF_HEADER = "x-csrf-token";
