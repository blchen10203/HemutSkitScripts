"use client";

import { useRef, useState } from "react";
import { createEventParser } from "@/lib/ndjson";
import { LENGTHS, TIE_INS, type HistoryMessage, type SkitInputs } from "@/lib/types";
import { applyEvent, EMPTY_VIEW, type View } from "@/lib/view";

type FormatOption = { slug: string; name: string };

const FAIL = "Couldn't generate, try again";
const CUT = "Cut off — hit Regenerate";
const label = (s: string) => s[0].toUpperCase() + s.slice(1);

const SHAPE = [
  ["## Title", "One line"],
  ["## Trend", "What's trending this week, why it fits, the source"],
  ["## Hooks", "Three openings for the first two seconds"],
  ["## Cast", "Name, role, one line of personality each"],
  ["## Script", "Numbered beats: dialogue, *[stage directions]*, **ON-SCREEN TEXT**"],
  ["## Setting & props", "One or two lines"],
  ["## Caption", "Caption and hashtags"],
];

const DEFAULTS: SkitInputs = {
  topic: "", format: "auto", setting: "", castSize: 2, cast: [],
  tieIn: "off", length: "30s", reference: "", notes: "",
};

export default function SkitForm({ formats }: { formats: FormatOption[] }) {
  const [inputs, setInputs] = useState<SkitInputs>(DEFAULTS);
  const [view, setView] = useState<View>(EMPTY_VIEW);
  const { output, status, error, history } = view;
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  // Inputs as sent by the last Generate/Regenerate; rewrites replay these so the server rebuilds the same first message.
  const sentInputs = useRef<SkitInputs>(DEFAULTS);

  const set = <K extends keyof SkitInputs>(key: K, value: SkitInputs[K]) =>
    setInputs((i) => ({ ...i, [key]: value }));
  const slots = Math.min(Math.max(inputs.castSize, 0), 6) || 0;
  const castRows = Array.from({ length: slots }, (_, n) => inputs.cast[n] ?? "");

  const setError = (error: string) => setView((v) => ({ ...v, error }));

  async function run(sent: HistoryMessage[]) {
    if (!sent.length) {
      if (!formRef.current?.reportValidity()) return;
      sentInputs.current = { ...inputs, cast: castRows };
    }
    setBusy(true);
    // A new Generate/Regenerate also forgets the old script, so a failed one can't leave Rewrite targeting it.
    setView((v) => ({ ...EMPTY_VIEW, ...(sent.length ? { history: v.history, sig: v.sig } : {}) }));
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: sentInputs.current, history: sent, sig: view.sig }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setError(body?.error || FAIL);
        return;
      }
      let sawTerminal = false;
      const parser = createEventParser((e) => {
        if (e.type === "error" || e.type === "done") sawTerminal = true;
        setView((v) => applyEvent(v, e, sent));
      });
      const reader = res.body.getReader();
      try {
        for (let r = await reader.read(); !r.done; r = await reader.read()) parser.push(r.value);
        parser.end();
      } catch (err) {
        // A malformed line throws SyntaxError from the parser; anything else is the connection dropping.
        if (err instanceof SyntaxError) {
          reader.cancel().catch(() => {});
          setError(FAIL);
          return;
        }
      }
      if (!sawTerminal) setError(CUT);
    } catch {
      setError(FAIL);
    } finally {
      setBusy(false);
      setView((v) => ({ ...v, status: "" }));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Couldn't copy");
    }
    setTimeout(() => setCopyNote(""), 1600);
  }

  const working = busy && !output;

  return (
    <div className="shell">
      <header className="topbar">
        <svg className="mark" viewBox="0 0 28 20" aria-hidden="true">
          <rect width="28" height="20" rx="4" fill="var(--accent)" />
          <rect x="2" y="2" width="24" height="16" rx="2.5" fill="none" stroke="#fff" strokeWidth="1.2" />
          <path d="M9 6v8M19 6v8M9 10h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="square" />
        </svg>
        <span className="brand">Hemut</span>
        <span className="crumb" aria-hidden="true">/</span>
        <h1>Skit Generator</h1>
      </header>

      <main className="work">
        <form
          ref={formRef}
          className="panel brief"
          onSubmit={(e) => {
            e.preventDefault();
            run([]);
          }}
        >
          <div className="brief-body">
            <h2>The setup</h2>
            <p className="lede">Fill in what you know. Anything left blank, Claude decides.</p>

            <fieldset>
              <legend>Premise</legend>
              <div className="field">
                <label htmlFor="topic">Topic or premise</label>
                <input id="topic" maxLength={500} value={inputs.topic} placeholder="Blank: picked from this week's trends"
                  onChange={(e) => set("topic", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="format">Format</label>
                <select id="format" value={inputs.format} onChange={(e) => set("format", e.target.value)}>
                  <option value="auto">Pick for me</option>
                  {formats.map((f) => (
                    <option key={f.slug} value={f.slug}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="setting">Setting</label>
                <input id="setting" maxLength={500} value={inputs.setting} placeholder="Blank: somewhere easy to film"
                  onChange={(e) => set("setting", e.target.value)} />
              </div>
            </fieldset>

            <fieldset>
              <legend>Cast</legend>
              <div className="field">
                <label htmlFor="castSize">People on camera</label>
                <input id="castSize" className="count" type="number" inputMode="numeric" min={1} max={6} step={1} required
                  aria-describedby="castSize-hint" value={inputs.castSize || ""}
                  onChange={(e) => set("castSize", Number(e.target.value))} />
                <p id="castSize-hint" className="hint">1 to 6</p>
              </div>
              {castRows.map((row, n) => (
                <div className="field" key={n}>
                  <label htmlFor={`cast-${n}`}>Person {n + 1}</label>
                  <input id={`cast-${n}`} maxLength={100} value={row}
                    placeholder={n === 0 ? "e.g. Dana, burned-out dispatcher" : "Blank: Claude invents them"}
                    onChange={(e) => {
                      const cast = [...castRows];
                      cast[n] = e.target.value;
                      set("cast", cast);
                    }} />
                </div>
              ))}
            </fieldset>

            <fieldset>
              <legend>Shape</legend>
              <div className="field">
                <span className="label" id="tieIn-label">Hemut tie-in</span>
                <div className="segmented" role="radiogroup" aria-labelledby="tieIn-label">
                  {TIE_INS.map((value) => (
                    <label key={value}>
                      <input type="radio" name="tieIn" value={value} checked={inputs.tieIn === value}
                        onChange={() => set("tieIn", value)} />
                      <span>{label(value)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label" id="length-label">Length</span>
                <div className="segmented" role="radiogroup" aria-labelledby="length-label">
                  {LENGTHS.map((value) => (
                    <label key={value}>
                      <input type="radio" name="length" value={value} checked={inputs.length === value}
                        onChange={() => set("length", value)} />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Extras</legend>
              <div className="field">
                <label htmlFor="reference">Reference skit</label>
                <textarea id="reference" rows={4} maxLength={10_000} value={inputs.reference}
                  aria-describedby="reference-hint" placeholder="A link and what happens in it, or the transcript"
                  onChange={(e) => set("reference", e.target.value)} />
                <p id="reference-hint" className="hint">Up to 10,000 characters</p>
              </div>
              <div className="field">
                <label htmlFor="notes">Extra notes</label>
                <input id="notes" maxLength={500} value={inputs.notes} placeholder="A prop you have, a line you want in"
                  onChange={(e) => set("notes", e.target.value)} />
              </div>
            </fieldset>
          </div>

          <div className="brief-foot">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Writing…" : "Generate"}
            </button>
          </div>
        </form>

        <section className="panel canvas" aria-labelledby="script-heading">
          <div className="canvas-head">
            <h2 id="script-heading">Script</h2>
            {busy && <span className="live-dot" aria-hidden="true" />}
            <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
              {busy && (status || "Writing…")}
            </span>
          </div>

          <div className="canvas-body" aria-busy={busy}>
            {error && (
              <p className="notice" role="alert">{error}</p>
            )}
            {output ? (
              <pre className="page">{output}</pre>
            ) : (
              <div className="page empty">
                {working ? (
                  <p>{status || "Writing…"}</p>
                ) : (
                  <>
                    <p>Hit Generate and the script lands on this page, in this order:</p>
                    <dl className="shape">
                      {SHAPE.map(([head, what]) => (
                        <div key={head}>
                          <dt>{head}</dt>
                          <dd>{what}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="canvas-foot">
            <form
              className="rewrite"
              onSubmit={(e) => {
                e.preventDefault();
                run([...history, { role: "user", content: instruction }]);
              }}
            >
              <label htmlFor="instruction">Rewrite</label>
              <div className="joined">
                <input id="instruction" maxLength={500} value={instruction}
                  placeholder="e.g. make the broker meaner"
                  onChange={(e) => setInstruction(e.target.value)} />
                <button type="submit" disabled={busy || !history.length || !instruction.trim()}>Rewrite</button>
              </div>
            </form>
            <div className="actions">
              <button type="button" disabled={busy} onClick={() => run([])}>Regenerate</button>
              <button type="button" disabled={busy || !output} onClick={copy}>
                {copyNote || "Copy"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
