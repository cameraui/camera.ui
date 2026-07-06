import type { DBRoles } from '@shared/types';
import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router';

const ROLE_LEVEL: Record<string, number> = {
  user: 0,
  admin: 1,
  master: 2,
};

function hasMinRole(userRole: DBRoles, requiredRole: DBRoles): boolean {
  return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[requiredRole] ?? 0);
}

export function hasPermission(route?: RouteRecordRaw | RouteLocationNormalizedLoaded, role?: DBRoles, explizit?: boolean): boolean {
  const { user } = storeToRefs(useAuthStore());
  const userRole = (user.value?.role ?? 'user') as DBRoles;

  // Role-only check (no route context needed)
  if (role && !route) {
    return explizit ? userRole === role : hasMinRole(userRole, role);
  }

  route = route ?? useRoute();

  const noAuthRequired = !route?.meta?.auth || route?.meta?.auth.requiresAuth === false;
  const requiredRole = role ?? route.meta?.auth?.role ?? 'user';

  if (noAuthRequired || requiredRole === 'none') {
    return true;
  }

  return explizit ? userRole === requiredRole : hasMinRole(userRole, requiredRole);
}
