import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const POS_DEVICE_COOKIE = "ego_pos_device";

function validDeviceId(value: string) {
  return /^[a-f0-9]{32}$/.test(value);
}

export async function readPosDeviceId() {
  const jar = await cookies();
  const value = jar.get(POS_DEVICE_COOKIE)?.value ?? "";
  return validDeviceId(value) ? value : "";
}

export async function ensurePosDeviceId() {
  const current = await readPosDeviceId();
  if (current) return current;
  const id = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(POS_DEVICE_COOKIE, id, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
    sameSite: "lax",
    secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  });
  return id;
}
