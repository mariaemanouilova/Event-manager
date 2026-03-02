/**
 * Admin data service – single place for all Supabase queries
 * used by the admin panel. Each method returns { data, error }.
 */
import { supabase } from '../../../supabase.js';

/* ── Auth / role helpers ──────────────────────────────────── */

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUserRole(userId) {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data?.role ?? 'user';
}

/* ── Users ────────────────────────────────────────────────── */

export async function fetchUsers() {
  return supabase
    .from('users')
    .select('id, email, full_name, created_at, user_roles(role)')
    .order('created_at', { ascending: false });
}

export async function updateUser(id, { email, full_name }) {
  return supabase.from('users').update({ email, full_name: full_name || null }).eq('id', id);
}

export async function upsertRole(userId, role) {
  return supabase.from('user_roles').upsert({ user_id: userId, role });
}

export async function deleteUser(id) {
  return supabase.from('users').delete().eq('id', id);
}

/* ── Calendars ────────────────────────────────────────────── */

export async function fetchCalendars() {
  return supabase
    .from('calendars')
    .select('id, title, is_public, creator_id, created_at, users!calendars_creator_id_fkey(email, full_name)')
    .order('created_at', { ascending: false });
}

export async function updateCalendar(id, { title, is_public }) {
  return supabase.from('calendars').update({ title, is_public }).eq('id', id);
}

export async function deleteCalendar(id) {
  return supabase.from('calendars').delete().eq('id', id);
}

/* ── Events ───────────────────────────────────────────────── */

export async function fetchEvents() {
  return supabase
    .from('events')
    .select('id, title, description, event_date, location, is_public, creator_id, calendar_id, created_at, users!events_creator_id_fkey(email, full_name), calendars(title, is_public)')
    .order('event_date', { ascending: false });
}

export async function updateEvent(id, fields) {
  return supabase.from('events').update(fields).eq('id', id);
}

export async function deleteEvent(id) {
  return supabase.from('events').delete().eq('id', id);
}

/* ── Participants ─────────────────────────────────────────── */

export async function fetchParticipants() {
  return supabase
    .from('participants')
    .select('id, status, created_at, event_id, user_id, events(title), users(email, full_name)')
    .order('created_at', { ascending: false });
}

export async function fetchParticipantsByEvent(eventId) {
  return supabase
    .from('participants')
    .select('user_id, users(email, full_name)')
    .eq('event_id', eventId);
}

export async function updateParticipant(id, { status }) {
  return supabase.from('participants').update({ status }).eq('id', id);
}

export async function deleteParticipant(id) {
  return supabase.from('participants').delete().eq('id', id);
}

export async function replaceEventParticipants(eventId, userIds) {
  await supabase.from('participants').delete().eq('event_id', eventId);
  if (userIds.length === 0) return { error: null };
  const rows = userIds.map((uid) => ({ event_id: eventId, user_id: uid, status: 'invited' }));
  return supabase.from('participants').insert(rows);
}

/* ── Shared ───────────────────────────────────────────────── */

export async function fetchAllUsers() {
  return supabase.from('users').select('id, email, full_name').order('email');
}

/* ── Attachments ────────────────────────────────────────────── */

export async function fetchAttachmentsByEvent(eventId) {
  return supabase
    .from('event_attachments')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at');
}

export async function fetchAllAttachmentsCounts() {
  // Return all attachments (id + event_id) so caller can group-count
  return supabase
    .from('event_attachments')
    .select('id, event_id');
}

export async function deleteAttachment(id, filePath) {
  // Remove from storage first
  await supabase.storage.from('event-attachments').remove([filePath]);
  return supabase.from('event_attachments').delete().eq('id', id);
}

export async function uploadAttachment(eventId, file, userId) {
  const filePath = `${eventId}/${Date.now()}_${file.name}`;
  const { error: uploadErr } = await supabase.storage
    .from('event-attachments')
    .upload(filePath, file, { upsert: false });
  if (uploadErr) return { data: null, error: uploadErr };

  return supabase.from('event_attachments').insert({
    event_id: eventId,
    file_name: file.name,
    file_path: filePath,
    file_type: file.type || 'application/octet-stream',
    file_size: file.size,
    uploaded_by: userId,
  });
}

export function getAttachmentPublicUrl(filePath) {
  const { data: urlData } = supabase.storage.from('event-attachments').getPublicUrl(filePath);
  return urlData?.publicUrl || '';
}
