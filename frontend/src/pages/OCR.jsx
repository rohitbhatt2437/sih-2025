import React, { useState, useRef, useEffect } from "react";

export default function OCR() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState({ ok: null, message: "" });
  const [selectedState, setSelectedState] = useState("");
  const inputRef = useRef(null);
  const baseUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

  const formTypeOptions = [
    'Claim Form For Rights To Community Forest Resource',
    'Title to Community Forest Rights',
    'Title for forest land under occupation',
    'title to community forest resources',
    'claim form for rights to forest land',
    'claim form for community rights',
  ];

  // Track editing state per result index
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', gp: '', district: '', state: '', formType: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${baseUrl}/api/health`);
        const ok = r.ok;
        if (!cancelled) setApiStatus({ ok, message: ok ? "API connected" : `Health error: ${r.status}` });
      } catch (e) {
        if (!cancelled) setApiStatus({ ok: false, message: e?.message || "Failed to reach API" });
      }
    })();
    return () => { cancelled = true; };
  }, [baseUrl]);

  function onFileChange(e) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
  }

  function onDrop(e) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
    if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      if (selectedState) fd.append("overrideState", selectedState);
      const resp = await fetch(`${baseUrl}/api/ocr`, {
        method: "POST",
        body: fd,
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setResults(data);
      setEditingIdx(null);
      setEditDraft({ name: '', gp: '', district: '', state: '', formType: '' });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  function fileThumbForIndex(idx) {
    const f = files[idx];
    if (!f) return null;
    try { return URL.createObjectURL(f); } catch { return null; }
  }

  function startEdit(idx) {
    if (!results?.results?.[idx]) return;
    const row = results.results[idx];
    const currentName = row.parsed?.claimantInfo?.name || '';
    const currentGp = row.parsed?.location?.gramPanchayat || '';
    const currentDistrict = row.parsed?.location?.district || '';
    const currentState = row.parsed?.location?.state || '';
    const currentFormType = row.parsed?.formType || '';
    setEditingIdx(idx);
    setEditDraft({ name: currentName, gp: currentGp, district: currentDistrict, state: currentState, formType: currentFormType });
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditDraft({ name: '', gp: '', district: '', state: '', formType: '' });
  }

  async function submitEdit(idx) {
    if (!results?.results?.[idx]) return;
    const row = results.results[idx];
    if (!row.id) {
      alert('This item has no DB id; cannot submit edits. Ensure DB is configured.');
      return;
    }
    try {
      const payload = { updates: {
        'claimantInfo.name': editDraft.name || '',
        'location.gramPanchayat': editDraft.gp || '',
        'location.district': editDraft.district || '',
        'location.state': editDraft.state || '',
        'formType': editDraft.formType || null,
      } };
      const r = await fetch(`${baseUrl}/api/claims/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
      // Reflect changes locally
      setResults(prev => {
        if (!prev) return prev;
        const copy = { ...prev, results: [...(prev.results || [])] };
        const old = copy.results[idx];
        const newParsed = {
          ...(old.parsed || {}),
          claimantInfo: {
            ...(old.parsed?.claimantInfo || {}),
            name: editDraft.name,
          },
          location: {
            ...(old.parsed?.location || {}),
            gramPanchayat: editDraft.gp,
            district: editDraft.district,
            state: editDraft.state,
          },
          formType: editDraft.formType,
        };
        copy.results[idx] = { ...old, parsed: newParsed };
        return copy;
      });
      setEditingIdx(null);
    } catch (e) {
      alert(e?.message || 'Failed to save changes');
    }
  }
  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-gray-800 mb-2">Scan Document</h1>
      <p className="text-sm text-gray-600 mb-5">
        Upload one or more images.
      </p>

      {apiStatus.ok === false && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          API unreachable at {baseUrl}. {apiStatus.message}
        </div>
      )}
      {apiStatus.ok === true && (
        <div className="mb-4 text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
          {apiStatus.message}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Prominent Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="relative rounded-2xl border-2 border-dashed border-gray-300 bg-white p-8 sm:p-10 flex flex-col items-center text-center hover:border-blue-400 transition"
        >
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M12 16a1 1 0 0 1-1-1V8.41l-1.3 1.3a1 1 0 1 1-1.4-1.42l3-3a1 1 0 0 1 1.4 0l3 3a1 1 0 1 1-1.4 1.42L13 8.41V15a1 1 0 0 1-1 1Zm-7 4a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h2a1 1 0 1 1 0 2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2a1 1 0 1 1 2 0v2a3 3 0 0 1-3 3H5Z" />
            </svg>
          </div>
          <p className="text-sm text-gray-700">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-blue-600 font-medium hover:underline"
            >
              Click to upload
            </button>
            <span className="text-gray-500"> or drag & drop images here</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">PNG, JPG up to 10MB each</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFileChange}
            className="sr-only"
          />
        </div>

        {/* State selection (single-select via checkboxes) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-medium text-gray-800 mb-2">Select State for this OCR run</div>
          <div className="text-xs text-gray-500 mb-3">Only one can be selected. This state will be stored for all forms uploaded in this run.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              "Odisha",
              "Telangana",
              "Tripura",
              "Madhya Pradesh",
            ].map((state) => (
              <label key={state} className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedState === state}
                  onChange={() => setSelectedState(selectedState === state ? "" : state)}
                />
                <span className="text-sm text-gray-800">{state}</span>
              </label>
            ))}
          </div>
          {!selectedState && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Please select a state to proceed.
            </div>
          )}
        </div>

        {/* Selected files preview: tiny thumbnails in one horizontal line */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-700">
                {files.length} file{files.length > 1 ? "s" : ""} selected
              </div>
              <button
                type="button"
                className="text-[11px] px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                onClick={() => setFiles([])}
              >
                Clear all
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {files.map((f, idx) => {
                const url = URL.createObjectURL(f);
                return (
                  <div key={idx} className="relative shrink-0 w-16 h-16 rounded-md border overflow-hidden">
                    <img src={url} alt={f.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-gray-800 shadow border"
                      aria-label="Remove"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading || files.length === 0 || !selectedState}
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            {loading ? "Processing..." : "Run OCR"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>

      {results && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-800 font-medium mb-2">Results</div>
          <div className="text-xs text-gray-600 mb-4">Processed: {results.count}</div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b bg-gray-50">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Image</th>
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Full Address</th>
                  <th className="py-2 px-3">Form Type</th>
                  <th className="py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(results.results || []).map((row, idx) => {
                  const isEditing = editingIdx === idx;
                  const thumb = fileThumbForIndex(idx);
                  const displayName = row.parsed?.claimantInfo?.name || '';
                  const gp = row.parsed?.location?.gramPanchayat || '';
                  const district = row.parsed?.location?.district || '';
                  const st = row.parsed?.location?.state || '';
                  const displayAddress = [gp, district, st].filter(Boolean).join(', ');
                  const displayFormType = row.parsed?.formType || '';
                  return (
                    <tr key={idx} className="border-b align-top">
                      <td className="py-2 px-3 whitespace-nowrap">{idx + 1}</td>
                      <td className="py-2 px-3">
                        {thumb ? (
                          <img src={thumb} alt={row.source_filename || `image-${idx+1}`} className="w-16 h-16 object-cover rounded border" />
                        ) : (
                          <span className="text-xs text-gray-500">No image</span>
                        )}
                      </td>
                      <td className="py-2 px-3 min-w-[180px]">
                        {isEditing ? (
                          <input
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editDraft.name}
                            onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                          />
                        ) : (
                          <span>{displayName || '-'}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 min-w-[260px]">
                        {isEditing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              placeholder="Gram Panchayat"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editDraft.gp}
                              onChange={e => setEditDraft(d => ({ ...d, gp: e.target.value }))}
                            />
                            <input
                              placeholder="District"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editDraft.district}
                              onChange={e => setEditDraft(d => ({ ...d, district: e.target.value }))}
                            />
                            <input
                              placeholder="State"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editDraft.state}
                              onChange={e => setEditDraft(d => ({ ...d, state: e.target.value }))}
                            />
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{displayAddress || '-'}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 min-w-[220px]">
                        {isEditing ? (
                          <select
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editDraft.formType}
                            onChange={e => setEditDraft(d => ({ ...d, formType: e.target.value }))}
                          >
                            <option value="">Select form type…</option>
                            {formTypeOptions.map(ft => (
                              <option key={ft} value={ft}>{ft}</option>
                            ))}
                          </select>
                        ) : (
                          <span>{displayFormType || '-'}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap space-x-2">
                        {isEditing ? (
                          <>
                            <button className="px-2 py-1 rounded bg-blue-600 text-white text-xs" onClick={() => submitEdit(idx)}>Submit</button>
                            <button className="px-2 py-1 rounded text-xs" onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <button className="px-2 py-1 rounded border text-xs" onClick={() => startEdit(idx)}>Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
