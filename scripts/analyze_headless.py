#!/usr/bin/env python3
"""
analyze_headless.py — Aggregated quality report for sims-headless.sqlite

Usage:
    python3 scripts/analyze_headless.py [path/to/sims-headless.sqlite] [--csv]

    --csv   also writes one CSV per section to headless-runs/csv/
"""

import sqlite3
import json
import sys
import os
import csv
import math
from collections import defaultdict, Counter
from statistics import mean, median, stdev

DB_PATH = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else \
          'headless-runs/sims-headless.sqlite'
EXPORT_CSV = '--csv' in sys.argv

con = sqlite3.connect(DB_PATH)
con.row_factory = sqlite3.Row

# ── helpers ──────────────────────────────────────────────────────────────────

def q(sql, *params):
    return con.execute(sql, params).fetchall()

def jcol(rows, col='event_json'):
    return [json.loads(r[col]) for r in rows]

def pct(num, den):
    return f"{100*num/den:.1f}%" if den else "n/a"

def fmt_dist(counter, top=8, total=None):
    items = counter.most_common(top)
    tot = total or sum(counter.values())
    return "  " + "\n  ".join(f"{k:<30} {v:>7}  {pct(v, tot)}" for k, v in items)

def stats_line(values):
    if not values: return "no data"
    return (f"mean={mean(values):.2f}  median={median(values):.2f}  "
            f"min={min(values):.2f}  max={max(values):.2f}"
            + (f"  σ={stdev(values):.2f}" if len(values) > 1 else ""))

def write_csv(name, rows, fieldnames=None):
    if not EXPORT_CSV: return
    os.makedirs('headless-runs/csv', exist_ok=True)
    path = f'headless-runs/csv/{name}.csv'
    with open(path, 'w', newline='') as f:
        if rows and isinstance(rows[0], dict):
            w = csv.DictWriter(f, fieldnames=fieldnames or rows[0].keys())
            w.writeheader(); w.writerows(rows)
        else:
            w = csv.writer(f); w.writerows(rows)

# ── section printer ───────────────────────────────────────────────────────────

def section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print('='*70)

# ─────────────────────────────────────────────────────────────────────────────
#  1. RUN OVERVIEW
# ─────────────────────────────────────────────────────────────────────────────
section("1. RUN OVERVIEW")

runs = q("SELECT id, seed, ticks, summary_json FROM runs ORDER BY seed")
summaries = [json.loads(r['summary_json']) for r in runs]
n_runs = len(summaries)
print(f"  Runs: {n_runs}   Ticks/run: {summaries[0]['ticks'] if summaries else '?'}")

keys_scalar = [
    'socialInteractions','conflictRate','finalMeanAffinity','negativeRelationshipRate',
    'totalVisits','visitAcceptanceRate','promotions','careerSwitches','crafted',
    'careerActiveRate','skillLevelUps','avgSkillTotal','romanceSparks','romanceActivationRate',
]

run_rows = []
for k in keys_scalar:
    vals = [s[k] for s in summaries if k in s]
    if not vals: continue
    row = dict(metric=k, **{
        'mean': round(mean(vals), 3),
        'median': round(median(vals), 3),
        'min': round(min(vals), 3),
        'max': round(max(vals), 3),
        'stdev': round(stdev(vals), 3) if len(vals) > 1 else 0,
    })
    run_rows.append(row)
    print(f"  {k:<30}  {stats_line(vals)}")

write_csv('01_run_overview', run_rows)

# quality flags
conf_vals  = [s.get('conflictRate', 0) for s in summaries]
acpt_vals  = [s.get('visitAcceptanceRate', 0) for s in summaries if s.get('totalVisits', 0) > 0]
romance_pr = [s.get('romanceActivationRate', 0) for s in summaries]

print("\n  ── Quality flags ──")
if max(conf_vals) == 0:
    print("  ⚠  conflictRate = 0 in ALL runs — conflict algorithm may not be firing")
