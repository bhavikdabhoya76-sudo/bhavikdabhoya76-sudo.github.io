import { promises as fs } from "fs";
import path from "path";
import type { BookingRequest } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.writeFile(BOOKINGS_FILE, "[]\n", "utf8");
  }
}

export async function readBookings(): Promise<BookingRequest[]> {
  await ensureStore();
  const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as BookingRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeBookings(bookings: BookingRequest[]): Promise<void> {
  await ensureStore();
  const tmp = `${BOOKINGS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(bookings, null, 2) + "\n", "utf8");
  await fs.rename(tmp, BOOKINGS_FILE);
}

export async function getBooking(id: string): Promise<BookingRequest | null> {
  const all = await readBookings();
  return all.find((b) => b.id === id) ?? null;
}

export async function upsertBooking(
  booking: BookingRequest,
): Promise<BookingRequest> {
  const all = await readBookings();
  const idx = all.findIndex((b) => b.id === booking.id);
  if (idx >= 0) all[idx] = booking;
  else all.unshift(booking);
  await writeBookings(all);
  return booking;
}

export async function deleteBooking(id: string): Promise<boolean> {
  const all = await readBookings();
  const next = all.filter((b) => b.id !== id);
  if (next.length === all.length) return false;
  await writeBookings(next);
  return true;
}
