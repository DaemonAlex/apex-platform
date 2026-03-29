<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import {
  NInput, NButton, NCard, NSpace, NEmpty, NTag,
  NForm, NFormItem, NSelect, NInputNumber, NDivider,
  useMessage,
} from 'naive-ui';
import { useRoomStore } from '../stores/rooms';
import { ROOM_TYPE_PRESETS } from '../types';
import type { Floor } from '../types';

const msg = useMessage();
const store = useRoomStore();

const searchQuery = ref('');
const floors = ref<Floor[]>([]);
const newLocName = ref('');
const newLocAddress = ref('');
const newLocCity = ref('');
const newLocState = ref('');
const newFloorName = ref('');
const addingRoom = ref(false);

// New room form
const newRoom = ref({
  name: '',
  floorId: null as number | null,
  roomType: null as string | null,
  customType: '',
  capacity: null as number | null,
  checkFrequency: 'weekly',
});

const filteredLocations = computed(() => {
  const q = searchQuery.value.toLowerCase();
  if (!q) return store.locations;
  return store.locations.filter(
    l => l.name.toLowerCase().includes(q) ||
         l.city?.toLowerCase().includes(q) ||
         l.address?.toLowerCase().includes(q)
  );
});

const roomTypeOptions = [
  ...ROOM_TYPE_PRESETS.map(p => ({ label: p.label, value: p.value })),
  { label: 'Other (custom)', value: '__custom' },
];

const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Biweekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
];

onMounted(async () => {
  await store.fetchLocations();
  if (store.locations.length > 0 && !store.selectedLocationId) {
    store.selectedLocationId = store.locations[0].id;
  }
});

watch(() => store.selectedLocationId, async (id) => {
  if (id) {
    floors.value = await store.fetchFloors(id);
    addingRoom.value = false;
  }
});

async function addLocation() {
  if (!newLocName.value.trim()) { msg.error('Location name is required'); return; }
  await store.createLocation({
    name: newLocName.value.trim(),
    address: newLocAddress.value.trim() || undefined,
    city: newLocCity.value.trim() || undefined,
    state: newLocState.value.trim() || undefined,
  });
  msg.success('Location added');
  newLocName.value = '';
  newLocAddress.value = '';
  newLocCity.value = '';
  newLocState.value = '';
  // Select the new location
  store.selectedLocationId = store.locations[store.locations.length - 1]?.id || null;
}

async function removeLocation(id: number) {
  await store.deleteLocation(id);
  msg.success('Location removed');
  if (store.selectedLocationId === id) {
    store.selectedLocationId = store.locations[0]?.id || null;
  }
}

async function addFloor() {
  if (!newFloorName.value.trim() || !store.selectedLocationId) return;
  await store.createFloor(store.selectedLocationId, newFloorName.value.trim(), floors.value.length);
  floors.value = await store.fetchFloors(store.selectedLocationId);
  newFloorName.value = '';
  msg.success('Floor added');
}

async function removeFloor(floorId: number) {
  await store.deleteFloor(floorId);
  if (store.selectedLocationId) {
    floors.value = await store.fetchFloors(store.selectedLocationId);
  }
  msg.success('Floor removed');
}

async function saveRoom() {
  if (!newRoom.value.name.trim()) { msg.error('Room name is required'); return; }
  if (!newRoom.value.floorId) { msg.error('Select a floor'); return; }

  const roomType = newRoom.value.roomType === '__custom'
    ? (newRoom.value.customType.trim().toLowerCase().replace(/\s+/g, '-') || null)
    : newRoom.value.roomType;

  const floor = floors.value.find(f => f.id === newRoom.value.floorId);

  await store.createRoom({
    id: 'room_' + Date.now(),
    name: newRoom.value.name.trim(),
    locationId: store.selectedLocationId,
    location: store.selectedLocation?.name,
    floorId: newRoom.value.floorId,
    floor: floor?.name,
    roomType,
    capacity: newRoom.value.capacity,
    checkFrequency: newRoom.value.checkFrequency,
    scheduleDay: 1,
    scheduleDayName: '',
  });

  msg.success('Room added');
  newRoom.value = { name: '', floorId: null, roomType: null, customType: '', capacity: null, checkFrequency: 'weekly' };
  addingRoom.value = false;

  // Refresh floors to get updated room counts
  if (store.selectedLocationId) {
    floors.value = await store.fetchFloors(store.selectedLocationId);
    await store.fetchLocations();
  }
}

