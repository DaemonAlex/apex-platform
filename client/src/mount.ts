import { createApp } from 'vue';
import { createPinia } from 'pinia';
import naive from 'naive-ui';
import RoomApp from './RoomApp.vue';
import ProjectApp from './ProjectApp.vue';
import ReportsApp from './ReportsApp.vue';
import FieldOpsApp from './FieldOpsApp.vue';
import DashboardApp from './DashboardApp.vue';
import AdminApp from './AdminApp.vue';
import ProfileApp from './ProfileApp.vue';
import { setToken } from './composables/useApi';

function createVueApp(component: any, el: string | HTMLElement, options: { token: string; userName?: string; props?: Record<string, any> }) {
  setToken(options.token);

  const app = createApp(component, { userName: options.userName || '', ...(options.props || {}) });
  app.use(createPinia());
  app.use(naive);

  const target = typeof el === 'string' ? document.querySelector(el) : el;
  if (target) {
    target.innerHTML = '';
    app.mount(target);
  }

  return { unmount: () => app.unmount() };
}

export function mountRooms(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(RoomApp, el, options);
}

export function mountProjects(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(ProjectApp, el, options);
}

export function mountReports(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(ReportsApp, el, options);
}

export function mountFieldOps(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(FieldOpsApp, el, options);
}

export function mountDashboard(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(DashboardApp, el, options);
}

export function mountAdmin(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(AdminApp, el, options);
}

export function mountProfile(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(ProfileApp, el, options);
}

// Expose globally for the monolith to call
(window as any).ApexRooms = { mount: mountRooms };
(window as any).ApexProjects = { mount: mountProjects };
(window as any).ApexReports = { mount: mountReports };
(window as any).ApexFieldOps = { mount: mountFieldOps };
(window as any).ApexDashboard = { mount: mountDashboard };
(window as any).ApexAdmin = { mount: mountAdmin };
(window as any).ApexProfile = { mount: mountProfile };
