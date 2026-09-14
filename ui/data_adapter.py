"""Normalize SPPARKS text dumps without assuming site order or frame number = time."""
from pathlib import Path
import math
from models import get_model


def read_energy(path):
    rows = []
    columns = None
    if not Path(path).exists():
        return rows
    for line in Path(path).read_text(errors='replace').splitlines():
        fields = line.split()
        if fields and fields[0] == 'Time' and 'Energy' in fields:
            columns = fields
        elif columns and len(fields) == len(columns):
            try:
                rows.append((float(fields[0]), float(fields[columns.index('Energy')])))
            except ValueError:
                pass
    return rows


def read_dump(path, log_path=None, model_id='potts'):
    get_model(model_id)
    lines = Path(path).read_text().splitlines()
    frames, ids, positions, bounds = [], None, None, None
    i = 0
    energies = read_energy(log_path) if log_path else []
    while i < len(lines):
        if not lines[i].strip():
            i += 1
            continue
        if lines[i] != 'ITEM: TIMESTEP':
            raise ValueError('Missing TIMESTEP header')
        stamp = lines[i + 1].split()
        time = float(stamp[-1])  # SPPARKS: snapshot index followed by model time.
        if lines[i + 2] not in ('ITEM: NUMBER OF ATOMS', 'ITEM: NUMBER OF SITES'):
            raise ValueError('Missing site count')
        n = int(lines[i + 3])
        if not lines[i + 4].startswith('ITEM: BOX BOUNDS'):
            raise ValueError('Missing bounds')
        frame_bounds = [[float(v) for v in lines[i + k].split()[:2]] for k in (5, 6, 7)]
        header = lines[i + 8].split()[2:]
        state_key = 'site' if 'site' in header else 'type'
        indices = [header.index(k) for k in ('id', 'x', 'y', 'z', state_key)]
        if i + 9 + n > len(lines):
            raise ValueError('Incomplete snapshot')
        rows = []
        for line in lines[i + 9:i + 9 + n]:
            parts = line.split()
            rows.append((int(parts[indices[0]]), *[float(parts[j]) for j in indices[1:4]], int(parts[indices[4]])))
        rows.sort(key=lambda row: row[0])
        frame_ids = [r[0] for r in rows]
        coords = [list(r[1:4]) for r in rows]
        if len(set(frame_ids)) != n or not all(math.isfinite(v) for p in coords for v in p):
            raise ValueError('Invalid site data')
        if ids is None:
            ids, positions, bounds = frame_ids, coords, frame_bounds
        elif frame_ids != ids or coords != positions or bounds != frame_bounds:
            raise ValueError('Only a fixed lattice is supported by this adapter')
        if frames and time <= frames[-1]['time']:
            raise ValueError('Snapshot times must increase')
        nearest = min(energies, key=lambda row: abs(row[0] - time)) if energies else None
        energy = nearest[1] if nearest and math.isclose(nearest[0], time, rel_tol=1e-5, abs_tol=0.025) else None
        frames.append({'time': time, 'states': [r[4] for r in rows], 'energy': energy})
        i += n + 9
    if not frames:
        raise ValueError('Empty dump')
    return {'schemaVersion': 1, 'modelId': model_id, 'ids': ids, 'positions': positions,
            'bounds': bounds, 'spacing': 2.42 if model_id == 'thin_film' else 1, 'frames': frames}


def validate_parameters(raw, model_id='potts'):
    model = get_model(model_id)
    rules = {p['id']: (p['min'], p['max'], p['default'], p['type']=='integer') for p in model['parameters']}
    if not isinstance(raw, dict) or set(raw) - set(rules):
        raise ValueError('参数字段不受支持')
    out = {}
    for key, (low, high, default, integer) in rules.items():
        value = raw.get(key, default)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'{key} 必须是有限数值')
        if not low <= value <= high or (integer and int(value) != value):
            raise ValueError(f'{key} 必须在 {low}–{high} 范围内' + ('且为整数' if integer else ''))
        out[key] = int(value) if integer else value
    if model_id == 'thin_film' and out['flux'] * out['duration'] > out['size'] * 24:
        raise ValueError('预计沉积量过大，请降低沉积率或终止时间，或增加横向尺寸')
    return out


def input_script(p, model_id='potts'):
    get_model(model_id)
    if model_id == 'thin_film':
        source = Path(__file__).resolve().parent.parent / 'spparks-08Oct25/examples/thin_film_growth/in.thin_film.no.schwoebel'
        barriers = '\n'.join(line for line in source.read_text().splitlines() if line.strip().startswith('barrier'))
        return f'''# Reduced 2D thin-film example; original nonlinear hop barriers
seed {p['seed']}
app_style diffusion nonlinear hop
dimension 2
lattice tri 2.42
region box block 0 {p['size']} 0 24 -0.5 0.5
create_box box
create_sites box
set site value 1
region bottom block INF INF INF 1.0 INF INF
set site value 2 region bottom
region top block INF INF 22.9 INF INF INF
set site value 3 region top
solve_style tree
deposition event {p['flux']:g} 0 -1 0 1.0 1 5
temperature {p['temperature']}
diag_style energy stats yes
diag_style diffusion
stats {p['duration']/10:g}
dump 1 text {p['duration']/10:g} result.dump id site x y z
{barriers}
run {p['duration']:g}
'''
    app = 'ising' if model_id == 'ising' else f"potts {p['states']}"
    lattice = 'sc/6n' if model_id == 'ising' else 'sc/26n'
    states = 2 if model_id == 'ising' else p['states']
    return f'''# Generated by SPPARKS Material Lab; fixed 3D periodic {model_id} template
seed {p['seed']}
app_style {app}
dimension 3
boundary p p p
lattice {lattice} 1.0
region box block 0 {p['size']} 0 {p['size']} 0 {p['size']}
create_box box
create_sites box
set site range 1 {states}
sweep random
sector yes
diag_style energy
temperature {p['temperature']}
stats {p['duration'] / 10:g}
dump 1 text {p['duration'] / 10:g} result.dump id site x y z
run {p['duration']}
'''
