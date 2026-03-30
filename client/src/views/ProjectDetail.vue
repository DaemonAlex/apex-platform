<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  NTabs, NTabPane, NTag, NProgress, NButton, NSpin, NSpace, NEmpty,
} from 'naive-ui';
import { apiFetch } from '../composables/useApi';
import OverviewTab from '../components/projects/OverviewTab.vue';
import TasksTab from '../components/projects/TasksTab.vue';
import PeopleTab from '../components/projects/PeopleTab.vue';
import NotesTab from '../components/projects/NotesTab.vue';
import MeetingsTab from '../components/projects/MeetingsTab.vue';
import DocsTab from '../components/projects/DocsTab.vue';
import VendorsTab from '../components/projects/VendorsTab.vue';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'back'): void }>();

const project = ref<any>(null);
const loading = ref(true);

async function loadProject() {
  loading.value = true;
  try {
    const data = await apiFetch('/projects/' + props.projectId);
    // API returns project directly or wrapped
    project.value = data.project || data;
    // Parse tasks if string
    if (typeof project.value.tasks === 'string') {
      project.value.tasks = JSON.parse(project.value.tasks);
    }
  } catch (e) {
    console.error('Failed to load project:', e);
  } finally {
    loading.value = false;
  }
}

const statusType = computed(() => {
  const map: Record<string, string> = { active: 'success', completed: 'success', planning: 'info', scheduled: 'info', 'on-hold': 'warning', cancelled: 'default' };
  return (map[project.value?.status] || 'default') as any;
});

onMounted(loadProject);
</script>

<template>
  <div>
    <!-- Back button -->
    <NButton text @click="emit('back')" style="margin-bottom: 12px; color: #64748b;">
      <i class="ph ph-arrow-left" style="margin-right: 4px;" /> Back to Projects
    </NButton>

    <NSpin :show="loading">
      <template v-if="project">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; font-size: 1.4rem;">{{ project.name }}</h1>
            <div style="color: #64748b; margin-top: 4px; font-size: 0.9rem;">
              {{ project.siteLocation || project.sitelocation || '' }}
            </div>
          </div>
          <NSpace>
            <NTag :type="statusType" size="medium">{{ project.status }}</NTag>
            <NProgress type="circle" :percentage="project.progress || 0" :width="40" :stroke-width="4" />
          </NSpace>
        </div>

        <!-- Tabs -->
        <NTabs type="line" animated>
          <NTabPane name="overview" tab="Overview">
            <OverviewTab :project="project" />
          </NTabPane>
          <NTabPane name="tasks" :tab="'Tasks (' + (project.tasks?.length || 0) + ')'">
            <TasksTab :project-id="projectId" :tasks="project.tasks || []" @refresh="loadProject" />
          </NTabPane>
          <NTabPane name="people" tab="People">
            <PeopleTab :project-id="projectId" />
          </NTabPane>
          <NTabPane name="notes" tab="Notes">
            <NotesTab :project-id="projectId" />
          </NTabPane>
          <NTabPane name="meetings" tab="Meetings">
            <MeetingsTab :project-id="projectId" />
          </NTabPane>
          <NTabPane name="docs" tab="Docs">
            <DocsTab :project-id="projectId" />
          </NTabPane>
          <NTabPane name="vendors" tab="Vendors">
            <VendorsTab entity-type="project" :entity-id="projectId" />
          </NTabPane>
        </NTabs>
      </template>
      <NEmpty v-else-if="!loading" description="Project not found" />
    </NSpin>
  </div>
</template>
