"""Regenerate reproducible, engine-produced examples; never fabricate frames."""
import json
import subprocess
from pathlib import Path
from data_adapter import validate_parameters, input_script, read_dump
from models import get_model
from server import ROOT, BINARY, DISTRO, linux_path
import os


def generate(model_id):
    model = get_model(model_id)
    parameters = validate_parameters({}, model_id)
    folder = ROOT / 'demo' / model_id
    folder.mkdir(parents=True, exist_ok=True)
    script = input_script(parameters, model_id)
    (folder / 'input.in').write_text(script, encoding='utf-8')
    command = ['wsl','-d',DISTRO,'--cd',linux_path(folder),'--exec','/usr/bin/timeout','180',linux_path(BINARY),'-in','input.in'] if os.name=='nt' else [str(BINARY),'-in','input.in']
    result = subprocess.run(command, cwd=folder, capture_output=True, timeout=195)
    if result.returncode:
        raise RuntimeError(result.stdout.decode(errors='replace')[-2500:])
    data = read_dump(folder/'result.dump', folder/'log.spparks', model_id)
    data.update(title=model['title'], source='bundled', parameters=parameters,
                provenance={'description':'本地 SPPARKS 生成的随包案例 · 2026-09-14',
                            'origin':model['origin'], 'input':script,
                            'engineVersion':result.stdout.decode(errors='replace').splitlines()[0],
                            'energy':'SPPARKS diag_style energy，格点能量总和'})
    (folder/'result.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',',':')),encoding='utf-8')
    print(model_id, len(data['ids']), 'sites',len(data['frames']),'frames',
          'energy',data['frames'][0]['energy'],data['frames'][-1]['energy'], flush=True)


if __name__=='__main__':
    for model_id in ('ising','thin_film'):
        generate(model_id)