if acpt_vals and mean(acpt_vals) > 0.95:
    print("  ⚠  visitAcceptanceRate very high (mean={:.2f}) — rejection logic may be too permissive".format(mean(acpt_vals)))
if mean(romance_pr) < 0.05:
    print("  ⚠  romanceActivationRate very low (mean={:.3f}) — romance threshold may be too high".format(mean(romance_pr)))
if mean(romance_pr) > 0.4:
    print("  ⚠  romanceActivationRate very high (mean={:.3f}) — romance fires too easily".format(mean(romance_pr)))

# ─────────────────────────────────────────────────────────────────────────────
#  2. EVENT DISTRIBUTION
# ─────────────────────────────────────────────────────────────────────────────
section("2. EVENT TYPE DISTRIBUTION (all runs combined)")

etype_rows = q("SELECT event_type, COUNT(*) AS n FROM event_log GROUP BY event_type ORDER BY n DESC")
etype_total = sum(r['n'] for r in etype_rows)
print(f"  Total events logged: {etype_total:,}")
print(f"\n  {'event_type':<35} {'count':>8}  {'%':>6}")
print("  " + "-"*55)
csv_etypes = []
for r in etype_rows:
    print(f"  {r['event_type']:<35} {r['n']:>8}  {pct(r['n'], etype_total):>6}")
    csv_etypes.append({'event_type': r['event_type'], 'count': r['n'],
                       'pct': round(100*r['n']/etype_total, 2)})
write_csv('02_event_distribution', csv_etypes)

# ─────────────────────────────────────────────────────────────────────────────
#  3. SOCIAL INTERACTIONS
# ─────────────────────────────────────────────────────────────────────────────
section("3. SOCIAL INTERACTIONS")

social_rows = q("SELECT event_json FROM event_log WHERE event_type='social:interaction'")
socials = jcol(social_rows)
n_social = len(socials)
print(f"  Total: {n_social:,}  ({n_social/n_runs:.0f} / run)")

# Interaction type distribution
itype = Counter(s.get('interactionType') for s in socials)
print(f"\n  Interaction types ({len(itype)} distinct):")
print(fmt_dist(itype, total=n_social))

# Acceptance rate per type
by_type = defaultdict(lambda: [0, 0])
for s in socials:
    t = s.get('interactionType', '?')
    by_type[t][0] += 1
    by_type[t][1] += int(bool(s.get('accepted')))
print("\n  Acceptance rate per type:")
acpt_csv = []
for t, (total, acc) in sorted(by_type.items(), key=lambda x: -x[1][0]):
    line = f"  {t:<25} {pct(acc, total):>7}  ({acc}/{total})"
    print(line)
    acpt_csv.append({'type': t, 'total': total, 'accepted': acc,
                     'acceptance_rate': round(acc/total, 3) if total else 0})
write_csv('03_social_acceptance', acpt_csv)

# Relationship delta distribution
deltas = [s.get('delta', 0) for s in socials if 'delta' in s]
if deltas:
    pos = sum(1 for d in deltas if d > 0)
    neg = sum(1 for d in deltas if d < 0)
    zero = sum(1 for d in deltas if d == 0)
    print(f"\n  Relationship delta: {stats_line(deltas)}")
    print(f"  +ve={pos}  zero={zero}  -ve={neg}")

# Dominant motive
motives = Counter(s.get('dominantMotive') for s in socials if s.get('dominantMotive'))
print(f"\n  Dominant motive distribution:")
print(fmt_dist(motives, total=n_social))

# Active goal at time of interaction
goals = Counter(s.get('activeGoal') for s in socials if s.get('activeGoal'))
print(f"\n  Active goal during social interaction:")
print(fmt_dist(goals, total=n_social))

# ─────────────────────────────────────────────────────────────────────────────
#  4. NEEDS & CRISES
# ─────────────────────────────────────────────────────────────────────────────
section("4. NEEDS & CRISES")

