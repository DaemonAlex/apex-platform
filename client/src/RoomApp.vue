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
import VendorsTab from './components/projects/VendorsTab.vue';

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
const roomForm = ref({ name: '', locationId: null as number | null, floorId: null as number | null, roomType: null as string | null, customType: '', capacity: null as number | null, checkFrequency: 'weekly', standardId: null as number | null });
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
const detailTech = ref<any>(null);
const detailDocs = ref<any[]>([]);
const techSaving = ref(false);
const techEditing = ref(false);
const techForm = ref({
  platform: null as string | null,
  platformVersion: '',
  ciscoWorkspaceId: '',
  ciscoActivationCode: '',
  ciscoDeviceSerial: '',
  ciscoRegistrationStatus: null as string | null,
  networkJacks: [] as any[],
  devices: [] as any[],
  vlan: '',
  switchName: '',
  switchPort: '',
  poeStatus: null as string | null,
  wifiSsid: '',
  notes: '',
});

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
  await Promise.all([store.fetchRooms(), store.fetchLocations(), store.fetchStandards()]);
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
    const [hist, equip, tech, docs] = await Promise.all([
      store.fetchCheckHistory(roomId),
      store.fetchEquipment(roomId),
      store.fetchTechDetails(roomId),
      store.fetchDocuments('room', roomId),
    ]);
    detailHistory.value = hist;
    detailEquipment.value = equip;
    detailTech.value = tech;
    detailDocs.value = docs;
    techEditing.value = false;
    // Populate tech form
    if (tech) {
      techForm.value = {
        platform: tech.platform, platformVersion: tech.platformVersion || '',
        ciscoWorkspaceId: tech.ciscoWorkspaceId || '', ciscoActivationCode: tech.ciscoActivationCode || '',
        ciscoDeviceSerial: tech.ciscoDeviceSerial || '', ciscoRegistrationStatus: tech.ciscoRegistrationStatus,
        networkJacks: tech.networkJacks || [], devices: tech.devices || [],
        vlan: tech.vlan || '', switchName: tech.switchName || '', switchPort: tech.switchPort || '',
        poeStatus: tech.poeStatus, wifiSsid: tech.wifiSsid || '', notes: tech.notes || '',
      };
    }
  } catch (e) { detailHistory.value = []; detailEquipment.value = []; detailTech.value = null; detailDocs.value = []; }
  finally { loadingDetail.value = false; }
}
const detailRoom = computed(() => store.rooms.find(r => r.id === detailRoomId.value));

async function saveTech() {
  if (!detailRoomId.value) return;
  techSaving.value = true;
  try {
    await store.saveTechDetails(detailRoomId.value, techForm.value);
    detailTech.value = await store.fetchTechDetails(detailRoomId.value);
    techEditing.value = false;
    msg.success('Tech details saved');
  } catch (e: any) { msg.error(e.message || 'Failed to save'); }
  finally { techSaving.value = false; }
}

const platformLabels: Record<string, string> = { roomos: 'Cisco RoomOS', mtr: 'Microsoft Teams Rooms', zoom: 'Zoom Rooms', hybrid: 'Hybrid', other: 'Other' };
const regLabels: Record<string, string> = { registered: 'Registered', pending: 'Pending', offline: 'Offline', deactivated: 'Deactivated' };
const poeLabels: Record<string, string> = { active: 'Active', inactive: 'Inactive', na: 'N/A' };

function addNetworkJack() {
  techForm.value.networkJacks.push({ jackId: '', location: '', vlan: '', status: 'active' });
}

function removeNetworkJack(i: number) {
  techForm.value.networkJacks.splice(i, 1);
}

function addDevice() {
  techForm.value.devices.push({ name: '', ip: '', mac: '', port: '', notes: '' });
}

function removeDevice(i: number) {
  techForm.value.devices.splice(i, 1);
}

