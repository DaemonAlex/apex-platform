<script setup lang="ts">
import { computed } from 'vue';
import { NCard, NGrid, NGi, NStatistic, NDescriptions, NDescriptionsItem } from 'naive-ui';

const props = defineProps<{ project: any }>();

const budget = computed(() => parseFloat(props.project.estimatedBudget || props.project.estimatedbudget || props.project.budget || 0));
const actual = computed(() => parseFloat(props.project.actualBudget || props.project.actualbudget || 0));
const variance = computed(() => actual.value - budget.value);
const variancePercent = computed(() => budget.value > 0 ? Math.round((variance.value / budget.value) * 100) : 0);

function fmt(v: number) { return '$' + (v / 1000).toFixed(1) + 'K'; }
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
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Planned Budget" :value="fmt(budget)" />
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Actual Spend" :value="fmt(actual)" />
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Variance" :value="(variance >= 0 ? '+' : '') + fmt(Math.abs(variance))">
            <template #suffix>({{ variancePercent >= 0 ? '+' : '' }}{{ variancePercent }}%)</template>
          </NStatistic>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Details -->
    <NCard size="small" style="margin-bottom: 16px;">
      <NDescriptions :column="2" label-placement="left" bordered size="small">
        <NDescriptionsItem label="Type">{{ project.type || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Priority">{{ project.priority || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Business Line">{{ project.businessLine || project.businessline || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Cost Center">{{ project.costCenter || project.costcenter || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Start Date">{{ fmtDate(project.startDate || project.startdate) }}</NDescriptionsItem>
        <NDescriptionsItem label="Due Date">{{ fmtDate(project.dueDate || project.duedate || project.endDate || project.enddate) }}</NDescriptionsItem>
        <NDescriptionsItem label="Requestor">{{ project.requestorInfo || project.requestorinfo || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="PO Number">{{ project.purchaseOrder || project.purchaseorder || '-' }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <!-- Description -->
    <NCard v-if="project.description" size="small" title="Description">
      <div style="white-space: pre-wrap;">{{ project.description }}</div>
    </NCard>
  </div>
</template>