crisis_rows = q("SELECT event_json FROM event_log WHERE event_type='need:crisis'")
crises = jcol(crisis_rows)
n_crises = len(crises)
print(f"  Total crises: {n_crises:,}  ({n_crises/n_runs:.0f} / run)")

need_types = Counter(c.get('need') for c in crises)
print(f"\n  Crisis by need:")
print(fmt_dist(need_types, total=n_crises))

vals_by_need = defaultdict(list)
for c in crises:
    vals_by_need[c.get('need', '?')].append(c.get('value', 0))

print("\n  Mean crisis severity (value at crisis point) per need:")
crisis_csv = []
for need, vals in sorted(vals_by_need.items(), key=lambda x: -len(x[1])):
    m = mean(vals)
    print(f"  {need:<15}  mean={m:.2f}  min={min(vals):.2f}  max={max(vals):.2f}  n={len(vals)}")
    crisis_csv.append({'need': need, 'count': len(vals),
                       'mean_value': round(m, 3), 'min': round(min(vals), 3), 'max': round(max(vals), 3)})
write_csv('04_need_crises', crisis_csv)

# Crisis by hour-of-day (circadian pattern)
hour_crisis = Counter(round(float(c['simHour'])) % 24 for c in crises if 'simHour' in c)
print(f"\n  Crisis frequency by sim hour (top 5):")
for h, cnt in hour_crisis.most_common(5):
    print(f"  {h:02d}:00  {cnt}")

# ─────────────────────────────────────────────────────────────────────────────
#  5. WELLBEING
# ─────────────────────────────────────────────────────────────────────────────
section("5. WELLBEING (wellbeing:evaluated events)")

wb_rows = q("SELECT event_json FROM event_log WHERE event_type='wellbeing:evaluated'")
wbs = jcol(wb_rows)
n_wb = len(wbs)
print(f"  Total evaluations: {n_wb:,}")

self_scores   = [w['selfScore']   for w in wbs if 'selfScore'   in w]
family_scores = [w['familyScore'] for w in wbs if 'familyScore' in w]

print(f"\n  selfScore:    {stats_line(self_scores)}")
print(f"  familyScore:  {stats_line(family_scores)}")

# Mood distribution
moods = Counter(w.get('mood') for w in wbs if w.get('mood'))
print(f"\n  Mood distribution ({n_wb:,} evaluations):")
print(fmt_dist(moods, total=n_wb))

# Dominant drive
drives = Counter(w.get('dominant') for w in wbs if w.get('dominant'))
print(f"\n  Dominant drive:")
print(fmt_dist(drives, total=n_wb))

# Score buckets
def bucket(score, buckets=[(20,'<20'),(40,'20-40'),(60,'40-60'),(80,'60-80'),(101,'80+')]):
    for limit, label in buckets:
        if score < limit: return label
    return '80+'

self_bkts = Counter(bucket(s) for s in self_scores)
print(f"\n  selfScore buckets: " +
      "  ".join(f"{k}={v}({pct(v, len(self_scores))})" for k, v in sorted(self_bkts.items())))

# Quality flag
if self_scores and mean(self_scores) < 40:
    print("  ⚠  Mean selfScore < 40 — Sims are chronically unhappy")
if self_scores and mean(self_scores) > 80:
    print("  ⚠  Mean selfScore > 80 — needs may be too easy to satisfy")

write_csv('05_wellbeing', [
    {'metric': 'selfScore_mean', 'value': round(mean(self_scores), 3)},
    {'metric': 'familyScore_mean', 'value': round(mean(family_scores), 3)},
    *[{'metric': f'mood_{k}', 'value': v} for k, v in moods.items()],
    *[{'metric': f'drive_{k}', 'value': v} for k, v in drives.items()],
])

# ─────────────────────────────────────────────────────────────────────────────
#  6. EMOTIONS
# ─────────────────────────────────────────────────────────────────────────────
section("6. EMOTION TRIGGERS")

em_rows = q("SELECT event_json FROM event_log WHERE event_type='emotion:triggered'")
ems = jcol(em_rows)
n_em = len(ems)
print(f"  Total emotion triggers: {n_em:,}  ({n_em/n_runs:.0f} / run)")

