"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WhatsAppConnection({
  canEdit,
  connected,
  phoneNumberId,
  businessAcctId,
}: {
  canEdit: boolean;
  connected: boolean;
  phoneNumberId: string | null;
  businessAcctId: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showSteps, setShowSteps] = useState(!connected);
  const [phoneId, setPhoneId] = useState(phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(businessAcctId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    verifiedName: string;
    displayPhoneNumber: string;
    qualityRating: string;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/whatsapp/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection test failed");
      setTestResult(data);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: phoneId.trim(),
          businessAcctId: wabaId.trim() || undefined,
          accessToken: accessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setEditing(false);
      setAccessToken("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect WhatsApp? Real sends will fall back to the mock channel."))
      return;
    setSaving(true);
    try {
      await fetch("/api/settings/whatsapp", { method: "DELETE" });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-stone-700">
            WhatsApp connection
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            {connected
              ? `Connected — Phone Number ID ${phoneNumberId}`
              : "Not connected — sends go through the mock channel"}
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs border shrink-0 ${
            connected
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-stone-100 text-stone-600 border-stone-200"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {connected && (
        <div className="mt-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="rounded-lg border border-stone-300 text-stone-700 text-sm px-3 py-1.5 hover:bg-stone-100 cursor-pointer disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>

          {testError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
              {testError}
            </p>
          )}
          {testResult && (
            <div className="text-sm text-stone-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3 space-y-0.5">
              <div>
                <span className="text-stone-500">Verified name:</span>{" "}
                {testResult.verifiedName || "—"}
              </div>
              <div>
                <span className="text-stone-500">Number:</span>{" "}
                {testResult.displayPhoneNumber || "—"}
              </div>
              <div>
                <span className="text-stone-500">Quality rating:</span>{" "}
                {testResult.qualityRating}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setShowSteps((s) => !s)}
        className="text-xs text-amber-700 hover:underline cursor-pointer mt-4"
      >
        {showSteps ? "Hide" : "Show"} setup steps (do this on Meta&apos;s site first)
      </button>

      {showSteps && (
        <ol className="mt-3 space-y-2 text-sm text-stone-600 list-decimal list-inside bg-stone-50 rounded-lg p-4">
          <li>
            Create a Meta Business Account and a Meta App (developers.facebook.com)
            with the WhatsApp product added.
          </li>
          <li>
            Add your number (99009 43005) as a WhatsApp Business number and
            verify it — it can&apos;t already be active in the regular WhatsApp
            app on that SIM.
          </li>
          <li>
            In WhatsApp Manager, create at least one message template (e.g.
            &quot;lead_intro_1&quot;) and submit it for approval — this can
            take minutes to about a day.
          </li>
          <li>
            Generate a permanent access token for a System User with
            <code className="mx-1 px-1 bg-stone-200 rounded">whatsapp_business_messaging</code>
            permission.
          </li>
          <li>
            Copy the Phone Number ID and WhatsApp Business Account ID from
            the app dashboard, and paste them below with the access token.
          </li>
          <li>
            To receive delivery statuses and replies (not just send), add a
            webhook in the app dashboard pointing to{" "}
            <code className="mx-1 px-1 bg-stone-200 rounded">
              https://your-domain/api/webhooks/whatsapp
            </code>
            . While testing on a local machine (not yet deployed), this
            address can&apos;t be reached from the internet — a tool like{" "}
            <span className="font-medium">ngrok</span> can expose it
            temporarily for testing; once this app is deployed for real,
            use its actual public URL instead.
          </li>
        </ol>
      )}

      {!canEdit ? (
        <p className="text-xs text-stone-500 mt-4">
          Only the account owner can connect or change WhatsApp credentials.
        </p>
      ) : editing ? (
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div>
            <label className="block text-sm text-stone-700 mb-1">
              Phone Number ID
            </label>
            <input
              required
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-700 mb-1">
              WhatsApp Business Account ID (optional)
            </label>
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-700 mb-1">
              Access token
            </label>
            <input
              required
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={connected ? "Enter a new token to replace it" : ""}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-xs text-stone-500 mt-1">
              Stored encrypted — never shown again once saved.
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-stone-300 text-stone-700 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-stone-900 text-white text-sm px-4 py-2 hover:bg-stone-800 cursor-pointer"
          >
            {connected ? "Update credentials" : "Connect WhatsApp"}
          </button>
          {connected && (
            <button
              onClick={handleDisconnect}
              disabled={saving}
              className="rounded-lg border border-stone-300 text-red-600 text-sm px-4 py-2 hover:bg-stone-100 cursor-pointer disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
