<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NTabs, NTabPane, NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NStatistic, NSpace, NButtonGroup, NButton,
  NInput, NSelect, NDataTable, NTag,
  NModal, NForm, NFormItem, NEmpty, NSpin, NCollapse, NCollapseItem,
  NInputNumber,
  useMessage,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from './composables/useTheme';
import { useRoomStore } from './stores/rooms';
import { ROOM_TYPE_PRESETS } from './types';
import type { Room, Floor, RoomCheck, Equipment } from './types';
import { h } from 'vue';

defineProps<{ userName?: string }>();

// useMessage must be called after NMessageProvider mounts.
// We use a late-init pattern: msg is null during setup, set on first use.
let _msg: ReturnType<typeof useMessage> | null = null;
function getMsg() {
  if (!_msg) { try { _msg = useMessage(); } catch(e) {} }
  return _msg;
}
const msg = { success: (m: string) => getMsg()?.success(m), error: (m: string) => getMsg()?.error(m), info: (m: string) => getMsg()?.info(m) };
const store = useRoomStore();
const activeTab = ref('rooms');
const viewMode = ref(localStorage.getItem('apex_room_view') || 'table');

// Filters
const filterLocation = ref<number | null>(null);
const filterType = ref<string | null>(null);
const filterStatus = ref<string | null>(null);

// Location management
const locFloors = ref<Record<number, Floor[]>>({});
const newLocForm = ref({ name: '', address: '', city: '', state: '' });
const newFloorNames = ref<Record<number, string>>({});

// Room form
const showAddRoom = ref(false);
const roomForm = ref({ name: '', locationId: null as number | null, floorId: null as number | null, roomType: null as string | null, customType: '', capacity: null as number | null, checkFrequency: 'weekly' });
const roomFloorOptions = ref<{ label: string; value: number }[]>([]);

// Check modal
const showCheckModal = ref(false);
const checkRoomId = ref<string | null>(null);
const checkForm = ref({ checkedBy: '', ragStatus: 'green', issueDescription: '', ticketNumber: '', notes: '' });

// Detail modal
const showDetailModal = ref(false);
const detailRoomId = ref<string | null>(null);
const detailHistory = ref<RoomCheck[]>([]);
const detailEquipment = ref<Equipment[]>([]);
const loadingDetail = ref(false);

// Equipment modal
const showEquipModal = ref(false);
const equipRoomId = ref<string | null>(null);
const equipForm = ref({ category: '', make: '', model: '', serialNumber: '', firmwareVersion: '', installDate: '', warrantyEnd: '', notes: '' });

function setViewMode(mode: string) { viewMode.value = mode; localStorage.setItem('apex_room_view', mode); }

// Filtered rooms
const filteredRooms = computed(() => {
  return store.rooms.filter(r =>
    (!filterLocation.value || r.locationId === filterLocation.value) &&
    (!filterType.value || r.roomType === filterType.value) &&
    (!filterStatus.value || r.ragStatus === filterStatus.value)
  );
});

const overdueRooms = computed(() => store.rooms.filter(r => r.isOverdue));

const locationOptions = computed(() => store.locations.map(l => ({ label: l.name, value: l.id })));
const typeOptions = computed(() => {
  const all = [...ROOM_TYPE_PRESETS.map(p => ({ label: p.label, value: p.value }))];
  const presetValues = ROOM_TYPE_PRESETS.map(p => p.value as string);
  const custom = [...new Set(store.rooms.map(r => r.roomType).filter(t => t && !presetValues.includes(t)))];
  custom.forEach(t => all.push({ label: t!.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: t! }));
  return all;
});

const roomTypePresetOptions = [
  ...ROOM_TYPE_PRESETS.map(p => ({ label: p.label, value: p.value })),
  { label: 'Other (custom)', value: '__custom' },
];

