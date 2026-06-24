"use client";

import { useState } from "react";
import { ClipboardPlus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { saveHealthLog } from "@/lib/parse-client";
import type { HealthLog } from "@/types/health";

interface Props {
  prefillSymptoms?: string;
  onSaved?: () => void;
}

const severityOptions = [
  { value: "low", label: "Mild", color: "text-green-600" },
  { value: "medium", label: "Moderate", color: "text-yellow-600" },
  { value: "high", label: "Severe", color: "text-red-600" },
] as const;

export default function HealthLogForm({ prefillSymptoms = "", onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<{
    symptoms: string;
    severity: "low" | "medium" | "high";
    notes: string;
    heartRate: string;
    bloodPressure: string;
    temperature: string;
  }>({
    symptoms: prefillSymptoms,
    severity: "low",
    notes: "",
    heartRate: "",
    bloodPressure: "",
    temperature: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.symptoms.trim()) return;
    setSaving(true);
    try {
      const vitals: HealthLog["vitals"] = {};
      if (form.heartRate) vitals.heartRate = Number(form.heartRate);
      if (form.bloodPressure) vitals.bloodPressure = form.bloodPressure;
      if (form.temperature) vitals.temperature = Number(form.temperature);

      await saveHealthLog({
        symptoms: form.symptoms.trim(),
        severity: form.severity,
        notes: form.notes.trim(),
        vitals,
      });

      setSaved(true);
      setForm({ symptoms: "", severity: "low", notes: "", heartRate: "", bloodPressure: "", temperature: "" });
      setOpen(false);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save health log:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          <ClipboardPlus className="w-4 h-4 text-teal-600" />
          Log Symptom / Vital
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="bg-slate-50 px-4 pb-4 pt-2 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Symptoms *
            </label>
            <textarea
              value={form.symptoms}
              onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
              rows={2}
              placeholder="Describe your symptoms..."
              required
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Severity</label>
            <div className="flex gap-2">
              {severityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, severity: opt.value })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    form.severity === opt.value
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Heart Rate (bpm)
              </label>
              <input
                type="number"
                value={form.heartRate}
                onChange={(e) => setForm({ ...form, heartRate: e.target.value })}
                placeholder="e.g. 72"
                className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Blood Pressure
              </label>
              <input
                type="text"
                value={form.bloodPressure}
                onChange={(e) => setForm({ ...form, bloodPressure: e.target.value })}
                placeholder="e.g. 120/80"
                className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Temperature (°F)
            </label>
            <input
              type="number"
              step="0.1"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })}
              placeholder="e.g. 98.6"
              className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any additional notes..."
              className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !form.symptoms.trim()}
            className="w-full py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save to Health Log"
            )}
          </button>

          {saved && (
            <p className="text-center text-xs text-green-600 font-medium">
              ✓ Saved to your health log
            </p>
          )}
        </form>
      )}
    </div>
  );
}
