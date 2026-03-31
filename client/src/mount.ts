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
import VendorsApp from './VendorsApp.vue';
import CiscoApp from './CiscoApp.vue';
import { setToken } from './composables/useApi';

function createVueApp(component: any, el: string | HTMLElement, options: { token: string; userName?: string; props?: Record<string, any> }) {
  const name = component.__name || component.name || 'unknown';
  console.log('[createVueApp] Component:', name, 'Target:', typeof el === 'string' ? el : (el as HTMLElement)?.id);
  setToken(options.token);

  const app = createApp(component, { userName: options.userName || '', ...(options.props || {}) });
  app.use(createPinia());
  app.use(naive);

  const target = typeof el === 'string' ? document.querySelector(el) : el;
  if (target) {
    target.innerHTML = '';
    app.mount(target);
    console.log('[createVueApp] Mounted', name, 'into', (target as HTMLElement).id);
  } else {
    console.error('[createVueApp] Target not found for', name);
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

export function mountVendors(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(VendorsApp, el, options);
}

export function mountCisco(el: string | HTMLElement, options: { token: string; userName?: string }) {
  return createVueApp(CiscoApp, el, options);
}

// Expose globally for the monolith to call
(window as any).ApexRooms = { mount: mountRooms };
(window as any).ApexProjects = { mount: mountProjects };
(window as any).ApexReports = { mount: mountReports };
(window as any).ApexFieldOps = { mount: mountFieldOps };
(window as any).ApexDashboard = { mount: mountDashboard };
(window as any).ApexAdmin = { mount: mountAdmin };
(window as any).ApexProfile = { mount: mountProfile };
(window as any).ApexVendors = { mount: mountVendors };
(window as any).ApexCisco = { mount: mountCisco };
