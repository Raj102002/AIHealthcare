"use client";

import { useState } from "react";
import { User, ChevronDown, ChevronUp, Plus, X, Loader2 } from "lucide-react";
import { updateUserProfile } from "@/lib/parse-client";
import type { UserProfile } from "@/types/health";

interface Props {
  profile: UserProfile;
  onUpdated: (updated: Partial<UserProfile>) => void;
}

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
      setInput("");
    }
  };
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full border border-teal-200"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          type="button"
          onClick={add}
          className="p-1 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function UserProfilePanel({ profile, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState({
    allergies: profile.allergies || [],
    conditions: profile.conditions || [],
    medications: profile.medications || [],
    age: profile.age?.toString() || "",
    bloodType: profile.bloodType || "",
    preferredLanguage: profile.preferredLanguage || "",
  });

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserProfile({
        allergies: local.allergies,
        conditions: local.conditions,
        medications: local.medications,
        age: local.age ? Number(local.age) : undefined,
        bloodType: local.bloodType || undefined,
        preferredLanguage: local.preferredLanguage || undefined,
      });
      onUpdated({
        allergies: local.allergies,
        conditions: local.conditions,
        medications: local.medications,
        age: local.age ? Number(local.age) : undefined,
        bloodType: local.bloodType,
        preferredLanguage: local.preferredLanguage,
      });
      setOpen(false);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <User className="w-4 h-4 text-teal-600" />
          Health Profile
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="bg-slate-50 px-4 pb-4 pt-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Age</label>
              <input
                type="number"
                value={local.age}
                onChange={(e) => setLocal({ ...local, age: e.target.value })}
                placeholder="e.g. 30"
                className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Blood Type</label>
              <select
                value={local.bloodType}
                onChange={(e) => setLocal({ ...local, bloodType: e.target.value })}
                className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
              >
                <option value="">Unknown</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Preferred Language</label>
            <select
              value={local.preferredLanguage}
              onChange={(e) => setLocal({ ...local, preferredLanguage: e.target.value })}
              className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
            >
              <option value="">Auto-detect</option>
              {[
                ["en", "English"],
                ["hi", "Hindi (हिन्दी)"],
                ["es", "Spanish (Español)"],
                ["fr", "French (Français)"],
                ["de", "German (Deutsch)"],
                ["zh", "Chinese (中文)"],
                ["ar", "Arabic (العربية)"],
                ["pt", "Portuguese (Português)"],
                ["ru", "Russian (Русский)"],
                ["ja", "Japanese (日本語)"],
                ["ko", "Korean (한국어)"],
                ["ta", "Tamil (தமிழ்)"],
                ["te", "Telugu (తెలుగు)"],
                ["bn", "Bengali (বাংলা)"],
                ["ur", "Urdu (اردو)"],
              ].map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <TagInput
            label="Allergies"
            values={local.allergies}
            onChange={(v) => setLocal({ ...local, allergies: v })}
            placeholder="Add allergy..."
          />
          <TagInput
            label="Medical Conditions"
            values={local.conditions}
            onChange={(v) => setLocal({ ...local, conditions: v })}
            placeholder="Add condition..."
          />
          <TagInput
            label="Current Medications"
            values={local.medications}
            onChange={(v) => setLocal({ ...local, medications: v })}
            placeholder="Add medication..."
          />

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Profile"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
