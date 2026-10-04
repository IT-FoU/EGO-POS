"use server";

import {
  createStoreSupportTicket,
  getStoreSupportTicket,
  listStoreSupportTickets,
  rejectStoreStatusChange,
  replyStoreSupportTicket,
} from "@/features/support/support-service";
import { READ_PERMISSIONS, WRITE_PERMISSIONS, requireReadPermission, requireWritePermission } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";

export async function listSupportTicketsAction(filter?: { status?: string; type?: string }) {
  try {
    return writeSuccess(await listStoreSupportTickets(await requireReadPermission(READ_PERMISSIONS.helpView), filter));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function getSupportTicketAction(ticketId: string) {
  try {
    return writeSuccess(await getStoreSupportTicket(await requireReadPermission(READ_PERMISSIONS.helpView), ticketId));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function createSupportTicketAction(input: Record<string, unknown>) {
  try {
    return writeSuccess(await createStoreSupportTicket(await requireWritePermission(WRITE_PERMISSIONS.helpSubmit), input));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function replySupportTicketAction(ticketId: string, input: Record<string, unknown>) {
  try {
    return writeSuccess(await replyStoreSupportTicket(await requireWritePermission(WRITE_PERMISSIONS.helpSubmit), ticketId, input));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function mutateSupportStatusAction() {
  try {
    rejectStoreStatusChange();
    return writeSuccess(null);
  } catch (error) {
    return writeFailure(error);
  }
}