def emotion_label(e):
    try:
        d = json.loads(e['def']) if isinstance(e.get('def'), str) else e.get('def', {})
        return d.get('label', '?')
    except Exception:
        return '?'

labels = Counter(emotion_label(e) for e in ems)
intensities_by_label = defaultdict(list)
for e in ems:
    intensities_by_label[emotion_label(e)].append(e.get('intensity', 0))

print(f"\n  {'Emotion':<20} {'count':>7}  {'%':>6}  {'mean_intensity':>15}  {'min':>6}  {'max':>6}")
print("  " + "-"*70)
em_csv = []
for label, cnt in labels.most_common():
    ivs = intensities_by_label[label]
    mi = mean(ivs)
    print(f"  {label:<20} {cnt:>7}  {pct(cnt, n_em):>6}  {mi:>15.3f}  {min(ivs):>6.3f}  {max(ivs):>6.3f}")
    em_csv.append({'emotion': label, 'count': cnt, 'pct': round(100*cnt/n_em, 2),
                   'mean_intensity': round(mi, 3), 'min': round(min(ivs), 3), 'max': round(max(ivs), 3)})
write_csv('06_emotions', em_csv)

# ─────────────────────────────────────────────────────────────────────────────
#  7. RELATIONSHIPS
# ─────────────────────────────────────────────────────────────────────────────
section("7. RELATIONSHIP SNAPSHOTS")

rel_count = q("SELECT COUNT(*) AS n FROM relationship_snapshots")[0]['n']
print(f"  Total snapshots: {rel_count:,}  ({rel_count/n_runs:.0f} / run)")

# Affinity distribution
aff_rows = q("SELECT affinity FROM relationship_snapshots WHERE affinity IS NOT NULL")
affinities = [r['affinity'] for r in aff_rows]
print(f"\n  Affinity: {stats_line(affinities)}")

neg_aff = sum(1 for a in affinities if a < 0)
print(f"  Negative affinity pairs: {neg_aff} ({pct(neg_aff, len(affinities))})")

# Relationship dimensions (from dims_json sample)
# Aggregate mean of each dimension across all snapshots
dim_sums = defaultdict(float)
dim_counts = defaultdict(int)
dim_sample = q("SELECT dims_json FROM relationship_snapshots")
for r in dim_sample:
    try:
        d = json.loads(r['dims_json'])
        for k, v in d.items():
            dim_sums[k] += v
            dim_counts[k] += 1
    except Exception:
        pass

if dim_counts:
    print(f"\n  Mean relationship dimensions across all snapshots:")
    dim_csv = []
    for dim in sorted(dim_counts.keys()):
        m = dim_sums[dim] / dim_counts[dim]
        print(f"  {dim:<15}  mean={m:.4f}")
        dim_csv.append({'dimension': dim, 'mean': round(m, 4), 'n': dim_counts[dim]})
    write_csv('07_relationship_dims', dim_csv)

# Affinity over time (early vs late ticks across all runs)
early = q("SELECT AVG(affinity) AS a FROM relationship_snapshots WHERE tick < 3000")
late  = q("SELECT AVG(affinity) AS a FROM relationship_snapshots WHERE tick > 7000")
ea, la = early[0]['a'], late[0]['a']
if ea is not None and la is not None:
    delta = la - ea
    arrow = "↑ growing" if delta > 0.5 else ("↓ declining" if delta < -0.5 else "→ stable")
    print(f"\n  Affinity trend:  early ticks (<3000) avg={ea:.3f}  late ticks (>7000) avg={la:.3f}")
    print(f"  Δ={delta:.3f}  {arrow}")
else:
    print(f"\n  Affinity trend: insufficient data (need runs > 7000 ticks)")

# ─────────────────────────────────────────────────────────────────────────────
#  8. SIM ACTIONS (AI behaviour)
# ─────────────────────────────────────────────────────────────────────────────
section("8. SIM ACTIONS (AI behaviour quality)")

