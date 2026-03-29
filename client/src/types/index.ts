// Room types
export const ROOM_TYPE_PRESETS = [
  { value: 'conference', label: 'Conference' },
  { value: 'huddle', label: 'Huddle' },
  { value: 'boardroom', label: 'Boardroom' },
  { value: 'training', label: 'Training' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'community-room', label: 'Community Room' },
  { value: 'office', label: 'Office' },
] as { value: string; label: string }[];

export type CheckFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type RagStatus = 'green' | 'amber' | 'red';

export interface Location {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  floorCount: number;
  roomCount: number;
}

export interface Floor {
  id: number;
  locationId: number;
  name: string;
  sortOrder: number;
  notes?: string;
  roomCount: number;
}

export interface Room {
  id: string;
  name: string;
  roomType?: string;
  capacity?: number;
  checkFrequency: CheckFrequency;
  locationId?: number;
  location?: string;
  floorId?: number;
  floor?: string;
  standardId?: number;
  standardName?: string;
  equipmentCount: number;
  ragStatus: RagStatus;
  issueFound: boolean;
  issueDescription?: string;
  ticketNumber?: string;
  lastCheckedAt?: string;
  lastCheckedBy?: string;
  nextDue?: string;
  isOverdue: boolean;
}

export interface RoomCheck {
  id: number;
  roomId: string;
  checkedBy: string;
  ragStatus: RagStatus;
  issueFound: boolean;
  issueDescription?: string;
  ticketNumber?: string;
  notes?: string;
  checkedAt: string;
}

export interface Equipment {
  id: number;
  roomId: string;
  category: string;
  make?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  installDate?: string;
  warrantyEnd?: string;
  status: string;
  notes?: string;
}

export interface RoomStandard {
  id: number;
  name: string;
  description?: string;
  requiredEquipment: Array<{
    category: string;
    make?: string;
    model?: string;
    qty?: number;
  }>;
}
