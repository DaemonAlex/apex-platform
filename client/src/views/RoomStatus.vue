<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  NDataTable, NSelect, NSpace, NStatistic, NCard, NGrid, NGi,
  NTag, NButton, NModal, NForm, NFormItem, NInput, NRadioGroup, NRadio,
  useMessage,
} from 'naive-ui';
import { useRoomStore } from '../stores/rooms';
import { ROOM_TYPE_PRESETS } from '../types';
import type { DataTableColumns } from 'naive-ui';
import type { Room, RoomCheck } from '../types';

const msg = useMessage();
const store = useRoomStore();

// Filters
const filterLocation = ref<string | null>(null);
const filterFloor = ref<string | null>(null);
const filterType = ref<string | null>(null);
const filterStatus = ref<string | null>(null);

// Modal state
const showCheckModal = ref(false);
const checkRoomId = ref<string | null>(null);
const checkForm = ref({ checkedBy: '', ragStatus: 'green', issueDescription: '', ticketNumber: '', notes: '' });
const submittingCheck = ref(false);

// Detail modal
const showDetailModal = ref(false);
const detailRoomId = ref<string | null>(null);
const detailHistory = ref<RoomCheck[]>([]);
const loadingHistory = ref(false);

onMounted(async () => {
  await store.fetchRooms();
});

// Filter options from data
const locationOptions = computed(() => {
  const locs = [...new Set(store.rooms.map(r => r.location).filter(Boolean))].sort();
  return locs.map(l => ({ label: l!, value: l! }));
});
const floorOptions = computed(() => {
  const floors = [...new Set(store.rooms.map(r => r.floor).filter(Boolean))].sort();
  return floors.map(f => ({ label: 'Floor ' + f!, value: f! }));
});
const typeOptions = computed(() => {
  const types = [...new Set(store.rooms.map(r => r.roomType).filter(Boolean))];
  return types.map(t => {
    const preset = ROOM_TYPE_PRESETS.find(p => p.value === t);
    return { label: preset?.label || t!.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: t! };
  });
});

const filteredRooms = computed(() => {
  return store.rooms.filter(r =>
    (!filterLocation.value || r.location === filterLocation.value) &&
    (!filterFloor.value || r.floor === filterFloor.value) &&
    (!filterType.value || r.roomType === filterType.value) &&
    (!filterStatus.value || r.ragStatus === filterStatus.value)
  );
});