async function uploadDoc(file: File) {
  if (!detailRoomId.value) return;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('docType', 'other');
  const token = localStorage.getItem('apex_token');
  const res = await fetch(`/api/room-status/documents/room/${detailRoomId.value}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  detailDocs.value = await store.fetchDocuments('room', detailRoomId.value);
  msg.success('Document uploaded');
}

async function deleteDoc(docId: number) {
  await store.deleteDocument(docId);
  if (detailRoomId.value) detailDocs.value = await store.fetchDocuments('room', detailRoomId.value);
}

function downloadDoc(docId: number) {
  const token = localStorage.getItem('apex_token');
  window.open(`/api/room-status/documents/download/${docId}?token=${token}`, '_blank');
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

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
    standardId: roomForm.value.standardId,
    scheduleDay: 1, scheduleDayName: '',
  });
  showAddRoom.value = false;
  roomForm.value = { name: '', locationId: null, floorId: null, roomType: null, customType: '', capacity: null, checkFrequency: 'weekly', standardId: null };
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

// Standard options
const standardOptions = computed(() => store.standards.map(s => ({ label: s.name, value: s.id })));

// Edit room
const showEditRoom = ref(false);
const editRoomId = ref<string | null>(null);
const editForm = ref({ name: '', roomType: null as string | null, capacity: null as number | null, locationId: null as number | null, floorId: null as number | null, standardId: null as number | null, checkFrequency: 'weekly' });
const editFloorOptions = ref<{ label: string; value: number }[]>([]);

async function loadEditFloors(locId: number) {
  const floors = await store.fetchFloors(locId);
  editFloorOptions.value = floors.map(f => ({ label: 'Floor ' + f.name, value: f.id }));
}

function openEditRoom(room: any) {
  editRoomId.value = room.id;
  editForm.value = {
    name: room.name,
    roomType: room.roomType,
    capacity: room.capacity,
    locationId: room.locationId,
    floorId: room.floorId,
    standardId: room.standardId,
    checkFrequency: room.checkFrequency || 'weekly',
  };
  if (room.locationId) loadEditFloors(room.locationId);
  showEditRoom.value = true;
}

async function saveEditRoom() {
  if (!editRoomId.value || !editForm.value.name.trim()) { msg.error('Name is required'); return; }
  await store.updateRoom(editRoomId.value, {
    name: editForm.value.name.trim(),
    roomType: editForm.value.roomType,
    capacity: editForm.value.capacity,
    locationId: editForm.value.locationId,
    floorId: editForm.value.floorId,
    standardId: editForm.value.standardId,
    checkFrequency: editForm.value.checkFrequency,
  });
  showEditRoom.value = false;
  msg.success('Room updated');
}

// Calendar
const calendarMonth = ref(new Date());

const calendarDays = computed(() => {
  const year = calendarMonth.value.getFullYear();
  const month = calendarMonth.value.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: { date: number; rooms: any[] }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const due = store.rooms.filter(r => {
      if (!r.nextDue) return false;
      return r.nextDue.startsWith(dateStr);
    });
    days.push({ date: d, rooms: due });
  }
  return { firstDay, days };
});

const calendarMonthLabel = computed(() => calendarMonth.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

// Theme
const { naiveTheme, themeOverrides, colors } = useTheme();
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
    <NTabPane name="calendar" tab="Check Calendar" />
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
            style="border-bottom:1px solid rgba(255,255,255,0.05);padding:6px 0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <i class="ph ph-stairs" style="margin-right:4px;" /> Floor {{ floor.name }}
                <span style="color:#94a3b8;font-size:0.85rem;margin-left:8px;">{{ floor.roomCount }} room{{ floor.roomCount !== 1 ? 's' : '' }}</span>
              </div>
              <NButton text size="tiny" @click="removeFloor(floor.id, loc.id)" style="color:#94a3b8;"><i class="ph ph-x" /></NButton>
            </div>
            <!-- Rooms on this floor -->
            <div v-for="room in store.rooms.filter(r => r.floorId === floor.id)" :key="room.id"
              style="margin-left:24px;padding:4px 8px;font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;">
              <span><i class="ph ph-monitor" style="margin-right:4px;color:#0ea5e9;" />{{ room.name }} <span style="color:#94a3b8;font-size:0.78rem;">{{ room.roomType || '' }}</span></span>
              <NSpace size="small">
                <NButton text size="tiny" @click="openEditRoom(room)" style="color:#94a3b8;"><i class="ph ph-pencil" /></NButton>
                <NButton text size="tiny" @click="store.deleteRoom(room.id)" style="color:#94a3b8;"><i class="ph ph-trash" /></NButton>
              </NSpace>
            </div>
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

  <!-- ===================== CALENDAR TAB ===================== -->
  <template v-if="activeTab === 'calendar'">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <NButton size="small" @click="calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1)"><i class="ph ph-caret-left" /></NButton>
      <span style="font-weight:600;font-size:1.1rem;">{{ calendarMonthLabel }}</span>
      <NButton size="small" @click="calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1)"><i class="ph ph-caret-right" /></NButton>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;">
      <div v-for="d in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="d" style="padding:8px;text-align:center;font-weight:600;font-size:0.8rem;color:#94a3b8;">{{ d }}</div>
      <div v-for="_ in calendarDays.firstDay" :key="'e'+_" style="padding:8px;min-height:80px;"></div>
      <div v-for="day in calendarDays.days" :key="day.date" :style="{ padding: '6px', minHeight: '80px', background: day.rooms.length > 0 ? 'rgba(56,189,248,0.04)' : 'transparent', borderLeft: day.date === new Date().getDate() && calendarMonth.getMonth() === new Date().getMonth() && calendarMonth.getFullYear() === new Date().getFullYear() ? '2px solid #38bdf8' : 'none' }">
        <div style="font-size:0.8rem;font-weight:600;margin-bottom:4px;">{{ day.date }}</div>
        <div v-for="r in day.rooms.slice(0,3)" :key="r.id" style="font-size:0.7rem;padding:2px 4px;border-radius:3px;margin-bottom:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" :style="{ background: r.isOverdue ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.1)', color: r.isOverdue ? '#ef4444' : '#38bdf8' }" @click="openCheckModal(r.id)">
          {{ r.name }}
        </div>
        <div v-if="day.rooms.length > 3" style="font-size:0.65rem;color:#94a3b8;">+{{ day.rooms.length - 3 }} more</div>
      </div>
    </div>
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Check Frequency"><NSelect v-model:value="roomForm.checkFrequency" :options="freqOptions" /></NFormItem>
        <NFormItem label="Room Standard"><NSelect v-model:value="roomForm.standardId" :options="standardOptions" placeholder="Select standard..." clearable /></NFormItem>
      </div>
    </NForm>
    <template #action><NSpace justify="end"><NButton @click="showAddRoom=false">Cancel</NButton><NButton type="primary" @click="saveRoom">Add Room</NButton></NSpace></template>
  </NModal>

  <!-- ===================== EDIT ROOM MODAL ===================== -->
  <NModal v-model:show="showEditRoom" preset="card" title="Edit Room" style="width:520px;">
    <NForm label-placement="top" size="small">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Location"><NSelect v-model:value="editForm.locationId" :options="locationOptions" @update:value="(v: number) => loadEditFloors(v)" /></NFormItem>
        <NFormItem label="Floor"><NSelect v-model:value="editForm.floorId" :options="editFloorOptions" placeholder="Select..." /></NFormItem>
      </div>
      <NFormItem label="Room Name" required><NInput v-model:value="editForm.name" /></NFormItem>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Room Type"><NSelect v-model:value="editForm.roomType" :options="roomTypePresetOptions" clearable /></NFormItem>
        <NFormItem label="Capacity"><NInputNumber v-model:value="editForm.capacity" :min="1" style="width:100%;" /></NFormItem>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Check Frequency"><NSelect v-model:value="editForm.checkFrequency" :options="freqOptions" /></NFormItem>
        <NFormItem label="Room Standard"><NSelect v-model:value="editForm.standardId" :options="standardOptions" clearable /></NFormItem>
      </div>
    </NForm>
    <template #action><NSpace justify="end"><NButton @click="showEditRoom=false">Cancel</NButton><NButton type="primary" @click="saveEditRoom">Save Changes</NButton></NSpace></template>
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
  <NModal v-model:show="showDetailModal" preset="card" :title="detailRoom?.name || 'Room'" style="width:800px;">
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

        <NTabPane name="tech" tab="Tech Sheet">
          <!-- VIEW MODE -->
          <div v-if="!techEditing">
            <NSpace justify="end" style="margin-bottom:12px;">
              <NButton size="small" @click="techEditing = true"><i class="ph ph-pencil" style="margin-right:4px;" /> Edit</NButton>
            </NSpace>

            <div v-if="detailTech?.platform || detailTech?.devices?.length || detailTech?.networkJacks?.length" style="font-size:0.9rem;">
              <!-- Platform & Cisco -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:16px;">
                <div v-if="detailTech.platform"><span style="color:#94a3b8;">Platform:</span> <strong>{{ platformLabels[detailTech.platform] || detailTech.platform }}</strong></div>
                <div v-if="detailTech.platformVersion"><span style="color:#94a3b8;">Version:</span> {{ detailTech.platformVersion }}</div>
                <div v-if="detailTech.ciscoDeviceSerial"><span style="color:#94a3b8;">Serial:</span> <code>{{ detailTech.ciscoDeviceSerial }}</code></div>
                <div v-if="detailTech.ciscoWorkspaceId"><span style="color:#94a3b8;">Workspace ID:</span> <code>{{ detailTech.ciscoWorkspaceId }}</code></div>
                <div v-if="detailTech.ciscoRegistrationStatus"><span style="color:#94a3b8;">Registration:</span> <NTag :type="detailTech.ciscoRegistrationStatus === 'registered' ? 'success' : 'warning'" size="small" :bordered="false">{{ regLabels[detailTech.ciscoRegistrationStatus] }}</NTag></div>
                <div v-if="detailTech.ciscoActivationCode"><span style="color:#94a3b8;">Activation:</span> <code>{{ detailTech.ciscoActivationCode }}</code></div>
              </div>

              <!-- Network -->
              <div v-if="detailTech.vlan || detailTech.switchName" style="margin-bottom:16px;">
                <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;"><i class="ph ph-plugs-connected" style="margin-right:4px;" />Network</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;">
                  <div v-if="detailTech.vlan"><span style="color:#94a3b8;">VLAN:</span> {{ detailTech.vlan }}</div>
                  <div v-if="detailTech.switchName"><span style="color:#94a3b8;">Switch:</span> {{ detailTech.switchName }}</div>
                  <div v-if="detailTech.switchPort"><span style="color:#94a3b8;">Port:</span> {{ detailTech.switchPort }}</div>
                  <div v-if="detailTech.poeStatus"><span style="color:#94a3b8;">PoE:</span> {{ poeLabels[detailTech.poeStatus] || detailTech.poeStatus }}</div>
                </div>
                <div v-if="detailTech.wifiSsid" style="margin-top:4px;"><span style="color:#94a3b8;">Wi-Fi:</span> {{ detailTech.wifiSsid }}</div>
              </div>

              <!-- Jacks -->
              <div v-if="detailTech.networkJacks?.length" style="margin-bottom:16px;">
                <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;"><i class="ph ph-plug" style="margin-right:4px;" />Network Jacks ({{ detailTech.networkJacks.length }})</div>
                <div v-for="(j, i) in detailTech.networkJacks" :key="i" style="display:grid;grid-template-columns:80px 1fr 80px 80px;gap:8px;padding:4px 0;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                  <code>{{ j.jackId }}</code>
                  <span>{{ j.location }}</span>
                  <span style="color:#94a3b8;">VLAN {{ j.vlan }}</span>
                  <NTag :type="j.status === 'active' ? 'success' : 'error'" size="small" :bordered="false">{{ j.status }}</NTag>
                </div>
              </div>

              <!-- Devices -->
              <div v-if="detailTech.devices?.length" style="margin-bottom:16px;">
                <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;"><i class="ph ph-desktop-tower" style="margin-right:4px;" />Network Devices ({{ detailTech.devices.length }})</div>
                <div v-for="(d, i) in detailTech.devices" :key="i" style="display:grid;grid-template-columns:1fr 120px 140px 100px;gap:8px;padding:4px 0;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04);">
                  <span style="font-weight:500;">{{ d.name }}</span>
                  <code>{{ d.ip }}</code>
                  <code style="font-size:0.78rem;">{{ d.mac }}</code>
                  <span style="color:#94a3b8;">{{ d.port }}</span>
                </div>
              </div>

              <!-- Notes -->
              <div v-if="detailTech.notes" style="margin-top:8px;white-space:pre-wrap;color:#c0c6d4;font-size:0.85rem;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">{{ detailTech.notes }}</div>
            </div>
            <div v-else style="text-align:center;padding:24px;color:#94a3b8;">
              <i class="ph ph-clipboard-text" style="font-size:2rem;display:block;margin-bottom:8px;" />
              No technical details recorded. Click Edit to add platform, network, and device info.
            </div>
          </div>

          <!-- EDIT MODE -->
          <div v-else>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <NFormItem label="Platform" size="small">
              <NSelect v-model:value="techForm.platform" :options="[
                {label:'Cisco RoomOS',value:'roomos'},{label:'Microsoft Teams Rooms',value:'mtr'},
                {label:'Zoom Rooms',value:'zoom'},{label:'Hybrid',value:'hybrid'},{label:'Other',value:'other'}
              ]" placeholder="Select..." clearable />
            </NFormItem>
            <NFormItem label="Platform Version" size="small">
              <NInput v-model:value="techForm.platformVersion" placeholder="e.g., RoomOS 11.5" />
            </NFormItem>
          </div>

          <!-- Cisco Fields -->
          <div v-if="techForm.platform === 'roomos' || techForm.platform === 'mtr'" style="margin-bottom:16px;">
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px;"><i class="ph ph-monitor" style="margin-right:4px;" />Cisco Device Info</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <NFormItem label="Serial Number" size="small"><NInput v-model:value="techForm.ciscoDeviceSerial" placeholder="FOC..." /></NFormItem>
              <NFormItem label="Workspace ID" size="small"><NInput v-model:value="techForm.ciscoWorkspaceId" placeholder="Webex workspace ID" /></NFormItem>
              <NFormItem label="Activation Code" size="small"><NInput v-model:value="techForm.ciscoActivationCode" /></NFormItem>
              <NFormItem label="Registration" size="small">
                <NSelect v-model:value="techForm.ciscoRegistrationStatus" :options="[
                  {label:'Registered',value:'registered'},{label:'Pending',value:'pending'},
                  {label:'Offline',value:'offline'},{label:'Deactivated',value:'deactivated'}
                ]" clearable />
              </NFormItem>
            </div>
          </div>

          <!-- Network -->
          <div style="margin-bottom:16px;">
            <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px;"><i class="ph ph-plugs-connected" style="margin-right:4px;" />Network</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
              <NFormItem label="VLAN" size="small"><NInput v-model:value="techForm.vlan" placeholder="100" /></NFormItem>
              <NFormItem label="Switch" size="small"><NInput v-model:value="techForm.switchName" placeholder="SW-FL3-01" /></NFormItem>
              <NFormItem label="Port" size="small"><NInput v-model:value="techForm.switchPort" placeholder="Gi1/0/12" /></NFormItem>
              <NFormItem label="PoE" size="small">
                <NSelect v-model:value="techForm.poeStatus" :options="[{label:'Active',value:'active'},{label:'Inactive',value:'inactive'},{label:'N/A',value:'na'}]" clearable />
              </NFormItem>
            </div>
            <NFormItem label="Wi-Fi SSID" size="small"><NInput v-model:value="techForm.wifiSsid" placeholder="Corp-AV" /></NFormItem>
          </div>

          <!-- Network Jacks -->
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:600;font-size:0.85rem;"><i class="ph ph-plug" style="margin-right:4px;" />Network Jacks</span>
              <NButton size="tiny" @click="addNetworkJack"><i class="ph ph-plus" style="margin-right:4px;" /> Jack</NButton>
            </div>
            <div v-for="(jack, i) in techForm.networkJacks" :key="i" style="display:grid;grid-template-columns:80px 1fr 80px 80px 24px;gap:8px;align-items:center;margin-bottom:6px;">
              <NInput v-model:value="jack.jackId" placeholder="J1-A" size="small" />
              <NInput v-model:value="jack.location" placeholder="North wall" size="small" />
              <NInput v-model:value="jack.vlan" placeholder="VLAN" size="small" />
              <NSelect v-model:value="jack.status" :options="[{label:'Active',value:'active'},{label:'Dead',value:'dead'}]" size="small" />
              <NButton text size="tiny" @click="removeNetworkJack(i)" style="color:#94a3b8;"><i class="ph ph-x" /></NButton>
            </div>
          </div>

          <!-- Devices (IP/MAC) -->
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:600;font-size:0.85rem;"><i class="ph ph-desktop-tower" style="margin-right:4px;" />Network Devices</span>
              <NButton size="tiny" @click="addDevice"><i class="ph ph-plus" style="margin-right:4px;" /> Device</NButton>
            </div>
            <div v-for="(dev, i) in techForm.devices" :key="i" style="display:grid;grid-template-columns:1fr 120px 140px 100px 24px;gap:8px;align-items:center;margin-bottom:6px;">
              <NInput v-model:value="dev.name" placeholder="Device name" size="small" />
              <NInput v-model:value="dev.ip" placeholder="10.1.5.20" size="small" />
              <NInput v-model:value="dev.mac" placeholder="00:1B:44:..." size="small" />
              <NInput v-model:value="dev.port" placeholder="Gi1/0/12" size="small" />
              <NButton text size="tiny" @click="removeDevice(i)" style="color:#94a3b8;"><i class="ph ph-x" /></NButton>
            </div>
          </div>

          <NFormItem label="Notes" size="small"><NInput v-model:value="techForm.notes" type="textarea" :rows="2" placeholder="Additional technical notes..." /></NFormItem>

          <NSpace justify="end" style="margin-top:12px;">
            <NButton @click="techEditing = false">Cancel</NButton>
            <NButton type="primary" :loading="techSaving" @click="saveTech">Save Tech Sheet</NButton>
          </NSpace>
          </div>
        </NTabPane>

        <NTabPane name="docs" :tab="'Documents (' + detailDocs.length + ')'">
          <div style="margin-bottom:12px;">
            <NButton size="small" @click="($refs.fileInput as HTMLInputElement)?.click()">
              <i class="ph ph-upload" style="margin-right:4px;" /> Upload Document
            </NButton>
            <input ref="fileInput" type="file" style="display:none;" @change="(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadDoc(f); }" />
          </div>
          <div v-for="doc in detailDocs" :key="doc.id"
            style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <i :class="'ph ' + (doc.mimeType?.startsWith('image') ? 'ph-image' : doc.mimeType?.includes('pdf') ? 'ph-file-pdf' : 'ph-file')" style="font-size:1.3rem;color:#0ea5e9;" />
            <div style="flex:1;">
              <div style="font-weight:500;font-size:0.9rem;">{{ doc.originalName }}</div>
              <div style="font-size:0.78rem;color:#94a3b8;">
                {{ formatFileSize(doc.fileSize) }} - {{ doc.uploadedBy || 'Unknown' }} - {{ new Date(doc.createdAt).toLocaleDateString() }}
              </div>
            </div>
            <NSpace size="small">
              <NButton text size="tiny" @click="downloadDoc(doc.id)" style="color:#0ea5e9;"><i class="ph ph-download" /></NButton>
              <NButton text size="tiny" @click="deleteDoc(doc.id)" style="color:#94a3b8;"><i class="ph ph-trash" /></NButton>
            </NSpace>
          </div>
          <NEmpty v-if="detailDocs.length === 0" description="No documents uploaded" />
        </NTabPane>

        <NTabPane name="vendors" tab="Vendors">
          <VendorsTab v-if="detailRoomId" entity-type="room" :entity-id="detailRoomId" />
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
        <NFormItem label="Install Date"><input v-model="equipForm.installDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" /></NFormItem>
        <NFormItem label="Warranty End"><input v-model="equipForm.warrantyEnd" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" /></NFormItem>
      </div>
    </NForm>
    <template #action><NSpace justify="end"><NButton @click="showEquipModal=false">Cancel</NButton><NButton type="primary" @click="saveEquip">Add</NButton></NSpace></template>
  </NModal>

</div>
</NConfigProvider>
</NMessageProvider>
</template>