const freqOptions = [
  { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' },
  { label: 'Biweekly', value: 'biweekly' }, { label: 'Monthly', value: 'monthly' },
];

function getRoomTypeLabel(val: string | null | undefined) {
  if (!val) return '-';
  const p = ROOM_TYPE_PRESETS.find(p => p.value === val);
  return p ? p.label : val.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const freqLabels: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly' };

// Room table columns
const roomColumns: DataTableColumns<Room> = [
  {
    title: 'Room', key: 'name', sorter: 'default',
    render: (row) => h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
      h('i', { class: 'ph ph-monitor', style: 'font-size:1.2rem;color:#0ea5e9;flex-shrink:0;' }),
      h('div', {}, [
        h('div', { style: 'font-weight:500;' }, row.name),
        h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, [row.location, row.floor ? ' - Floor ' + row.floor : ''].filter(Boolean).join('')),
      ]),
    ]),
  },
  { title: 'Type', key: 'roomType', width: 120, sorter: 'default', render: (row) => getRoomTypeLabel(row.roomType) },
  {
    title: 'Status', key: 'ragStatus', width: 110, align: 'center', sorter: 'default',
    render: (row) => {
      const t: Record<string, string> = { green: 'success', amber: 'warning', red: 'error' };
      const l: Record<string, string> = { green: 'OK', amber: 'Limited', red: 'Down' };
      return h(NTag, { type: (t[row.ragStatus] || 'default') as any, size: 'small', bordered: false }, () => l[row.ragStatus] || '?');
    },
  },
  { title: 'Schedule', key: 'checkFrequency', width: 90, align: 'center', render: (row) => freqLabels[row.checkFrequency] || row.checkFrequency },
  {
    title: 'Last Checked', key: 'lastCheckedAt', width: 130, sorter: 'default',
    render: (row) => {
      if (!row.lastCheckedAt) return h('span', { style: 'color:#ef4444;' }, 'Never');
      return h('div', {}, [
        h('div', { style: 'font-size:0.85rem;' }, new Date(row.lastCheckedAt).toLocaleDateString()),
        row.lastCheckedBy ? h('div', { style: 'font-size:0.73rem;color:#94a3b8;' }, row.lastCheckedBy) : null,
      ]);
    },
  },
  {
    title: 'Due', key: 'isOverdue', width: 80, align: 'center',
    render: (row) => {
      if (!row.lastCheckedAt) return h(NTag, { type: 'error', size: 'small', bordered: false }, () => 'New');
      if (row.isOverdue) return h(NTag, { type: 'error', size: 'small', bordered: false }, () => 'Overdue');
      if (row.nextDue) {
        const d = Math.ceil((new Date(row.nextDue).getTime() - Date.now()) / 86400000);
        if (d <= 1) return h(NTag, { type: 'warning', size: 'small', bordered: false }, () => 'Today');
        return h('span', { style: 'color:#94a3b8;font-size:0.85rem;' }, d + 'd');
      }
      return '-';
    },
  },
  {
    title: '', key: 'actions', width: 50, align: 'center',
    render: (row) => h(NButton, { size: 'small', type: 'primary', quaternary: true, onClick: (e: Event) => { e.stopPropagation(); openCheckModal(row.id); } },
      { default: () => h('i', { class: 'ph ph-clipboard-text' }) }),
  },
];

// === ACTIONS ===

onMounted(async () => {
  await Promise.all([store.fetchRooms(), store.fetchLocations()]);
  // Pre-load floors for all locations
  await loadAllLocFloors();
});

function handleTabChange(tab: string) {
  activeTab.value = tab;
  if (tab === 'overdue') { filterStatus.value = null; filterLocation.value = null; filterType.value = null; }
}

// Check modal
function openCheckModal(roomId: string) {
  checkRoomId.value = roomId;
  checkForm.value = { checkedBy: '', ragStatus: 'green', issueDescription: '', ticketNumber: '', notes: '' };
  showCheckModal.value = true;
}

async function submitCheck() {
  if (!checkForm.value.checkedBy.trim()) { msg.error('Name is required'); return; }
  if (checkForm.value.ragStatus !== 'green' && !checkForm.value.issueDescription.trim()) { msg.error('Describe the issue'); return; }
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
    msg.success('Check recorded');
  } catch (e: any) { msg.error(e.message || 'Failed'); }
}

// Detail modal
async function openDetail(roomId: string) {
  detailRoomId.value = roomId;
  showDetailModal.value = true;
  loadingDetail.value = true;
  try {
    const [hist, equip] = await Promise.all([store.fetchCheckHistory(roomId), store.fetchEquipment(roomId)]);
    detailHistory.value = hist;
    detailEquipment.value = equip;
  } catch (e) { detailHistory.value = []; detailEquipment.value = []; }
  finally { loadingDetail.value = false; }
}
const detailRoom = computed(() => store.rooms.find(r => r.id === detailRoomId.value));

