"use client";

import { Parse, initializeParse } from "@/lib/parse-client";
import { encryptText, decryptText } from "@/lib/client-crypto";
import type { SymptomEntry, FunctionEntry, TimelineAnchor, ClinicalEncounter } from "@/types/journal";

// Every class below follows the same ACL pattern already established for
// HealthLog/Conversation in lib/parse-client.ts: new Parse.ACL(user) grants
// read/write to that one user only, nobody else — including other
// authenticated users. Verified in docs/privacy.md.
function ownerAcl(user: Parse.User): Parse.ACL {
  return new Parse.ACL(user);
}

function requireUser(): Parse.User {
  const user = Parse.User.current();
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ---- SymptomEntry ----

export async function saveSymptomEntry(data: Omit<SymptomEntry, "objectId" | "createdAt">) {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("SymptomEntry");
  const entry = new Obj();
  entry.setACL(ownerAcl(user));
  entry.set("userId", user);
  entry.set("occurredAt", new Date(data.occurredAt));
  entry.set("datePrecision", data.datePrecision);
  entry.set("symptomCode", data.symptomCode);
  entry.set("symptomLabel", data.symptomLabel);
  entry.set("severity", data.severity);
  if (data.bodySite) entry.set("bodySite", data.bodySite);
  if (data.durationMinutes !== undefined) entry.set("durationMinutes", data.durationMinutes);
  entry.set("notes", await encryptText(data.notes));
  entry.set("context", data.context);
  return entry.save();
}

export async function getSymptomEntries(): Promise<SymptomEntry[]> {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("SymptomEntry");
  const query = new Parse.Query(Obj);
  query.equalTo("userId", user);
  query.descending("occurredAt");
  query.limit(500);
  const results = await query.find();

  return Promise.all(
    results.map(async (r) => ({
      objectId: r.id,
      occurredAt: (r.get("occurredAt") as Date).toISOString(),
      createdAt: (r.get("createdAt") as Date | undefined)?.toISOString(),
      datePrecision: r.get("datePrecision"),
      symptomCode: r.get("symptomCode"),
      symptomLabel: r.get("symptomLabel"),
      severity: r.get("severity"),
      bodySite: r.get("bodySite"),
      durationMinutes: r.get("durationMinutes"),
      notes: await decryptText(r.get("notes") ?? ""),
      context: r.get("context") ?? [],
    }))
  );
}

export async function deleteSymptomEntry(id: string) {
  initializeParse();
  const Obj = Parse.Object.extend("SymptomEntry");
  const obj = await new Parse.Query(Obj).get(id);
  return obj.destroy();
}

// ---- FunctionEntry ----

export async function saveFunctionEntry(data: Omit<FunctionEntry, "objectId">) {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("FunctionEntry");
  const entry = new Obj();
  entry.setACL(ownerAcl(user));
  entry.set("userId", user);
  entry.set("occurredAt", new Date(data.occurredAt));
  entry.set("domain", data.domain);
  entry.set("value", data.value);
  if (data.note) entry.set("note", data.note);
  return entry.save();
}

export async function getFunctionEntries(): Promise<FunctionEntry[]> {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("FunctionEntry");
  const query = new Parse.Query(Obj);
  query.equalTo("userId", user);
  query.descending("occurredAt");
  query.limit(500);
  const results = await query.find();

  return results.map((r) => ({
    objectId: r.id,
    occurredAt: (r.get("occurredAt") as Date).toISOString(),
    domain: r.get("domain"),
    value: r.get("value"),
    note: r.get("note"),
  }));
}

export async function deleteFunctionEntry(id: string) {
  initializeParse();
  const Obj = Parse.Object.extend("FunctionEntry");
  const obj = await new Parse.Query(Obj).get(id);
  return obj.destroy();
}

// ---- TimelineAnchor ----

export async function saveTimelineAnchor(data: Omit<TimelineAnchor, "objectId">) {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("TimelineAnchor");
  const anchor = new Obj();
  anchor.setACL(ownerAcl(user));
  anchor.set("userId", user);
  anchor.set("type", data.type);
  anchor.set("occurredAt", new Date(data.occurredAt));
  anchor.set("precision", data.precision);
  anchor.set("detail", data.detail);
  return anchor.save();
}

export async function getTimelineAnchors(): Promise<TimelineAnchor[]> {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("TimelineAnchor");
  const query = new Parse.Query(Obj);
  query.equalTo("userId", user);
  query.descending("occurredAt");
  query.limit(500);
  const results = await query.find();

  return results.map((r) => ({
    objectId: r.id,
    type: r.get("type"),
    occurredAt: (r.get("occurredAt") as Date).toISOString(),
    precision: r.get("precision"),
    detail: r.get("detail"),
  }));
}

export async function deleteTimelineAnchor(id: string) {
  initializeParse();
  const Obj = Parse.Object.extend("TimelineAnchor");
  const obj = await new Parse.Query(Obj).get(id);
  return obj.destroy();
}

// ---- ClinicalEncounter ----

export async function saveClinicalEncounter(data: Omit<ClinicalEncounter, "objectId">) {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("ClinicalEncounter");
  const encounter = new Obj();
  encounter.setACL(ownerAcl(user));
  encounter.set("userId", user);
  encounter.set("occurredAt", new Date(data.occurredAt));
  encounter.set("specialty", data.specialty);
  encounter.set("toldWhat", data.toldWhat);
  encounter.set("ruledOut", data.ruledOut);
  encounter.set("testsOrdered", data.testsOrdered);
  return encounter.save();
}

// ---- RashPhoto ----
// Erythema migrans is diagnostic on its own via its expansion over days — no
// image classification here, ever. Just a dated sequence the patient captured,
// rendered as a timeline in the handoff document.

export interface RashPhotoRecord {
  objectId?: string;
  occurredAt: string;
  url: string;
  note?: string;
}

export async function saveRashPhoto(file: File, occurredAt: string, note?: string) {
  initializeParse();
  const user = requireUser();
  const parseFile = new Parse.File(file.name, file);
  await parseFile.save();

  const Obj = Parse.Object.extend("RashPhoto");
  const photo = new Obj();
  photo.setACL(ownerAcl(user));
  photo.set("userId", user);
  photo.set("occurredAt", new Date(occurredAt));
  photo.set("image", parseFile);
  if (note) photo.set("note", note);
  return photo.save();
}

export async function getRashPhotos(): Promise<RashPhotoRecord[]> {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("RashPhoto");
  const query = new Parse.Query(Obj);
  query.equalTo("userId", user);
  query.ascending("occurredAt");
  query.limit(200);
  const results = await query.find();

  return results.map((r) => ({
    objectId: r.id,
    occurredAt: (r.get("occurredAt") as Date).toISOString(),
    url: (r.get("image") as Parse.File).url() ?? "",
    note: r.get("note"),
  }));
}

export async function deleteRashPhoto(id: string) {
  initializeParse();
  const Obj = Parse.Object.extend("RashPhoto");
  const obj = await new Parse.Query(Obj).get(id);
  return obj.destroy();
}

export async function getClinicalEncounters(): Promise<ClinicalEncounter[]> {
  initializeParse();
  const user = requireUser();
  const Obj = Parse.Object.extend("ClinicalEncounter");
  const query = new Parse.Query(Obj);
  query.equalTo("userId", user);
  query.descending("occurredAt");
  query.limit(200);
  const results = await query.find();

  return results.map((r) => ({
    objectId: r.id,
    occurredAt: (r.get("occurredAt") as Date).toISOString(),
    specialty: r.get("specialty"),
    toldWhat: r.get("toldWhat"),
    ruledOut: r.get("ruledOut") ?? [],
    testsOrdered: r.get("testsOrdered") ?? [],
  }));
}

export async function deleteClinicalEncounter(id: string) {
  initializeParse();
  const Obj = Parse.Object.extend("ClinicalEncounter");
  const obj = await new Parse.Query(Obj).get(id);
  return obj.destroy();
}
