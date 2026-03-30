<script setup lang="ts">
import { computed } from 'vue';
import { NCard, NGrid, NGi, NStatistic, NDescriptions, NDescriptionsItem, NProgress, NTag } from 'naive-ui';

const props = defineProps<{ project: any }>();

const tasks = computed(() => props.project.tasks || []);
const tasksDone = computed(() => tasks.value.filter((t: any) => t.status === 'completed').length);
const tasksActive = computed(() => tasks.value.filter((t: any) => t.status === 'in-progress').length);
const daysUntilDue = computed(() => {
  const d = props.project.dueDate || props.project.duedate || props.project.endDate || props.project.enddate;
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
});

function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString() : '-'; }
</script>

<template>
  <div style="padding-top: 16px;">
    <!-- Stats -->
    <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom: 24px;">
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Progress" :value="project.progress || 0">
            <template #suffix>%</template>
          </NStatistic>
          <NProgress type="line" :percentage="project.progress || 0" :height="6" :border-radius="3" :show-indicator="false" style="margin-top:8px;" />
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Tasks" :value="tasks.length">
            <template #suffix>total</template>
          </NStatistic>
          <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;">{{ tasksDone }} done, {{ tasksActive }} active</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic :label="daysUntilDue !== null && daysUntilDue < 0 ? 'Overdue' : 'Days Until Due'" :value="daysUntilDue !== null ? Math.abs(daysUntilDue) : '-'">
            <template v-if="daysUntilDue !== null" #suffix>days</template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <div style="margin-top:8px;">
            <NTag :type="({active:'success',planning:'info',scheduled:'info','in-progress':'info','on-hold':'warning',completed:'success',cancelled:'default'} as any)[project.status] || 'default'" size="large">
              {{ project.status }}
            </NTag>
          </div>
          <div v-if="project.priority" style="font-size:0.8rem;color:#94a3b8;margin-top:8px;">{{ project.priority }} priority</div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Details -->
    <NCard size="small" style="margin-bottom: 16px;">
      <NDescriptions :column="2" label-placement="left" bordered size="small">
        <NDescriptionsItem label="Type">{{ project.type || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Priority">{{ project.priority || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Client">{{ project.client || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Site Location">{{ project.siteLocation || project.sitelocation || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Business Line">{{ project.businessLine || project.businessline || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Requestor">{{ project.requestorInfo || project.requestorinfo || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Start Date">{{ fmtDate(project.startDate || project.startdate) }}</NDescriptionsItem>
        <NDescriptionsItem label="Due Date">{{ fmtDate(project.dueDate || project.duedate || project.endDate || project.enddate) }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <!-- Description -->
    <NCard v-if="project.description" size="small" title="Description">
      <div style="white-space: pre-wrap;">{{ project.description }}</div>
    </NCard>
  </div>
</template>