act_rows = q("SELECT event_json FROM event_log WHERE event_type='sim:action'")
acts = jcol(act_rows)
n_acts = len(acts)
print(f"  Total actions: {n_acts:,}  ({n_acts/n_runs:.0f} / run)")

# Extract verb from label e.g. "Sleep(bed)" → "sleep"  or  "social:hug"
# Empty label = ActionQueue emits 'queue empty' notification, not a real decision.
def action_verb(a):
    label = a.get('label', '')
    if not label:
        return 'idle'
    if '(' in label:
        return label.split('(')[0].strip().lower()
    return label.lower()

verbs = Counter(action_verb(a) for a in acts)
print(f"\n  Action distribution ({len(verbs)} distinct verbs, incl. overhead):")
print(fmt_dist(verbs, top=12, total=n_acts))

# Diversity: exclude navigation overhead (idle = queue-empty, walkto = pathing)
# These are not AI choices — they inflate the count of repetitive events.
OVERHEAD = {'idle', 'walkto'}
decision_verbs = Counter({k: v for k, v in verbs.items() if k not in OVERHEAD})
n_decisions = sum(decision_verbs.values())
overhead_pct = pct(n_acts - n_decisions, n_acts)
print(f"\n  (excluding overhead: idle+walkTo = {overhead_pct} of all events)")
print(f"  Real decision distribution ({n_decisions:,} events, {len(decision_verbs)} verbs):")
print(fmt_dist(decision_verbs, top=10, total=n_decisions))

total_dec = sum(decision_verbs.values())
entropy = -sum((c/total_dec)*math.log2(c/total_dec) for c in decision_verbs.values() if c > 0)
max_entropy = math.log2(len(decision_verbs)) if len(decision_verbs) > 1 else 1
norm_entropy = entropy / max_entropy if max_entropy > 0 else 0
print(f"\n  Decision diversity (normalised Shannon entropy): {norm_entropy:.3f}  "
      f"[0=one action, 1=perfectly even]")
if norm_entropy < 0.5:
    print("  ⚠  Low action diversity — AI may be stuck in a loop")

write_csv('08_sim_actions', [
    {'verb': v, 'count': c, 'pct': round(100*c/n_decisions, 2), 'is_overhead': v in OVERHEAD}
    for v, c in verbs.most_common()
])

# ─────────────────────────────────────────────────────────────────────────────
#  9. CAREER & SKILLS
# ─────────────────────────────────────────────────────────────────────────────
section("9. CAREER & SKILLS")

skill_rows = q("SELECT event_json FROM event_log WHERE event_type='skill:levelUp'")
skills = jcol(skill_rows)
skill_names = Counter(s.get('skill') or s.get('skillId') or '?' for s in skills)
print(f"  Total skill level-ups: {len(skills):,}  ({len(skills)/n_runs:.1f} / run)")
print(f"\n  By skill:")
print(fmt_dist(skill_names, total=len(skills)))

promo_rows = q("SELECT COUNT(*) AS n FROM event_log WHERE event_type='career:promoted'")[0]['n']
switch_rows = q("SELECT COUNT(*) AS n FROM event_log WHERE event_type='career:switched'")[0]['n']
print(f"\n  Promotions: {promo_rows}  ({promo_rows/n_runs:.1f}/run)")
print(f"  Career switches: {switch_rows}  ({switch_rows/n_runs:.1f}/run)")
if promo_rows == 0:
    print("  ⚠  Zero promotions across all runs — career progression may be broken")

# ─────────────────────────────────────────────────────────────────────────────
#  10. VISITOR FLOW
# ─────────────────────────────────────────────────────────────────────────────
section("10. VISITOR FLOW")

vis_etypes = [
    'visitor:scheduled','visitor:arriving','visitor:entered',
    'visitor:doorbell','visitor:noAnswer','visitor:rejected','visitor:left',
]
for et in vis_etypes:
    n = q("SELECT COUNT(*) AS n FROM event_log WHERE event_type=?", et)[0]['n']
    print(f"  {et:<28}  {n:>7}  ({n/n_runs:.1f}/run)")

