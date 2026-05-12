/** sessionStorage key for demo destructive SQL role (not real auth). */
export const DEMO_ROLE_STORAGE_KEY = 'queryweaver_demo_role';

export type DemoRole = 'admin' | 'viewer';

export function getOrInitDemoRole(): DemoRole {
  if (typeof window === 'undefined') {
    return 'admin';
  }
  const raw = sessionStorage.getItem(DEMO_ROLE_STORAGE_KEY);
  if (raw === 'admin' || raw === 'viewer') {
    return raw;
  }
  const role: DemoRole = Math.random() < 0.5 ? 'admin' : 'viewer';
  sessionStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
  return role;
}

export function setDemoRole(role: DemoRole): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
}
