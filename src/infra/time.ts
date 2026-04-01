export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function addMinutes(input: Date, minutes: number): Date {
  return new Date(input.getTime() + minutes * 60_000);
}

export function toIsoString(input: Date): string {
  return input.toISOString();
}
