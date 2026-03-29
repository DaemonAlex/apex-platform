<script setup lang="ts">
import { ref } from 'vue';
import { NMessageProvider, NConfigProvider } from 'naive-ui';
import ProjectList from './views/ProjectList.vue';
import ProjectDetail from './views/ProjectDetail.vue';
import { useTheme } from './composables/useTheme';

defineProps<{ userName?: string }>();

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
</script>

<template>
  <NMessageProvider>
    <NConfigProvider
      :theme="naiveTheme"
      :theme-overrides="themeOverrides"
    >
      <div style="background: transparent;">
        <ProjectList v-if="currentView === 'list'" @open-project="openProject" />
        <ProjectDetail v-else-if="currentView === 'detail' && selectedProjectId" :project-id="selectedProjectId" @back="backToList" />
      </div>
    </NConfigProvider>
  </NMessageProvider>
</template>
