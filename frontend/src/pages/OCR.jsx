import React, { useState, useRef } from "react";

export default function OCR() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const baseUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

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
      const resp = await fetch(`${baseUrl}/api/ocr`, {
        method: "POST",
        body: fd,
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-gray-800 mb-2">OCR Upload</h1>
      <p className="text-sm text-gray-600 mb-5">
        Upload one or more images. We’ll extract structured data using Gemini and geocode locations for mapping.
      </p>

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
            disabled={loading || files.length === 0}
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
          <div className="text-xs text-gray-600 mb-3">Processed: {results.count}</div>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-80">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
