import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiFetch } from '../composables/useApi';
import type { Location, Floor, Room, RoomCheck, Equipment, RoomStandard } from '../types';

export const useRoomStore = defineStore('rooms', () => {
  // State
  const locations = ref<Location[]>([]);
  const rooms = ref<Room[]>([]);
  const standards = ref<RoomStandard[]>([]);
  const loading = ref(false);
  const selectedLocationId = ref<number | null>(null);
  const selectedRoomId = ref<string | null>(null);

  // Computed
  const selectedLocation = computed(() =>
    locations.value.find(l => l.id === selectedLocationId.value) || null
  );

  const selectedRoom = computed(() =>
    rooms.value.find(r => r.id === selectedRoomId.value) || null
  );

  const roomsByLocation = computed(() => {
    if (!selectedLocationId.value) return rooms.value;
    return rooms.value.filter(r => r.locationId === selectedLocationId.value);
  });

  const stats = computed(() => ({
    total: rooms.value.length,
    green: rooms.value.filter(r => r.ragStatus === 'green').length,
    amber: rooms.value.filter(r => r.ragStatus === 'amber').length,
    red: rooms.value.filter(r => r.ragStatus === 'red').length,
    overdue: rooms.value.filter(r => r.isOverdue).length,
    equipment: rooms.value.reduce((sum, r) => sum + (r.equipmentCount || 0), 0),
  }));

  // Actions
  async function fetchRooms() {
    loading.value = true;
    try {
      const data = await apiFetch<{ rooms: Room[] }>('/room-status');
      rooms.value = data.rooms;
    } finally {
      loading.value = false;
    }
  }

  async function fetchLocations() {
    const data = await apiFetch<{ locations: Location[] }>('/room-status/locations/list');
    locations.value = data.locations;
  }

  async function fetchStandards() {
    const data = await apiFetch<{ standards: RoomStandard[] }>('/room-status/standards/list');
    standards.value = data.standards;
  }

  async function fetchFloors(locationId: number): Promise<Floor[]> {
    const data = await apiFetch<{ floors: Floor[] }>(`/room-status/locations/${locationId}/floors`);
    return data.floors;
  }

  async function createLocation(loc: Partial<Location>) {
    await apiFetch('/room-status/locations', { method: 'POST', body: JSON.stringify(loc) });
    await fetchLocations();
  }

  async function deleteLocation(id: number) {
    await apiFetch(`/room-status/locations/${id}`, { method: 'DELETE' });
    await fetchLocations();
  }

  async function createFloor(locationId: number, name: string, sortOrder = 0) {
    await apiFetch(`/room-status/locations/${locationId}/floors`, {
      method: 'POST',
      body: JSON.stringify({ name, sortOrder }),
    });
  }

  async function deleteFloor(floorId: number) {
    await apiFetch(`/room-status/floors/${floorId}`, { method: 'DELETE' });
  }

  async function createRoom(room: Record<string, any>) {
    await apiFetch('/room-status', { method: 'POST', body: JSON.stringify({ room }) });
    await fetchRooms();
    await fetchLocations();
  }

  async function updateRoom(roomId: string, data: Record<string, any>) {
    await apiFetch(`/room-status/${roomId}`, { method: 'PUT', body: JSON.stringify(data) });
    await fetchRooms();
  }

  async function deleteRoom(roomId: string) {
    await apiFetch(`/room-status/${roomId}`, { method: 'DELETE' });
    await fetchRooms();
    await fetchLocations();
  }

  async function submitCheck(roomId: string, checkData: Record<string, any>) {
    await apiFetch('/room-status', {
      method: 'POST',
      body: JSON.stringify({ checkData: { roomId, ...checkData } }),
    });
    await fetchRooms();
  }

  async function fetchCheckHistory(roomId: string): Promise<RoomCheck[]> {
    const data = await apiFetch<{ history: RoomCheck[] }>(`/room-status/${roomId}/history`);
    return data.history;
  }

  async function fetchEquipment(roomId: string): Promise<Equipment[]> {
    const data = await apiFetch<{ equipment: Equipment[] }>(`/room-status/${roomId}/equipment`);
    return data.equipment;
  }

  async function addEquipment(roomId: string, equipment: Record<string, any>) {
    await apiFetch(`/room-status/${roomId}/equipment`, {
      method: 'POST',
      body: JSON.stringify(equipment),
    });
  }

  async function fetchTechDetails(roomId: string) {
    return apiFetch<any>(`/room-status/${roomId}/tech`);
  }

  async function saveTechDetails(roomId: string, data: Record<string, any>) {
    return apiFetch<any>(`/room-status/${roomId}/tech`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async function fetchDocuments(entityType: string, entityId: string) {
    const data = await apiFetch<{ documents: any[] }>(`/room-status/documents/${entityType}/${entityId}`);
    return data.documents;
  }

  async function deleteDocument(docId: number) {
    await apiFetch(`/room-status/documents/${docId}`, { method: 'DELETE' });
  }

  return {
    // State
    locations, rooms, standards, loading,
    selectedLocationId, selectedRoomId,
    // Computed
    selectedLocation, selectedRoom, roomsByLocation, stats,
    // Actions
    fetchRooms, fetchLocations, fetchStandards, fetchFloors,
    createLocation, deleteLocation, createFloor, deleteFloor,
    createRoom, updateRoom, deleteRoom, submitCheck, fetchCheckHistory, fetchEquipment, addEquipment,
    fetchTechDetails, saveTechDetails, fetchDocuments, deleteDocument,
  };
});
