"use client";

import Parse from "parse";
import type { HealthLog, UserProfile } from "@/types/health";

let initialized = false;

export function initializeParse() {
  if (initialized || typeof window === "undefined") return;
  const appId = process.env.NEXT_PUBLIC_BACK4APP_APP_ID;
  const jsKey = process.env.NEXT_PUBLIC_BACK4APP_JS_KEY;
  if (!appId || !jsKey) {
    console.warn(
      "Back4App credentials missing. Add NEXT_PUBLIC_BACK4APP_APP_ID and NEXT_PUBLIC_BACK4APP_JS_KEY to .env.local"
    );
    return;
  }
  Parse.initialize(appId, jsKey);
  (Parse as unknown as { serverURL: string }).serverURL =
    "https://parseapi.back4app.com";
  initialized = true;
}

export { Parse };

export async function loginUser(username: string, password: string) {
  initializeParse();
  return Parse.User.logIn(username, password);
}

export async function registerUser(
  username: string,
  email: string,
  password: string
) {
  initializeParse();
  const user = new Parse.User();
  user.set("username", username);
  user.set("email", email);
  user.set("password", password);
  user.set("allergies", []);
  user.set("conditions", []);
  user.set("medications", []);
  return user.signUp();
}

export async function logoutUser() {
  initializeParse();
  return Parse.User.logOut();
}

export function getCurrentUser(): Parse.User | null {
  initializeParse();
  return Parse.User.current() ?? null;
}

export function getUserProfile(): UserProfile | null {
  const user = getCurrentUser();
  if (!user) return null;
  return {
    objectId: user.id,
    username: user.getUsername() || "",
    email: user.getEmail(),
    allergies: user.get("allergies") || [],
    conditions: user.get("conditions") || [],
    medications: user.get("medications") || [],
    bloodType: user.get("bloodType"),
    age: user.get("age"),
    preferredLanguage: user.get("preferredLanguage"),
  };
}

export async function updateUserProfile(
  data: Partial<Pick<UserProfile, "allergies" | "conditions" | "medications" | "bloodType" | "age" | "preferredLanguage">>
) {
  initializeParse();
  const user = Parse.User.current();
  if (!user) throw new Error("Not authenticated");
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) user.set(key, value);
  });
  return user.save();
}

export async function saveHealthLog(
  data: Omit<HealthLog, "objectId" | "createdAt">
) {
  initializeParse();
  const HealthLogObj = Parse.Object.extend("HealthLog");
  const log = new HealthLogObj();
  const user = Parse.User.current();
  if (user) {
    const acl = new Parse.ACL(user);
    log.setACL(acl);
    log.set("userId", user);
  }
  log.set("symptoms", data.symptoms);
  log.set("severity", data.severity);
  log.set("notes", data.notes || "");
  log.set("vitals", data.vitals || {});
  return log.save();
}

export async function getHealthLogs() {
  initializeParse();
  const HealthLogObj = Parse.Object.extend("HealthLog");
  const query = new Parse.Query(HealthLogObj);
  const user = Parse.User.current();
  if (user) query.equalTo("userId", user);
  query.descending("createdAt");
  query.limit(50);
  return query.find();
}

export async function saveConversation(data: {
  title: string;
  messages: { role: string; content: string }[];
}) {
  initializeParse();
  const ConvObj = Parse.Object.extend("Conversation");
  const conv = new ConvObj();
  const user = Parse.User.current();
  if (user) {
    const acl = new Parse.ACL(user);
    conv.setACL(acl);
    conv.set("userId", user);
  }
  conv.set("title", data.title);
  conv.set("messages", data.messages);
  const last = data.messages[data.messages.length - 1];
  conv.set("lastMessage", last?.content?.slice(0, 120) || "");
  return conv.save();
}

export async function getConversations() {
  initializeParse();
  const ConvObj = Parse.Object.extend("Conversation");
  const query = new Parse.Query(ConvObj);
  const user = Parse.User.current();
  if (user) query.equalTo("userId", user);
  query.descending("createdAt");
  query.limit(20);
  return query.find();
}

export async function deleteHealthLog(id: string) {
  initializeParse();
  const HealthLogObj = Parse.Object.extend("HealthLog");
  const query = new Parse.Query(HealthLogObj);
  const obj = await query.get(id);
  return obj.destroy();
}

export async function deleteConversation(id: string) {
  initializeParse();
  const ConvObj = Parse.Object.extend("Conversation");
  const query = new Parse.Query(ConvObj);
  const obj = await query.get(id);
  return obj.destroy();
}
