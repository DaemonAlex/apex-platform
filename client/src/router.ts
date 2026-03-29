import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/rooms',
    },
    {
      path: '/rooms',
      component: () => import('./views/RoomStatus.vue'),
    },
    {
      path: '/rooms/locations',
      component: () => import('./views/LocationManager.vue'),
    },
    // Future routes as sections are migrated:
    // { path: '/dashboard', component: () => import('./views/Dashboard.vue') },
    // { path: '/projects', component: () => import('./views/Projects.vue') },
    // { path: '/reports', component: () => import('./views/Reports.vue') },
  ],
});

export default router;