scheduled = q("SELECT COUNT(*) AS n FROM event_log WHERE event_type='visitor:scheduled'")[0]['n']
entered   = q("SELECT COUNT(*) AS n FROM event_log WHERE event_type='visitor:entered'")[0]['n']
rejected  = q("SELECT COUNT(*) AS n FROM event_log WHERE event_type='visitor:rejected'")[0]['n']
if scheduled:
    print(f"\n  Entry rate: {pct(entered, scheduled)}   Rejection rate: {pct(rejected, scheduled)}")

# ─────────────────────────────────────────────────────────────────────────────
#  11. ALGORITHMIC QUALITY SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
section("11. ALGORITHMIC QUALITY SUMMARY")

checks = []

# Social
soc_per_run = n_social / n_runs
checks.append(("Social interactions/run", soc_per_run,
    "low" if soc_per_run < 50 else "ok" if soc_per_run < 1000 else "high"))

overall_acceptance = sum(s.get('accepted', False) for s in socials) / n_social if n_social else 0
checks.append(("Social acceptance rate", f"{overall_acceptance:.1%}",
    "⚠ near 100%" if overall_acceptance > 0.95 else
    "⚠ very low"  if overall_acceptance < 0.3  else "ok"))

checks.append(("Conflict rate (summary avg)",
    round(mean([s.get('conflictRate', 0) for s in summaries]), 4),
    "⚠ always 0" if max(s.get('conflictRate', 0) for s in summaries) == 0 else "ok"))

# Wellbeing
if self_scores:
    mean_wb = mean(self_scores)
    checks.append(("Mean selfScore (wellbeing)",
        round(mean_wb, 2),
        "⚠ very low (stressed)" if mean_wb < 35 else
        "⚠ very high (trivial)" if mean_wb > 82 else "ok"))

# AI diversity
checks.append(("Action diversity (entropy)", round(norm_entropy, 3),
    "⚠ low" if norm_entropy < 0.5 else "ok"))

# Affinity growth
if early[0]['a'] and late[0]['a']:
    delta = late[0]['a'] - early[0]['a']
    checks.append(("Affinity growth early→late",
        round(delta, 3),
        "⚠ declining" if delta < -1 else "⚠ no growth" if delta < 0.1 else "ok"))

# Romance
mean_rom = mean(romance_pr)
checks.append(("Romance activation rate", round(mean_rom, 4),
    "⚠ near 0" if mean_rom < 0.02 else
    "⚠ very high" if mean_rom > 0.5 else "ok"))

# Career
checks.append(("Career promotions/run", round(promo_rows/n_runs, 2),
    "⚠ zero" if promo_rows == 0 else "ok"))

STATUS_ICON = {"ok": "✓", "⚠ always 0": "✗", "⚠ near 0": "⚠", "⚠ near 100%": "⚠",
               "⚠ very low": "⚠", "⚠ very high": "⚠", "⚠ low": "⚠",
               "⚠ no growth": "⚠", "⚠ declining": "⚠", "⚠ zero": "⚠",
               "low": "⚠", "high": "⚠"}

print()
for label, value, status in checks:
    icon = STATUS_ICON.get(status, "✓" if status == "ok" else "⚠")
    print(f"  {icon}  {label:<40}  {value!s:<12}  {status}")

# Issues to investigate
issues = [(l, v, s) for l, v, s in checks if s != "ok"]
if issues:
    print(f"\n  Suggested investigations ({len(issues)} items):")
    for label, val, status in issues:
        print(f"    → {label}: {val} ({status})")
else:
    print("\n  All checks passed — algorithms appear healthy.")

print()

if EXPORT_CSV:
    write_csv('11_quality_summary', [
        {'check': l, 'value': v, 'status': s} for l, v, s in checks
    ])
    print(f"  CSV files written to headless-runs/csv/\n")

con.close()
