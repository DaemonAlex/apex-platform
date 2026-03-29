<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NCard, NEmpty, NSpace, NSpin } from 'naive-ui';
import { apiFetch } from '../../composables/useApi';

const props = defineProps<{ projectId: string }>();
const assignments = ref<any[]>([]);
const loading = ref(true);

const typeIcons: Record<string, string> = {
  internal: 'ph-user', vendor: 'ph-truck', gc: 'ph-hard-hat',
  architect: 'ph-compass-tool', oac_rep: 'ph-presentation-chart',
  consultant: 'ph-lightbulb', client: 'ph-buildings',
};

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch('/contacts/assignments/project/' + props.projectId);
    assignments.value = data.assignments || [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div style="padding-top: 16px;">
    <NSpin :show="loading">
      <div v-if="assignments.length > 0" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
        <NCard v-for="a in assignments" :key="a.id" size="small">
          <div style="display: flex; align-items: center; gap: 12px;">
            <i :class="'ph ' + (typeIcons[a.contactType] || 'ph-user')" style="font-size: 1.5rem; color: #0ea5e9;" />
            <div style="flex: 1;">
              <div style="font-weight: 500;">{{ a.contactName }}</div>
              <div style="font-size: 0.85rem; color: #64748b;">
                {{ a.role || a.contactType }}
                <span v-if="a.organization"> - {{ a.organization }}</span>
              </div>
              <NSpace size="small" style="margin-top: 6px;">
                <a v-if="a.email" :href="'mailto:' + a.email" style="color: #0ea5e9; font-size: 0.8rem;">
                  <i class="ph ph-envelope" /> {{ a.email }}
                </a>
                <span v-if="a.phone" style="color: #64748b; font-size: 0.8rem;">
                  <i class="ph ph-phone" /> {{ a.phone }}
                </span>
              </NSpace>
            </div>
          </div>
        </NCard>
      </div>
      <NEmpty v-else-if="!loading" description="No stakeholders assigned" />
    </NSpin>
  </div>
</template>
