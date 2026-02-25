export interface TimerCardData {
  targetDate: string; // ISO 8601 string
  label: string; // e.g. "Earnings Report"
  color: string; // accent color hex
}

export interface TimeRemaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

export function createDefaultTimerData(): TimerCardData {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return {
    targetDate: tomorrow.toISOString(),
    label: 'Deadline',
    color: '#3b82f6',
  };
}

export function getTimeRemaining(targetDate: string): TimeRemaining {
  const total = new Date(targetDate).getTime() - Date.now();

  if (total <= 0) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }

  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return { total, days, hours, minutes, seconds, isPast: false };
}
