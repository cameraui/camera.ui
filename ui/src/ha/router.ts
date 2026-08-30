import { createMemoryHistory, createRouter } from 'vue-router';

import type { Router } from 'vue-router';

export function createHaRouter(onNavigate: (path: string) => void): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  router.beforeEach((to, from) => {
    if (from.matched.length === 0) return true;
    onNavigate(to.fullPath);
    return false;
  });
  return router;
}