const columns: DataTableColumns<Room> = [
  {
    title: 'Location',
    key: 'location',
    sorter: 'default',
    render: (row) => row.location || '-',
  },
  {
    title: 'Floor',
    key: 'floor',
    width: 80,
    render: (row) => row.floor || '-',
  },
  {
    title: 'Room / Space',
    key: 'name',
    sorter: 'default',
    render: (row) => h('span', { style: 'font-weight: 500' }, row.name),
  },
  {
    title: 'Type',
    key: 'roomType',
    width: 130,
    render: (row) => {
      if (!row.roomType) return '-';
      const preset = ROOM_TYPE_PRESETS.find(p => p.value === row.roomType);
      return preset?.label || row.roomType.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    },
  },
  {
    title: 'Status',
    key: 'ragStatus',
    width: 110,
    align: 'center',
    render: (row) => {
      const colors = { green: 'success', amber: 'warning', red: 'error' } as const;
      const labels: Record<string, string> = { green: 'OK', amber: 'Limited', red: 'Down' };
      return h(NTag, { type: (colors[row.ragStatus as keyof typeof colors] || 'default') as any, size: 'small', bordered: false },
        () => labels[row.ragStatus] || 'Unknown');
    },
  },
  {
    title: 'Schedule',
    key: 'checkFrequency',
    width: 100,
    align: 'center',
    render: (row) => {
      const labels: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly' };
      return labels[row.checkFrequency] || row.checkFrequency;
    },
  },
  {
    title: 'Last Checked',
    key: 'lastCheckedAt',
    width: 150,
    sorter: (a, b) => {
      const da = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
      const db = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
      return da - db;
    },
    render: (row) => {
      if (!row.lastCheckedAt) return h('span', { style: 'color: #ef4444' }, 'Never');
      const d = new Date(row.lastCheckedAt);
      return h('div', {}, [
        h('div', { style: 'font-size: 0.85rem' }, d.toLocaleDateString()),
        row.lastCheckedBy ? h('div', { style: 'font-size: 0.75rem; color: #94a3b8' }, row.lastCheckedBy) : null,
      ]);
    },
  },
  {
    title: 'Due',
    key: 'isOverdue',
    width: 90,
    align: 'center',
    sorter: (a, b) => (a.isOverdue ? 1 : 0) - (b.isOverdue ? 1 : 0),
    render: (row) => {
      if (row.isOverdue) return h(NTag, { type: 'error', size: 'small', bordered: false }, () => 'Overdue');
      if (row.nextDue) {
        const days = Math.ceil((new Date(row.nextDue).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days <= 1) return h(NTag, { type: 'warning', size: 'small', bordered: false }, () => 'Today');
        return h('span', { style: 'color: #94a3b8; font-size: 0.85rem' }, days + 'd');
      }
      return '-';
    },
  },
  {
    title: '',
    key: 'actions',
    width: 60,
    align: 'center',
    render: (row) => h(NButton, {
      size: 'small',
      type: 'primary',
      quaternary: true,
      onClick: (e: Event) => { e.stopPropagation(); openCheckModal(row.id); },
    }, { default: () => h('i', { class: 'ph ph-clipboard-text' }) }),
  },
];

function handleRowClick(row: Room) {
  openDetailModal(row.id);
}

function openCheckModal(roomId: string) {
  checkRoomId.value = roomId;
  checkForm.value = { checkedBy: '', ragStatus: 'green', issueDescription: '', ticketNumber: '', notes: '' };
  showCheckModal.value = true;
}

async function submitCheck() {
  if (!checkForm.value.checkedBy.trim()) { msg.error('Name is required'); return; }
  if (checkForm.value.ragStatus !== 'green' && !checkForm.value.issueDescription.trim()) {
    msg.error('Describe the issue'); return;
  }
  submittingCheck.value = true;
  try {
    await store.submitCheck(checkRoomId.value!, {
      checkedBy: checkForm.value.checkedBy.trim(),
      ragStatus: checkForm.value.ragStatus,
      issueFound: checkForm.value.ragStatus !== 'green',
      issueDescription: checkForm.value.issueDescription.trim() || null,
      ticketNumber: checkForm.value.ticketNumber.trim() || null,
      notes: checkForm.value.notes.trim() || null,
    });
    showCheckModal.value = false;
    msg.success('Room check recorded');
  } catch (e: any) {
    msg.error(e.message || 'Failed to submit check');
  } finally {
    submittingCheck.value = false;
  }
}

async function openDetailModal(roomId: string) {
  detailRoomId.value = roomId;
  showDetailModal.value = true;
  loadingHistory.value = true;
  try {
    detailHistory.value = await store.fetchCheckHistory(roomId);
  } catch (e) {
    detailHistory.value = [];
  } finally {
    loadingHistory.value = false;
  }
}

const detailRoom = computed(() => store.rooms.find(r => r.id === detailRoomId.value));

import { h } from 'vue';
</script>

<template>
  <div>
    <h1 style="margin: 0 0 4px 0; font-size: 1.5rem;">Room Status</h1>
    <p style="color: #64748b; margin: 0 0 20px 0;">Monitor rooms by location, floor, and space</p>

    <!-- Summary cards -->
    <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom: 20px;">
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="filterStatus = null">
          <NStatistic label="Total Rooms" :value="store.stats.total" />
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="filterStatus = 'green'">
          <NStatistic label="Operational" :value="store.stats.green">
            <template #prefix><span style="color: #22c55e;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="filterStatus = 'amber'">
          <NStatistic label="Limited" :value="store.stats.amber">
            <template #prefix><span style="color: #f59e0b;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="filterStatus = 'red'">
          <NStatistic label="Down" :value="store.stats.red">
            <template #prefix><span style="color: #ef4444;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="filterStatus = null">
          <NStatistic label="Overdue" :value="store.stats.overdue">
            <template #prefix><span style="color: #ef4444;">!</span></template>
          </NStatistic>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Filters -->
    <NSpace style="margin-bottom: 16px;" align="center">
      <NSelect v-model:value="filterLocation" :options="locationOptions" placeholder="All Locations" clearable style="width: 200px;" size="small" />
      <NSelect v-model:value="filterFloor" :options="floorOptions" placeholder="All Floors" clearable style="width: 140px;" size="small" />
      <NSelect v-model:value="filterType" :options="typeOptions" placeholder="All Types" clearable style="width: 160px;" size="small" />
      <NSelect v-model:value="filterStatus" :options="[{label:'Green',value:'green'},{label:'Amber',value:'amber'},{label:'Red',value:'red'}]" placeholder="All Statuses" clearable style="width: 140px;" size="small" />
      <span style="color: #94a3b8; font-size: 0.85rem; margin-left: auto;">
        {{ filteredRooms.length }} of {{ store.rooms.length }} rooms
      </span>
    </NSpace>

    <!-- Data Table -->
    <NDataTable
      :columns="columns"
      :data="filteredRooms"
      :row-key="(row: Room) => row.id"
      :loading="store.loading"
      :row-props="(row: Room) => ({ style: row.isOverdue ? 'background: rgba(239,68,68,0.03)' : '', onClick: () => handleRowClick(row) })"
      :bordered="false"
      size="small"
      striped
    />

    <!-- Record Check Modal -->
    <NModal v-model:show="showCheckModal" preset="card" title="Record Room Check" style="width: 480px;">
      <div v-if="checkRoomId" style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
        <strong>{{ store.rooms.find(r => r.id === checkRoomId)?.name }}</strong>
        <div style="font-size: 0.85rem; color: #64748b;">
          {{ store.rooms.find(r => r.id === checkRoomId)?.location }}
          {{ store.rooms.find(r => r.id === checkRoomId)?.floor ? ' - Floor ' + store.rooms.find(r => r.id === checkRoomId)?.floor : '' }}
        </div>
      </div>
      <NForm label-placement="top">
        <NFormItem label="Checked By" required>
          <NInput v-model:value="checkForm.checkedBy" placeholder="Your name" />
        </NFormItem>
        <NFormItem label="Room Status" required>
          <NRadioGroup v-model:value="checkForm.ragStatus">
            <NRadio value="green">All Systems Functional</NRadio>
            <NRadio value="amber">Partial Issue</NRadio>
            <NRadio value="red">Non-Functional</NRadio>
          </NRadioGroup>
        </NFormItem>
        <template v-if="checkForm.ragStatus !== 'green'">
          <NFormItem label="Issue Description" required>
            <NInput v-model:value="checkForm.issueDescription" type="textarea" :rows="3" placeholder="Describe the issue..." />
          </NFormItem>
          <NFormItem label="SNOW Ticket #">
            <NInput v-model:value="checkForm.ticketNumber" placeholder="e.g., INC0012345" />
          </NFormItem>
        </template>
        <NFormItem label="Notes (optional)">
          <NInput v-model:value="checkForm.notes" type="textarea" :rows="2" placeholder="Additional observations..." />
        </NFormItem>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showCheckModal = false">Cancel</NButton>
          <NButton type="primary" :loading="submittingCheck" @click="submitCheck">Submit Check</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Room Detail Modal -->
    <NModal v-model:show="showDetailModal" preset="card" :title="detailRoom?.name || 'Room'" style="width: 600px;">
      <template v-if="detailRoom">
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
          <NTag :type="detailRoom.ragStatus === 'green' ? 'success' : detailRoom.ragStatus === 'amber' ? 'warning' : 'error'">
            {{ detailRoom.ragStatus === 'green' ? 'Operational' : detailRoom.ragStatus === 'amber' ? 'Limited' : 'Down' }}
          </NTag>
          <NTag v-if="detailRoom.roomType">{{ detailRoom.roomType }}</NTag>
          <NTag v-if="detailRoom.capacity">{{ detailRoom.capacity }} seats</NTag>
          <NTag>{{ detailRoom.checkFrequency }}</NTag>
          <NTag v-if="detailRoom.isOverdue" type="error">Overdue</NTag>
        </div>

        <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 16px;">
          {{ detailRoom.location }}{{ detailRoom.floor ? ' - Floor ' + detailRoom.floor : '' }}
        </div>

        <h4 style="margin: 16px 0 8px;">Check History</h4>
        <div v-if="loadingHistory" style="color: #94a3b8;">Loading...</div>
        <div v-else-if="detailHistory.length === 0" style="color: #94a3b8;">No checks recorded yet.</div>
        <table v-else style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <th style="text-align: left; padding: 6px 0;">Date</th>
              <th style="text-align: left; padding: 6px;">By</th>
              <th style="text-align: center; padding: 6px;">Status</th>
              <th style="text-align: left; padding: 6px;">Issue / Ticket</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="check in detailHistory.slice(0, 20)" :key="check.id" style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 6px 0; color: #64748b;">
                {{ new Date(check.checkedAt).toLocaleDateString() }}
                {{ new Date(check.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </td>
              <td style="padding: 6px;">{{ check.checkedBy }}</td>
              <td style="text-align: center; padding: 6px;">
                <span :style="{ color: check.ragStatus === 'green' ? '#22c55e' : check.ragStatus === 'amber' ? '#f59e0b' : '#ef4444' }">&#9679;</span>
              </td>
              <td style="padding: 6px; color: #64748b;">
                {{ check.issueFound ? (check.issueDescription || 'Issue noted') : '-' }}
                <span v-if="check.ticketNumber" style="color: #0ea5e9; margin-left: 4px;">{{ check.ticketNumber }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showDetailModal = false">Close</NButton>
          <NButton type="primary" @click="showDetailModal = false; openCheckModal(detailRoomId!)">Record Check</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
