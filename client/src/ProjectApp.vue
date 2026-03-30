<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { NMessageProvider, NConfigProvider } from 'naive-ui';
import ProjectList from './views/ProjectList.vue';
import ProjectDetail from './views/ProjectDetail.vue';
import { useTheme } from './composables/useTheme';

const props = defineProps<{ userName?: string }>();

const currentView = ref<'list' | 'detail'>('list');
const selectedProjectId = ref<string | null>(null);
const { naiveTheme, themeOverrides } = useTheme();

function openProject(id: string) {
  selectedProjectId.value = id;
  currentView.value = 'detail';
}

function backToList() {
  currentView.value = 'list';
  selectedProjectId.value = null;
}

// Listen for cross-app navigation from Dashboard
function handleOpenProject(e: Event) {
  const id = (e as CustomEvent).detail?.id;
  if (id) openProject(id);
}
onMounted(() => window.addEventListener('apex-open-project', handleOpenProject));
onUnmounted(() => window.removeEventListener('apex-open-project', handleOpenProject));
</script>

<template>
  <NMessageProvider>
    <NConfigProvider
      :theme="naiveTheme"
      :theme-overrides="themeOverrides"
    >
      <div style="background: transparent;">
        <ProjectList v-if="currentView === 'list'" :user-name="props.userName" @open-project="openProject" />
        <ProjectDetail v-else-if="currentView === 'detail' && selectedProjectId" :project-id="selectedProjectId" @back="backToList" />
      </div>
    </NConfigProvider>
  </NMessageProvider>
</template>