// Rooms for the selected location, grouped by floor
const roomsForLocation = computed(() => {
  if (!store.selectedLocationId) return [];
  return store.rooms.filter(r => r.locationId === store.selectedLocationId);
});

function roomsOnFloor(floorId: number) {
  return roomsForLocation.value.filter(r => r.floorId === floorId);
}
</script>

<template>
  <div style="display: grid; grid-template-columns: 300px 1fr; gap: 24px; height: calc(100vh - 48px);">

    <!-- Left: Location list -->
    <div style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto;">
      <NInput v-model:value="searchQuery" placeholder="Search locations..." clearable>
        <template #prefix><i class="ph ph-magnifying-glass" /></template>
      </NInput>

      <div
        v-for="loc in filteredLocations"
        :key="loc.id"
        @click="store.selectedLocationId = loc.id"
        :style="{
          padding: '12px 16px',
          borderRadius: '8px',
          cursor: 'pointer',
          border: store.selectedLocationId === loc.id ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
          background: store.selectedLocationId === loc.id ? '#f0f9ff' : '#fff',
          transition: 'all 0.15s',
        }"
      >
        <div style="font-weight: 600;">{{ loc.name }}</div>
        <div style="font-size: 0.85rem; color: #64748b; margin-top: 2px;">
          {{ loc.city || '' }}{{ loc.state ? ', ' + loc.state : '' }}
        </div>
        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">
          {{ loc.floorCount }} floor{{ loc.floorCount !== 1 ? 's' : '' }},
          {{ loc.roomCount }} room{{ loc.roomCount !== 1 ? 's' : '' }}
        </div>
      </div>

      <NEmpty v-if="filteredLocations.length === 0" description="No locations found" />

      <!-- Add location form -->
      <NDivider style="margin: 4px 0;" />
      <div style="font-size: 0.85rem; font-weight: 600; color: #64748b;">Add Location</div>
      <NInput v-model:value="newLocName" placeholder="Location name" size="small" />
      <NInput v-model:value="newLocAddress" placeholder="Address" size="small" />
      <div style="display: grid; grid-template-columns: 1fr 60px; gap: 8px;">
        <NInput v-model:value="newLocCity" placeholder="City" size="small" />
        <NInput v-model:value="newLocState" placeholder="ST" size="small" />
      </div>
      <NButton type="primary" size="small" @click="addLocation" block>
        <i class="ph ph-plus" style="margin-right: 4px;" /> Add Location
      </NButton>
    </div>

    <!-- Right: Detail panel -->
    <div v-if="store.selectedLocation" style="overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <h2 style="margin: 0;">{{ store.selectedLocation.name }}</h2>
          <div v-if="store.selectedLocation.address" style="color: #64748b; margin-top: 4px;">
            {{ store.selectedLocation.address }}
            {{ store.selectedLocation.city ? ', ' + store.selectedLocation.city : '' }}
            {{ store.selectedLocation.state ? ' ' + store.selectedLocation.state : '' }}
            {{ store.selectedLocation.zip || '' }}
          </div>
        </div>
        <NButton size="small" type="error" quaternary @click="removeLocation(store.selectedLocation!.id)">
          <i class="ph ph-trash" />
        </NButton>
      </div>

      <!-- Floors + Rooms -->
      <div v-for="floor in floors" :key="floor.id" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 600; color: #334155;">
            <i class="ph ph-stairs" style="margin-right: 4px;" />
            Floor {{ floor.name }}
            <NTag size="small" :bordered="false" type="info" style="margin-left: 8px;">
              {{ floor.roomCount }} room{{ floor.roomCount !== 1 ? 's' : '' }}
            </NTag>
          </div>
          <NButton size="tiny" quaternary type="error" @click="removeFloor(floor.id)">
            <i class="ph ph-x" />
          </NButton>
        </div>

        <!-- Rooms on this floor -->
        <div v-for="room in roomsOnFloor(floor.id)" :key="room.id"
          style="padding: 8px 12px; margin-left: 20px; border-left: 2px solid #e2e8f0; margin-bottom: 4px; font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center;"
        >
          <div>
            <span style="font-weight: 500;">{{ room.name }}</span>
            <span v-if="room.roomType" style="color: #94a3b8; margin-left: 8px;">{{ room.roomType }}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <NTag v-if="room.isOverdue" type="error" size="small" :bordered="false">Overdue</NTag>
            <i class="ph-fill ph-circle" :style="{ color: room.ragStatus === 'green' ? '#22c55e' : room.ragStatus === 'amber' ? '#f59e0b' : '#ef4444', fontSize: '0.6rem' }" />
          </div>
        </div>

        <div v-if="roomsOnFloor(floor.id).length === 0"
          style="padding: 8px 12px; margin-left: 20px; border-left: 2px solid #e2e8f0; color: #94a3b8; font-size: 0.85rem;"
        >
          No rooms on this floor
        </div>
      </div>

      <!-- Add floor inline -->
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 20px;">
        <NInput v-model:value="newFloorName" placeholder="Floor name (e.g., 1, Basement, Mezzanine)" size="small" style="width: 280px;" @keyup.enter="addFloor" />
        <NButton size="small" @click="addFloor"><i class="ph ph-plus" style="margin-right: 4px;" /> Add Floor</NButton>
      </div>

      <NDivider />

      <!-- Add room inline -->
      <div v-if="!addingRoom">
        <NButton type="primary" @click="addingRoom = true">
          <i class="ph ph-plus" style="margin-right: 4px;" /> Add Room to {{ store.selectedLocation.name }}
        </NButton>
      </div>

      <NCard v-else title="Add Room" size="small" style="max-width: 500px;">
        <NForm label-placement="top" size="small">
          <NFormItem label="Floor" required>
            <NSelect
              v-model:value="newRoom.floorId"
              :options="floors.map(f => ({ label: 'Floor ' + f.name, value: f.id }))"
              placeholder="Select floor"
            />
          </NFormItem>
          <NFormItem label="Room / Space Name" required>
            <NInput v-model:value="newRoom.name" placeholder="e.g., Conference Room A" />
          </NFormItem>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <NFormItem label="Room Type">
              <NSelect v-model:value="newRoom.roomType" :options="roomTypeOptions" placeholder="Select type" clearable />
            </NFormItem>
            <NFormItem label="Capacity (seats)">
              <NInputNumber v-model:value="newRoom.capacity" :min="1" placeholder="e.g., 12" style="width: 100%;" />
            </NFormItem>
          </div>
          <NFormItem v-if="newRoom.roomType === '__custom'" label="Custom Type">
            <NInput v-model:value="newRoom.customType" placeholder="e.g., Server Room" />
          </NFormItem>
          <NFormItem label="Check Frequency">
            <NSelect v-model:value="newRoom.checkFrequency" :options="frequencyOptions" />
          </NFormItem>
          <NSpace>
            <NButton type="primary" @click="saveRoom"><i class="ph ph-plus" style="margin-right: 4px;" /> Add Room</NButton>
            <NButton @click="addingRoom = false">Cancel</NButton>
          </NSpace>
        </NForm>
      </NCard>
    </div>

    <NEmpty v-else description="Select a location to manage its floors and rooms" style="grid-column: 2;" />
  </div>
</template>