// Add room
async function loadRoomFloors(locId: number) {
  const floors = await store.fetchFloors(locId);
  roomFloorOptions.value = floors.map(f => ({ label: 'Floor ' + f.name, value: f.id }));
}

async function saveRoom() {
  if (!roomForm.value.name.trim() || !roomForm.value.locationId || !roomForm.value.floorId) { msg.error('Name, location, and floor are required'); return; }
  const rt = roomForm.value.roomType === '__custom' ? (roomForm.value.customType.trim().toLowerCase().replace(/\s+/g, '-') || null) : roomForm.value.roomType;
  const loc = store.locations.find(l => l.id === roomForm.value.locationId);
  const floor = roomFloorOptions.value.find(f => f.value === roomForm.value.floorId);
  await store.createRoom({
    id: 'room_' + Date.now(), name: roomForm.value.name.trim(),
    locationId: roomForm.value.locationId, location: loc?.name,
    floorId: roomForm.value.floorId, floor: floor?.label.replace('Floor ', ''),
    roomType: rt, capacity: roomForm.value.capacity, checkFrequency: roomForm.value.checkFrequency,
    scheduleDay: 1, scheduleDayName: '',
  });
  showAddRoom.value = false;
  roomForm.value = { name: '', locationId: null, floorId: null, roomType: null, customType: '', capacity: null, checkFrequency: 'weekly' };
  msg.success('Room added');
  await store.fetchLocations();
}

// Location management
async function loadLocFloors(locId: number) {
  const floors = await store.fetchFloors(locId);
  locFloors.value = { ...locFloors.value, [locId]: floors };
}

async function loadAllLocFloors() {
  for (const loc of store.locations) {
    await loadLocFloors(loc.id);
  }
}

async function addLocation() {
  if (!newLocForm.value.name.trim()) { msg.error('Name required'); return; }
  await store.createLocation({ name: newLocForm.value.name.trim(), address: newLocForm.value.address || undefined, city: newLocForm.value.city || undefined, state: newLocForm.value.state || undefined });
  newLocForm.value = { name: '', address: '', city: '', state: '' };
  msg.success('Location added');
}

async function addFloor(locId: number) {
  const name = newFloorNames.value[locId]?.trim();
  if (!name) return;
  await store.createFloor(locId, name);
  newFloorNames.value = { ...newFloorNames.value, [locId]: '' };
  await loadLocFloors(locId);
  await store.fetchLocations();
  msg.success('Floor added');
}

async function removeFloor(floorId: number, locId: number) {
  await store.deleteFloor(floorId);
  await loadLocFloors(locId);
  await store.fetchLocations();
}

async function removeLocation(id: number) {
  await store.deleteLocation(id);
  msg.success('Location removed');
}

// Equipment
function openEquipModal(roomId: string) {
  equipRoomId.value = roomId;
  equipForm.value = { category: '', make: '', model: '', serialNumber: '', firmwareVersion: '', installDate: '', warrantyEnd: '', notes: '' };
  showEquipModal.value = true;
}

async function saveEquip() {
  if (!equipForm.value.category) { msg.error('Category required'); return; }
  await store.addEquipment(equipRoomId.value!, equipForm.value);
  showEquipModal.value = false;
  msg.success('Equipment added');
  if (detailRoomId.value === equipRoomId.value) {
    detailEquipment.value = await store.fetchEquipment(equipRoomId.value!);
  }
  await store.fetchRooms();
}

const categoryOptions = [
  { label: 'Display', value: 'display' }, { label: 'Camera', value: 'camera' },
  { label: 'Microphone', value: 'microphone' }, { label: 'Speaker', value: 'speaker' },
  { label: 'Processor / DSP', value: 'processor' }, { label: 'Control System', value: 'control' },
  { label: 'Network / Switch', value: 'network' },
];

const categoryIcons: Record<string, string> = {
  display: 'ph-monitor', camera: 'ph-video-camera', microphone: 'ph-microphone',
  speaker: 'ph-speaker-high', processor: 'ph-cpu', control: 'ph-sliders', network: 'ph-wifi-high',
};

// All equipment across all rooms
const allEquipmentLoading = ref(false);
const allEquipment = ref<(Equipment & { roomName?: string; roomLocation?: string })[]>([]);
async function loadAllEquipment() {
  allEquipmentLoading.value = true;
  try {
    const items: any[] = [];
    for (const room of store.rooms) {
      const equip = await store.fetchEquipment(room.id);
      equip.forEach(e => items.push({ ...e, roomName: room.name, roomLocation: room.location }));
    }
    allEquipment.value = items;
  } finally { allEquipmentLoading.value = false; }
}

