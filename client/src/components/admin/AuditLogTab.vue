<script setup lang="ts">
import { ref, computed, h } from 'vue';
import {
  NDataTable, NDatePicker, NSelect, NButton, NSpace, NTag, NSpin, NPagination
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useAdminStore } from '../../stores/admin';
import { AUDIT_CATEGORIES, AUDIT_SEVERITIES } from '../../types/admin';
import type { AuditEntry } from '../../types/admin';

const store = useAdminStore();

const dateRange = ref<[number, number] | null>(null);

const categoryOptions = AUDIT_CATEGORIES.map(c => ({ label: c.label as string, value: c.value as string }));
const severityOptions = AUDIT_SEVERITIES.map(s => ({ label: s.label as string, value: s.value as string }));

function formatTimestamp(ts: string) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function severityType(sev?: string): 'info' | 'warning' | 'error' | 'default' {
  if (sev === 'critical') return 'error';
  if (sev === 'warning') return 'warning';
  if (sev === 'info') return 'info';
  return 'default';
}

function tryParseDetails(details?: string): Record<string, any> | null {
  if (!details) return null;
  try { return JSON.parse(details); } catch { return null; }
}

const columns: DataTableColumns<AuditEntry> = [
  {
    title: 'Timestamp',
    key: 'timestamp',
    width: 180,
    render(row) { return formatTimestamp(row.timestamp); },
  },
  { title: 'User', key: 'user', width: 160 },
  { title: 'Action', key: 'action', ellipsis: { tooltip: true } },
  {
    title: 'Category',
    key: 'category',
    width: 120,
    render(row) {
      return row.category ? h(NTag, { size: 'small', bordered: true }, () => row.category) : '-';
    },
  },
  {
    title: 'Severity',
    key: 'severity',
    width: 100,
    render(row) {
      return row.severity ? h(NTag, { size: 'small', type: severityType(row.severity), bordered: true }, () => row.severity) : '-';
    },
  },
  { title: 'IP', key: 'ipAddress', width: 130 },
];

const totalPages = computed(() => Math.ceil(store.auditPagination.total / store.auditPagination.limit));

function applyFilters() {
  store.auditFilters.fromDate = dateRange.value ? dateRange.value[0] : null;
  store.auditFilters.toDate = dateRange.value ? dateRange.value[1] : null;
  store.auditPagination.page = 1;
  store.fetchAuditLog();
}

function handlePageChange(page: number) {
  store.auditPagination.page = page;
  store.fetchAuditLog();
}

function isDiffEntry(val: any): val is { before: any; after: any } {
  return val && typeof val === 'object' && ('before' in val || 'after' in val);
}

function formatVal(v: any): string {
  if (v === undefined || v === null) return '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderDiffValue(label: string, before: any, after: any) {
  const bStr = formatVal(before);
  const aStr = formatVal(after);
  return h('div', {
    style: 'display:grid;grid-template-columns:120px 1fr 24px 1fr;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);',
  }, [
    h('span', { style: 'color:#8890a4;font-weight:500;' }, label),
    h('span', { style: 'color:#f87171;background:rgba(248,113,113,0.08);padding:2px 6px;border-radius:3px;word-break:break-all;' }, bStr),
    h('span', { style: 'color:#8890a4;text-align:center;' }, '\u2192'),
    h('span', { style: 'color:#4ade80;background:rgba(74,222,128,0.08);padding:2px 6px;border-radius:3px;word-break:break-all;' }, aStr),
  ]);
}

function renderExpand(row: AuditEntry) {
  const parsed = tryParseDetails(row.details);
  const details = parsed || (row.details ? { details: row.details } : null);
  if (!details) return h('div', { style: 'padding:8px;color:#8890a4' }, 'No additional details');

  // Check if this is a diff-style entry (has before/after fields)
  const diffEntries = Object.entries(details).filter(([, val]) => isDiffEntry(val));
  const plainEntries = Object.entries(details).filter(([, val]) => !isDiffEntry(val));

  const children: any[] = [];

  if (diffEntries.length > 0) {
    children.push(
      h('div', { style: 'font-weight:600;margin-bottom:8px;color:#c0c6d4;' }, 'Changes'),
      h('div', { style: 'font-size:12px;margin-bottom:4px;display:grid;grid-template-columns:120px 1fr 24px 1fr;gap:8px;color:#64748b;' }, [
        h('span', {}, 'Field'),
        h('span', {}, 'Before'),
        h('span', {}),
        h('span', {}, 'After'),
      ]),
      ...diffEntries.map(([key, val]) => renderDiffValue(key, (val as any).before, (val as any).after))
    );
  }

  if (plainEntries.length > 0) {
    if (diffEntries.length > 0) {
      children.push(h('div', { style: 'margin-top:12px;font-weight:600;color:#c0c6d4;margin-bottom:8px;' }, 'Details'));
    }
    children.push(
      ...plainEntries.map(([key, val]) =>
        h('div', { style: 'margin-bottom: 4px;' }, [
          h('span', { style: 'color: #8890a4; margin-right: 8px;' }, `${key}:`),
          h('span', {}, typeof val === 'object' && val !== null ? JSON.stringify(val, null, 2) : String(val)),
        ])
      )
    );
  }

  return h('div', { style: 'padding: 8px 16px; font-size: 13px;' }, children);
}
</script>

<template>
  <div>
    <!-- Filter bar -->
    <NSpace align="center" style="margin-bottom: 16px;" :wrap="true">
      <NDatePicker
        v-model:value="dateRange"
        type="daterange"
        clearable
        style="width: 280px;"
      />
      <NSelect
        v-model:value="store.auditFilters.category"
        :options="categoryOptions"
        placeholder="Category"
        clearable
        style="width: 160px;"
      />
      <NSelect
        v-model:value="store.auditFilters.severity"
        :options="severityOptions"
        placeholder="Severity"
        clearable
        style="width: 140px;"
      />
      <NButton type="primary" secondary @click="applyFilters">Filter</NButton>
      <NButton secondary @click="store.exportAuditCsv()">Export CSV</NButton>
      <span style="color: var(--n-text-color-3, #8890a4); font-size: 13px;">
        {{ store.auditPagination.total }} entries
      </span>
    </NSpace>

    <!-- Audit table -->
    <NSpin :show="store.auditLoading">
      <NDataTable
        :columns="columns"
        :data="store.auditEntries"
        :row-key="(row: AuditEntry) => row.id"
        :bordered="false"
        striped
        :row-props="() => ({ style: 'cursor: pointer' })"
        :expand-column-key="'timestamp'"
        :render-expand="renderExpand"
      />
    </NSpin>

    <div v-if="totalPages > 1" style="margin-top: 16px; display: flex; justify-content: flex-end;">
      <NPagination
        :page="store.auditPagination.page"
        :page-count="totalPages"
        @update:page="handlePageChange"
      />
    </div>
  </div>
</template>
