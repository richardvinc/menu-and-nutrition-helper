import { useEffect, useMemo, useState } from "react";
import type { MemberProfile, TargetPreview, TargetPreviewRequest, WeeklyTarget } from "@piring-kita/shared";
import "./targets.css";

export type TargetsProps = {
  members: MemberProfile[];
  targets: WeeklyTarget[];
  effectiveWeek: string;
  onPreview: (request: TargetPreviewRequest) => Promise<TargetPreview>;
  onApply: (request: TargetPreviewRequest) => Promise<void>;
  history?: { memberId: MemberProfile["id"]; date: string; weightKg: number }[];
};

const activityFactors: Record<Exclude<MemberProfile["activityLevel"], "custom">, number> = {
  inactive: 1.4, low: 1.6, active: 1.75, very: 2.05,
};
const activityNames: Record<MemberProfile["activityLevel"], string> = {
  inactive: "Inactive", low: "Low active", active: "Active", very: "Very active", custom: "Custom",
};

function targetForWeek(targets: WeeklyTarget[], memberId: MemberProfile["id"], effectiveWeek: string) {
  return targets.filter(target => target.memberId === memberId && target.weekStart < effectiveWeek)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
}

export function Targets({ members, targets, effectiveWeek, onPreview, onApply, history = [] }: TargetsProps) {
  const [memberId, setMemberId] = useState<MemberProfile["id"]>(members[0]?.id ?? "richard");
  const member = members.find(item => item.id === memberId) ?? members[0];
  const current = member && targetForWeek(targets, member.id, effectiveWeek);
  const initial = useMemo<TargetPreviewRequest | null>(() => member && current ? ({
    memberId: member.id, effectiveWeek, weightKg: member.currentWeightKg,
    activityLevel: member.activityLevel, activityFactor: member.activityFactor,
    deficitPercent: current.deficitPercent, weekendReserve: current.weekendReserve,
    proteinPercent: current.proteinPercent, carbsPercent: current.carbsPercent,
    fatPercent: current.fatPercent, fiberGrams: current.fiberGrams,
  }) : null, [member, current, effectiveWeek]);
  const [draft, setDraft] = useState<TargetPreviewRequest | null>(initial);
  const [preview, setPreview] = useState<TargetPreview | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [advisory, setAdvisory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(initial); setPreview(null); setFieldErrors({}); setError(""); }, [initial]);

  function update<K extends keyof TargetPreviewRequest>(key: K, value: TargetPreviewRequest[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value }); setPreview(null); setError(""); setFieldErrors({});
  }

  function validate(request: TargetPreviewRequest) {
    const errors: Record<string, string> = {};
    if (!Number.isFinite(request.weightKg) || request.weightKg < 30 || request.weightKg > 300) errors.weightKg = "Enter a weight from 30 to 300 kg.";
    if (!Number.isFinite(request.deficitPercent) || request.deficitPercent < 0 || request.deficitPercent > 60) errors.deficitPercent = "Enter a deficit from 0% to 60%.";
    if (request.activityLevel === "custom" && (!Number.isFinite(request.activityFactor) || request.activityFactor < 1 || request.activityFactor > 2.5)) errors.activityFactor = "Enter a custom activity factor from 1.00 to 2.50.";
    if (!Number.isFinite(request.weekendReserve) || request.weekendReserve < 0) errors.weekendReserve = "Enter zero or more weekend reserve calories.";
    if (![request.proteinPercent, request.carbsPercent, request.fatPercent].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) errors.macros = "Macro percentages must each be from 0% to 100%.";
    else if (request.proteinPercent + request.carbsPercent + request.fatPercent !== 100) errors.macros = "Macro percentages must total exactly 100%.";
    if (!Number.isFinite(request.fiberGrams) || request.fiberGrams < 0) errors.fiberGrams = "Enter a fiber target of zero or more grams.";
    return errors;
  }

  async function makePreview() {
    if (!draft) return;
    const errors = validate(draft);
    setFieldErrors(errors); setAdvisory(""); setError(""); setPreview(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const result = await onPreview(draft);
      setPreview(result);
      if (result.proposed.weekdayCalories < 1200) setAdvisory("This weekday target is below 1,200 kcal and may need qualified clinical guidance.");
      else if (draft.deficitPercent > 30) setAdvisory("This deficit is above 30%. Review your comfort and progress before applying.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not prepare a target preview."); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!draft || !preview || Object.keys(validate(draft)).length) return;
    setBusy(true); setError("");
    try { await onApply(draft); setPreview(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply the next-week targets."); }
    finally { setBusy(false); }
  }

  if (!member || !current || !draft) return <main className="targets-page"><h1>Targets</h1><p>No target settings are available for this member and week.</p></main>;
  const macroTotal = draft.proteinPercent + draft.carbsPercent + draft.fatPercent;
  const memberHistory = history.filter(item => item.memberId === member.id);

  return <main className="targets-page">
    <header className="feature-heading"><p className="feature-eyebrow">Next-week review</p><h1>Targets</h1><p>Stage changes for the week of <time dateTime={effectiveWeek}>{new Date(`${effectiveWeek}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</time>. Current-week targets stay in place until then.</p></header>
    <section className="target-panel">
      <label>Member<select value={member.id} onChange={event => setMemberId(event.target.value as MemberProfile["id"])}>{members.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="target-form-grid">
        <label>Weight check-in for next Monday (kg)<input type="number" min="30" max="300" step="0.1" value={draft.weightKg} aria-invalid={!!fieldErrors.weightKg} aria-describedby={fieldErrors.weightKg ? "weight-error" : "weight-help"} onChange={event => update("weightKg", Number(event.target.value))} />{fieldErrors.weightKg ? <small className="target-error" id="weight-error">{fieldErrors.weightKg}</small> : <small id="weight-help">This measurement changes the next-week projection.</small>}</label>
        <label>Activity level<select value={draft.activityLevel} onChange={event => { const level = event.target.value as MemberProfile["activityLevel"]; setDraft({ ...draft, activityLevel: level, activityFactor: level === "custom" ? draft.activityFactor : activityFactors[level] }); setPreview(null); setFieldErrors({}); }}><option value="inactive">Inactive</option><option value="low">Low active</option><option value="active">Active</option><option value="very">Very active</option><option value="custom">Custom</option></select></label>
        {draft.activityLevel === "custom" && <label>Custom activity factor<input type="number" min="1" max="2.5" step="0.01" value={draft.activityFactor} aria-invalid={!!fieldErrors.activityFactor} aria-describedby={fieldErrors.activityFactor ? "activity-error" : undefined} onChange={event => update("activityFactor", Number(event.target.value))} />{fieldErrors.activityFactor && <small className="target-error" id="activity-error">{fieldErrors.activityFactor}</small>}</label>}
        <label>Deficit target (%)<input type="number" min="0" max="60" step="1" value={draft.deficitPercent} aria-invalid={!!fieldErrors.deficitPercent} aria-describedby={fieldErrors.deficitPercent ? "deficit-error" : "deficit-help"} onChange={event => update("deficitPercent", Number(event.target.value))} />{fieldErrors.deficitPercent ? <small className="target-error" id="deficit-error">{fieldErrors.deficitPercent}</small> : <small id="deficit-help">A larger deficit lowers the estimated weekday calorie target.</small>}</label>
      </div>
      <details className="target-disclosure"><summary>Advanced settings</summary>
        <div className="target-form-grid target-advanced">
          <label>Protein (%)<input type="number" min="0" max="100" step="1" value={draft.proteinPercent} onChange={event => update("proteinPercent", Number(event.target.value))} /></label>
          <label>Carbohydrate (%)<input type="number" min="0" max="100" step="1" value={draft.carbsPercent} onChange={event => update("carbsPercent", Number(event.target.value))} /></label>
          <label>Fat (%)<input type="number" min="0" max="100" step="1" value={draft.fatPercent} onChange={event => update("fatPercent", Number(event.target.value))} /></label>
          <label>Fiber target (g/day)<input type="number" min="0" step="1" value={draft.fiberGrams} aria-invalid={!!fieldErrors.fiberGrams} aria-describedby={fieldErrors.fiberGrams ? "fiber-error" : undefined} onChange={event => update("fiberGrams", Number(event.target.value))} />{fieldErrors.fiberGrams && <small className="target-error" id="fiber-error">{fieldErrors.fiberGrams}</small>}</label>
          <label>Weekend reserve (kcal/week)<input type="number" min="0" step="50" value={draft.weekendReserve} aria-invalid={!!fieldErrors.weekendReserve} aria-describedby={fieldErrors.weekendReserve ? "reserve-error" : undefined} onChange={event => update("weekendReserve", Number(event.target.value))} />{fieldErrors.weekendReserve && <small className="target-error" id="reserve-error">{fieldErrors.weekendReserve}</small>}</label>
        </div>
        <p className={macroTotal === 100 ? "target-help" : "target-error"} role={macroTotal === 100 ? undefined : "status"}>{macroTotal === 100 ? "Macro percentages total 100%." : `Macro percentages total ${macroTotal}%; they must equal 100%.`}</p>
        {fieldErrors.macros && <small className="target-error" role="alert">{fieldErrors.macros}</small>}
      </details>
      <div className="target-actions"><button type="button" className="secondary" onClick={() => { setDraft(initial); setPreview(null); setFieldErrors({}); setError(""); }} disabled={busy}>Discard changes</button><button type="button" onClick={makePreview} disabled={busy}>{busy ? "Preparing…" : "Preview next week"}</button></div>
    </section>

    {error && <p className="feature-error" role="alert">{error}</p>}
    {preview && <section className="target-panel target-preview" aria-labelledby="preview-heading" aria-live="polite">
      <div className="target-preview-heading"><div><p className="feature-eyebrow">Proposed target set</p><h2 id="preview-heading">Week of {new Date(`${effectiveWeek}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</h2></div><button type="button" className="secondary" onClick={() => { setPreview(null); setDraft(initial); setFieldErrors({}); }}>Close preview</button></div>
      <p>{preview.recommendation}</p>
      {advisory && <p className="target-advisory" role="status">{advisory}</p>}
      <div className="target-table-wrap"><table><caption>Current versus proposed next-week targets</caption><thead><tr><th scope="col">Target</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead><tbody>
        <tr><th scope="row">Weekday calories</th><td>{Math.round(preview.current.weekdayCalories)} kcal</td><td>{Math.round(preview.proposed.weekdayCalories)} kcal</td></tr>
        <tr><th scope="row">Weekly calorie budget</th><td>{Math.round(preview.current.weeklyCalories)} kcal</td><td>{Math.round(preview.proposed.weeklyCalories)} kcal</td></tr>
        <tr><th scope="row">Protein</th><td>{preview.current.macroGrams.protein.toFixed(0)} g</td><td>{preview.proposed.macroGrams.protein.toFixed(0)} g</td></tr>
        <tr><th scope="row">Carbohydrate</th><td>{preview.current.macroGrams.carbs.toFixed(0)} g</td><td>{preview.proposed.macroGrams.carbs.toFixed(0)} g</td></tr>
        <tr><th scope="row">Fat</th><td>{preview.current.macroGrams.fat.toFixed(0)} g</td><td>{preview.proposed.macroGrams.fat.toFixed(0)} g</td></tr>
        <tr><th scope="row">Fiber</th><td>{preview.current.fiberGrams} g</td><td>{preview.proposed.fiberGrams} g</td></tr>
      </tbody></table></div>
      <p className="target-help">The proposal takes effect on {new Date(`${effectiveWeek}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}. Your weight check-in and all staged settings are included together.</p>
      <div className="target-actions"><button type="button" onClick={apply} disabled={busy}>{busy ? "Applying…" : "Apply next-week targets"}</button></div>
    </section>}

    <details className="target-disclosure target-method"><summary>Profile, calculation, guidance, and history</summary>
      <h2>{member.name}</h2><p>Birthday: {member.birthday} · Sex setting: {member.sex} · Height: {member.heightCm} cm · Current weight: {member.currentWeightKg} kg · Activity: {activityNames[member.activityLevel]} (×{member.activityFactor})</p>
      <h3>Calorie budget breakdown</h3><p>Estimated resting calories use the Mifflin–St Jeor equation for supported adult profiles, then activity level estimates maintenance. The deficit sets a weekly calorie budget; weekend reserve is allocated before dividing the remaining budget across five weekdays.</p>
      <h3>Planning guidance and sources</h3><p>These are planning estimates, not medical advice. Needs vary. Seek qualified guidance for medical conditions, pregnancy or breastfeeding, people under 19, eating-disorder concerns, or very low calorie targets.</p>
      <ul><li><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noreferrer">Mifflin–St Jeor equation</a></li><li><a href="https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet" target="_blank" rel="noreferrer">NICE: physical activity and diet guidance</a></li></ul>
      <h3>Weight check-ins</h3>{memberHistory.length ? <ul>{memberHistory.map(item => <li key={`${item.date}-${item.weightKg}`}>{item.date}: {item.weightKg} kg</li>)}</ul> : <p>No recorded weight check-ins.</p>}
    </details>
  </main>;
}
