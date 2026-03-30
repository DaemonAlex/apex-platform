import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../composables/useApi';

export interface ProjectSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: string;
  actualBudget: string;
  estimatedBudget: string;
  progress: number;
  priority: string;
  siteLocation: string;
  businessLine: string;
  dueDate: string | null;
  startDate: string | null;
  locationId: number | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const useProjectStore = defineStore('projects', () => {
  const projects = ref<ProjectSummary[]>([]);
  const pagination = ref<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const loading = ref(false);
  const filters = ref({
    search: '',
    status: null as string | null,
    type: null as string | null,
    businessLine: null as string | null,
  });
  const sort = ref({ field: 'created', order: 'desc' as 'asc' | 'desc' });

  async function fetchProjects(page = 1) {
    loading.value = true;
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.value.limit),
        summary: 'true',
        sort: sort.value.field,
        order: sort.value.order,
      });
      if (filters.value.search) params.set('search', filters.value.search);
      if (filters.value.status) params.set('status', filters.value.status);
      if (filters.value.type) params.set('type', filters.value.type);
      if (filters.value.businessLine) params.set('businessLine', filters.value.businessLine);

      const data = await apiFetch<{ projects: ProjectSummary[]; pagination: Pagination }>(
        '/projects?' + params.toString()
      );
      projects.value = data.projects;
      pagination.value = data.pagination;
    } finally {
      loading.value = false;
    }
  }

  async function fetchProject(id: string) {
    const data = await apiFetch<any>('/projects/' + id);
    return data;
  }

  async function createProject(payload: Record<string, any>) {
    await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
    await fetchProjects(1);
  }

  return { projects, pagination, loading, filters, sort, fetchProjects, fetchProject, createProject };
});