// Theme
const { naiveTheme, themeOverrides } = useTheme();
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">

  <h1 style="margin:0 0 16px 0;font-size:1.5rem;">Room Status</h1>

  <!-- Stats -->
  <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:20px;">
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="filterStatus=null;filterLocation=null;activeTab='rooms'"><NStatistic label="Total" :value="store.stats.total" /></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="filterStatus='green';activeTab='rooms'"><NStatistic label="Operational" :value="store.stats.green"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="filterStatus='amber';activeTab='rooms'"><NStatistic label="Limited" :value="store.stats.amber"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="filterStatus='red';activeTab='rooms'"><NStatistic label="Down" :value="store.stats.red"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='overdue'"><NStatistic label="Overdue" :value="store.stats.overdue"><template #prefix><span style="color:#ef4444;">!</span></template></NStatistic></NCard></NGi>
  </NGrid>

  <!-- Tabs -->
  <NTabs :value="activeTab" type="line" @update:value="handleTabChange" style="margin-bottom:16px;">
    <NTabPane name="rooms" tab="All Rooms" />
    <NTabPane name="overdue" :tab="'Overdue (' + overdueRooms.length + ')'" />
    <NTabPane name="locations" tab="Locations" />
    <NTabPane name="equipment" tab="Equipment" />
  </NTabs>

  <!-- ===================== ALL ROOMS TAB ===================== -->
  <template v-if="activeTab === 'rooms' || activeTab === 'overdue'">
    <NSpace style="margin-bottom:16px;" align="center" :wrap="true">
      <NSelect v-if="activeTab==='rooms'" v-model:value="filterLocation" :options="locationOptions" placeholder="Location" clearable style="width:180px;" size="small" />
      <NSelect v-if="activeTab==='rooms'" v-model:value="filterType" :options="typeOptions" placeholder="Type" clearable style="width:150px;" size="small" />
      <NSelect v-if="activeTab==='rooms'" v-model:value="filterStatus" :options="[{label:'Green',value:'green'},{label:'Amber',value:'amber'},{label:'Red',value:'red'}]" placeholder="Status" clearable style="width:120px;" size="small" />
      <NButton type="primary" size="small" @click="showAddRoom=true"><i class="ph ph-plus" style="margin-right:4px;" /> Add Room</NButton>
      <span style="color:#94a3b8;font-size:0.85rem;margin-left:auto;">{{ activeTab==='overdue' ? overdueRooms.length : filteredRooms.length }} rooms</span>
      <NButtonGroup size="small">
        <NButton :type="viewMode==='table'?'primary':'default'" @click="setViewMode('table')"><i class="ph ph-list" /></NButton>
        <NButton :type="viewMode==='cards'?'primary':'default'" @click="setViewMode('cards')"><i class="ph ph-squares-four" /></NButton>
        <NButton :type="viewMode==='compact'?'primary':'default'" @click="setViewMode('compact')"><i class="ph ph-rows" /></NButton>
      </NButtonGroup>
    </NSpace>

    <NSpin :show="store.loading">
      <!-- TABLE -->
      <NDataTable v-if="viewMode==='table'"
        :columns="roomColumns"
        :data="activeTab==='overdue' ? overdueRooms : filteredRooms"
        :row-key="(r: Room) => r.id"
        :row-props="(r: Room) => ({ style:'cursor:pointer;' + (r.isOverdue ? 'background:rgba(239,68,68,0.03);' : ''), onClick: () => openDetail(r.id) })"
        :bordered="false" size="small" striped />

      <!-- CARDS -->
      <div v-else-if="viewMode==='cards'" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        <NCard v-for="r in (activeTab==='overdue' ? overdueRooms : filteredRooms)" :key="r.id" size="small" hoverable style="cursor:pointer;" @click="openDetail(r.id)">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <i class="ph ph-monitor" :style="{ fontSize:'1.8rem', color: r.ragStatus==='green'?'#22c55e':r.ragStatus==='amber'?'#f59e0b':'#ef4444', flexShrink:0 }" />
            <div style="flex:1;">
              <div style="font-weight:600;font-size:1.05rem;margin-bottom:2px;">{{ r.name }}</div>
              <div style="font-size:0.82rem;color:#94a3b8;margin-bottom:8px;">{{ r.location }}{{ r.floor ? ' - Floor ' + r.floor : '' }}</div>
              <NSpace size="small" style="margin-bottom:8px;">
                <NTag :type="({green:'success',amber:'warning',red:'error'} as any)[r.ragStatus]||'default'" size="small" :bordered="false">{{ ({green:'OK',amber:'Limited',red:'Down'} as any)[r.ragStatus] }}</NTag>
                <NTag v-if="r.roomType" size="small" :bordered="false">{{ getRoomTypeLabel(r.roomType) }}</NTag>
                <NTag v-if="r.isOverdue" type="error" size="small" :bordered="false">Overdue</NTag>
              </NSpace>
              <div style="font-size:0.8rem;color:#94a3b8;">{{ freqLabels[r.checkFrequency] }} checks - Last: {{ r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleDateString() : 'Never' }}</div>
            </div>
          </div>
        </NCard>
      </div>

      <!-- COMPACT -->
      <div v-else-if="viewMode==='compact'" style="display:flex;flex-direction:column;gap:6px;">
        <div v-for="r in (activeTab==='overdue' ? overdueRooms : filteredRooms)" :key="r.id" @click="openDetail(r.id)"
          style="display:flex;align-items:center;gap:14px;padding:10px 16px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.06);"
          @mouseenter="($event.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.background='transparent'">
          <i class="ph ph-monitor" :style="{ fontSize:'1.3rem', color: r.ragStatus==='green'?'#22c55e':r.ragStatus==='amber'?'#f59e0b':'#ef4444', flexShrink:0 }" />
          <div style="flex:1;"><div style="font-weight:500;">{{ r.name }}</div><div style="font-size:0.8rem;color:#94a3b8;">{{ r.location }}{{ r.floor ? ' - Floor ' + r.floor : '' }}</div></div>
          <NTag :type="({green:'success',amber:'warning',red:'error'} as any)[r.ragStatus]||'default'" size="small" :bordered="false" style="flex-shrink:0;">{{ ({green:'OK',amber:'Limited',red:'Down'} as any)[r.ragStatus] }}</NTag>
          <NTag v-if="r.isOverdue" type="error" size="small" :bordered="false" style="flex-shrink:0;">Overdue</NTag>
          <span style="width:60px;text-align:right;font-size:0.8rem;color:#94a3b8;flex-shrink:0;">{{ freqLabels[r.checkFrequency] }}</span>
          <NButton size="small" type="primary" quaternary @click.stop="openCheckModal(r.id)" style="flex-shrink:0;"><i class="ph ph-clipboard-text" /></NButton>
        </div>
      </div>
    </NSpin>
  </template>

  <!-- ===================== LOCATIONS TAB ===================== -->
  <template v-if="activeTab === 'locations'">
    <!-- Add location form -->
    <NCard size="small" style="margin-bottom:20px;">
      <NSpace align="center" :wrap="true">
        <NInput v-model:value="newLocForm.name" placeholder="Location name" size="small" style="width:200px;" />
        <NInput v-model:value="newLocForm.address" placeholder="Address" size="small" style="width:180px;" />
        <NInput v-model:value="newLocForm.city" placeholder="City" size="small" style="width:120px;" />
        <NInput v-model:value="newLocForm.state" placeholder="ST" size="small" style="width:60px;" />
        <NButton type="primary" size="small" @click="addLocation"><i class="ph ph-plus" style="margin-right:4px;" /> Add Location</NButton>
      </NSpace>
    </NCard>

    <NCollapse>
      <NCollapseItem v-for="loc in store.locations" :key="loc.id" :name="loc.id">
        <template #header>
          <div style="display:flex;align-items:center;gap:10px;">
            <i class="ph ph-buildings" style="font-size:1.2rem;color:#0ea5e9;" />
            <div>
              <span style="font-weight:500;">{{ loc.name }}</span>
              <span v-if="loc.city" style="color:#94a3b8;margin-left:8px;font-size:0.85rem;">{{ loc.city }}{{ loc.state ? ', ' + loc.state : '' }}</span>
            </div>
            <NTag size="tiny" :bordered="false" style="margin-left:8px;">{{ loc.floorCount }} floors</NTag>
            <NTag size="tiny" :bordered="false">{{ loc.roomCount }} rooms</NTag>
          </div>
        </template>
        <template #header-extra>
          <NButton text size="tiny" @click.stop="removeLocation(loc.id)" style="color:#94a3b8;"><i class="ph ph-trash" /></NButton>
        </template>

        <div style="padding:0 8px;">
          <!-- Floors -->
          <div v-if="locFloors[loc.id]" v-for="floor in locFloors[loc.id]" :key="floor.id"
            style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <div>
              <i class="ph ph-stairs" style="margin-right:4px;" /> Floor {{ floor.name }}
              <span style="color:#94a3b8;font-size:0.85rem;margin-left:8px;">{{ floor.roomCount }} room{{ floor.roomCount !== 1 ? 's' : '' }}</span>
            </div>
            <NButton text size="tiny" @click="removeFloor(floor.id, loc.id)" style="color:#94a3b8;"><i class="ph ph-x" /></NButton>
          </div>
          <div v-if="locFloors[loc.id]?.length === 0" style="color:#94a3b8;font-size:0.85rem;padding:6px 0;">No floors yet</div>
          <div v-if="!locFloors[loc.id]" style="color:#94a3b8;font-size:0.85rem;padding:6px 0;">Loading...</div>

          <!-- Add floor -->
          <NSpace style="margin-top:8px;" align="center">
            <NInput v-model:value="newFloorNames[loc.id]" placeholder="Floor name" size="small" style="width:160px;" @keyup.enter="addFloor(loc.id)" />
            <NButton size="small" @click="addFloor(loc.id)"><i class="ph ph-plus" style="margin-right:4px;" /> Floor</NButton>
          </NSpace>
        </div>
      </NCollapseItem>
    </NCollapse>

    <NEmpty v-if="store.locations.length === 0" description="No locations yet. Add one above." />
  </template>

  <!-- ===================== EQUIPMENT TAB ===================== -->
  <template v-if="activeTab === 'equipment'">
    <NButton size="small" style="margin-bottom:16px;" @click="loadAllEquipment" :loading="allEquipmentLoading">
      <i class="ph ph-arrows-clockwise" style="margin-right:4px;" /> Load All Equipment
    </NButton>
    <NDataTable v-if="allEquipment.length > 0"
      :columns="[
        { title: 'Room', key: 'roomName', sorter: 'default', render: (r: any) => h('div', {}, [h('div', { style:'font-weight:500;' }, r.roomName), h('div', { style:'font-size:0.78rem;color:#94a3b8;' }, r.roomLocation || '')]) },
        { title: 'Category', key: 'category', width: 110, sorter: 'default' },
        { title: 'Make', key: 'make', width: 100, sorter: 'default', render: (r: any) => r.make || '-' },
        { title: 'Model', key: 'model', width: 160, sorter: 'default', render: (r: any) => r.model || '-' },
        { title: 'Serial', key: 'serialNumber', width: 120, render: (r: any) => r.serialNumber || '-' },
        { title: 'Firmware', key: 'firmwareVersion', width: 90, render: (r: any) => r.firmwareVersion || '-' },
        { title: 'Warranty', key: 'warrantyEnd', width: 100, render: (r: any) => r.warrantyEnd ? h('span', { style: new Date(r.warrantyEnd) < new Date() ? 'color:#ef4444;' : '' }, new Date(r.warrantyEnd).toLocaleDateString()) : '-' },
        { title: 'Status', key: 'status', width: 80, render: (r: any) => h(NTag, { type: r.status === 'active' ? 'success' as any : 'error' as any, size: 'small', bordered: false }, () => r.status) },
      ] as DataTableColumns<any>"
      :data="allEquipment" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
    <NEmpty v-else-if="!allEquipmentLoading" description="Click 'Load All Equipment' to view equipment across all rooms" />
  </template>

  <!-- ===================== ADD ROOM MODAL ===================== -->
  <NModal v-model:show="showAddRoom" preset="card" title="Add Room" style="width:520px;">
    <NForm label-placement="top" size="small">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Location" required>
          <NSelect v-model:value="roomForm.locationId" :options="locationOptions" placeholder="Select..." @update:value="(v: number) => loadRoomFloors(v)" />
        </NFormItem>
        <NFormItem label="Floor" required>
          <NSelect v-model:value="roomForm.floorId" :options="roomFloorOptions" placeholder="Select location first..." />
        </NFormItem>
      </div>
      <NFormItem label="Room / Space Name" required><NInput v-model:value="roomForm.name" placeholder="e.g., Conference Room A" /></NFormItem>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Room Type"><NSelect v-model:value="roomForm.roomType" :options="roomTypePresetOptions" placeholder="Select..." clearable /></NFormItem>
        <NFormItem label="Capacity"><NInputNumber v-model:value="roomForm.capacity" :min="1" placeholder="Seats" style="width:100%;" /></NFormItem>
      </div>
      <NFormItem v-if="roomForm.roomType === '__custom'" label="Custom Type"><NInput v-model:value="roomForm.customType" placeholder="e.g., Server Room" /></NFormItem>
      <NFormItem label="Check Frequency"><NSelect v-model:value="roomForm.checkFrequency" :options="freqOptions" /></NFormItem>
    </NForm>
    <template #action><NSpace justify="end"><NButton @click="showAddRoom=false">Cancel</NButton><NButton type="primary" @click="saveRoom">Add Room</NButton></NSpace></template>
  </NModal>

  <!-- ===================== CHECK MODAL ===================== -->
  <NModal v-model:show="showCheckModal" preset="card" title="Record Room Check" style="width:480px;">
    <div v-if="checkRoomId" style="padding:10px 14px;border-radius:6px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.06);">
      <strong>{{ store.rooms.find(r => r.id === checkRoomId)?.name }}</strong>
      <div style="font-size:0.85rem;color:#94a3b8;">{{ store.rooms.find(r => r.id === checkRoomId)?.location }}</div>
    </div>
    <NForm label-placement="top" size="small">
      <NFormItem label="Checked By" required><NInput v-model:value="checkForm.checkedBy" placeholder="Your name" /></NFormItem>
      <NFormItem label="Status" required>
        <NSelect v-model:value="checkForm.ragStatus" :options="[{label:'All Systems Functional',value:'green'},{label:'Issue - Partial',value:'amber'},{label:'Issue - Non-Functional',value:'red'}]" />
      </NFormItem>
      <template v-if="checkForm.ragStatus !== 'green'">
        <NFormItem label="Issue Description" required><NInput v-model:value="checkForm.issueDescription" type="textarea" :rows="3" placeholder="What's wrong..." /></NFormItem>
        <NFormItem label="SNOW Ticket #"><NInput v-model:value="checkForm.ticketNumber" placeholder="INC0012345" /></NFormItem>
      </template>
      <NFormItem label="Notes"><NInput v-model:value="checkForm.notes" type="textarea" :rows="2" /></NFormItem>
    </NForm>
    <template #action><NSpace justify="end"><NButton @click="showCheckModal=false">Cancel</NButton><NButton type="primary" @click="submitCheck">Submit Check</NButton></NSpace></template>
  </NModal>

  <!-- ===================== DETAIL MODAL ===================== -->
  <NModal v-model:show="showDetailModal" preset="card" :title="detailRoom?.name || 'Room'" style="width:640px;">
    <template v-if="detailRoom">
      <div style="color:#94a3b8;font-size:0.9rem;margin-bottom:12px;">{{ detailRoom.location }}{{ detailRoom.floor ? ' - Floor ' + detailRoom.floor : '' }} {{ detailRoom.roomType ? ' - ' + getRoomTypeLabel(detailRoom.roomType) : '' }} {{ detailRoom.capacity ? '(' + detailRoom.capacity + ' seats)' : '' }}</div>

      <NSpace style="margin-bottom:16px;">
        <NTag :type="({green:'success',amber:'warning',red:'error'} as any)[detailRoom.ragStatus]||'default'" size="medium">{{ ({green:'Operational',amber:'Limited',red:'Down'} as any)[detailRoom.ragStatus] }}</NTag>
        <NTag size="medium">{{ freqLabels[detailRoom.checkFrequency] }}</NTag>
        <NTag v-if="detailRoom.isOverdue" type="error" size="medium">Overdue</NTag>
      </NSpace>

      <NTabs type="line" size="small">
        <NTabPane name="history" tab="Check History">
          <NButton type="primary" size="small" style="margin-bottom:12px;" @click="showDetailModal=false;openCheckModal(detailRoom.id)">
            <i class="ph ph-clipboard-text" style="margin-right:4px;" /> Record Check
          </NButton>
          <NSpin :show="loadingDetail">
            <NDataTable v-if="detailHistory.length > 0"
              :columns="[
                { title: 'Date', key: 'checkedAt', width: 140, render: (r: any) => new Date(r.checkedAt).toLocaleString() },
                { title: 'By', key: 'checkedBy', width: 120 },
                { title: 'Status', key: 'ragStatus', width: 80, align: 'center', render: (r: any) => h(NTag, { type: ({green:'success',amber:'warning',red:'error'} as any)[r.ragStatus]||'default', size: 'small', bordered: false }, () => ({green:'OK',amber:'Issue',red:'Down'} as any)[r.ragStatus]) },
                { title: 'Issue / Ticket', key: 'issueDescription', render: (r: any) => h('span', {}, [r.issueFound ? (r.issueDescription || 'Issue noted') : '-', r.ticketNumber ? h('span', { style: 'color:#0ea5e9;margin-left:6px;' }, r.ticketNumber) : null]) },
              ] as DataTableColumns<any>"
              :data="detailHistory.slice(0, 20)" :row-key="(r: any) => r.id" :bordered="false" size="small" />
            <NEmpty v-else-if="!loadingDetail" description="No checks recorded" />
          </NSpin>
        </NTabPane>

        <NTabPane name="equipment" :tab="'Equipment (' + detailEquipment.length + ')'">
          <NButton type="primary" size="small" style="margin-bottom:12px;" @click="openEquipModal(detailRoom.id)">
            <i class="ph ph-plus" style="margin-right:4px;" /> Add Equipment
          </NButton>
          <div v-for="e in detailEquipment" :key="e.id" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <i :class="'ph ' + (categoryIcons[e.category] || 'ph-cube')" style="font-size:1.2rem;color:#0ea5e9;" />
            <div style="flex:1;"><div style="font-weight:500;">{{ e.make }} {{ e.model }}</div><div style="font-size:0.8rem;color:#94a3b8;">{{ e.serialNumber || '' }} {{ e.firmwareVersion ? '- FW ' + e.firmwareVersion : '' }}</div></div>
            <span v-if="e.warrantyEnd" :style="{ fontSize:'0.8rem', color: new Date(e.warrantyEnd) < new Date() ? '#ef4444' : '#94a3b8' }">Warranty: {{ new Date(e.warrantyEnd).toLocaleDateString() }}</span>
          </div>
          <NEmpty v-if="detailEquipment.length === 0" description="No equipment tracked" />
        </NTabPane>
      </NTabs>
    </template>
    <template #action><NSpace justify="end"><NButton @click="showDetailModal=false">Close</NButton><NButton type="primary" @click="showDetailModal=false;openCheckModal(detailRoomId!)">Record Check</NButton></NSpace></template>
  </NModal>

  <!-- ===================== EQUIPMENT MODAL ===================== -->
  <NModal v-model:show="showEquipModal" preset="card" title="Add Equipment" style="width:480px;">
    <NForm label-placement="top" size="small">
      <NFormItem label="Category" required><NSelect v-model:value="equipForm.category" :options="categoryOptions" placeholder="Select..." /></NFormItem>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Make"><NInput v-model:value="equipForm.make" placeholder="e.g., Samsung" /></NFormItem>
        <NFormItem label="Model"><NInput v-model:value="equipForm.model" placeholder="e.g., QM75R" /></NFormItem>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Serial Number"><NInput v-model:value="equipForm.serialNumber" /></NFormItem>
        <NFormItem label="Firmware"><NInput v-model:value="equipForm.firmwareVersion" /></NFormItem>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Install Date"><input v-model="equipForm.installDate" type="date" style="width:100%;padding:6px 10px;border:1px solid #2a2d3e;border-radius:3px;background:#161822;color:#eef0f4;" /></NFormItem>
        <NFormItem label="Warranty End"><input v-model="equipForm.warrantyEnd" type="date" style="width:100%;padding:6px 10px;border:1px solid #2a2d3e;border-radius:3px;background:#161822;color:#eef0f4;" /></NFormItem>
      </div>
    </NForm>
    <template #action><NSpace justify="end"><NButton @click="showEquipModal=false">Cancel</NButton><NButton type="primary" @click="saveEquip">Add</NButton></NSpace></template>
  </NModal>

</div>
</NConfigProvider>
</NMessageProvider>
</template>
