"""Local-only UI and bounded SPPARKS job runner. No third-party Python dependencies."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote
import argparse
import json
import os
import subprocess
import threading
import time
import uuid

from data_adapter import read_dump, read_energy, validate_parameters, input_script
from models import MODELS, get_model

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'spparks-08Oct25'
RUNS = ROOT / 'runs'
JOBS = {}
LOCK = threading.Lock()
ENGINE = {'available': False, 'message': '正在检测本地计算引擎…'}
DISTRO = os.environ.get('SPPARKS_WSL_DISTRO', 'Ubuntu-24.04')
BINARY = Path(os.environ.get('SPPARKS_BINARY', str(SOURCE / 'src' / 'spk_serial')))


def linux_path(path):
    p = Path(path).resolve()
    return '/mnt/' + p.drive[0].lower() + p.as_posix()[2:] if os.name == 'nt' else str(p)


def probe_engine():
    try:
        command = ['wsl', '-d', DISTRO, '--exec', 'test', '-x', linux_path(BINARY)] if os.name == 'nt' else ['test', '-x', str(BINARY)]
        result = subprocess.run(command, capture_output=True, timeout=45, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        ENGINE.update(available=result.returncode == 0, message='本地 SPPARKS · WSL' if result.returncode == 0 else '引擎不可用；仍可回放历史结果')
    except (OSError, subprocess.TimeoutExpired):
        ENGINE.update(available=False, message='引擎不可用；请检查 WSL 和 SPPARKS 路径')


def run_job(job):
    folder = RUNS / job['id']
    try:
        model_id = job.get('modelId', 'potts')
        model = get_model(model_id)
        folder.mkdir(parents=True)
        (folder / 'input.in').write_text(input_script(job['parameters'], model_id), encoding='utf-8')
        command = ['wsl', '-d', DISTRO, '--cd', linux_path(folder), '--exec', '/usr/bin/timeout', '180', linux_path(BINARY), '-in', 'input.in'] if os.name == 'nt' else [str(BINARY), '-in', 'input.in']
        with (folder / 'console.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=folder, stdout=log, stderr=subprocess.STDOUT,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            try:
                code = process.wait(timeout=195)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                raise ValueError('运行超过 180 秒限制，请减小尺寸或仿真时长')
        if code:
            tail = (folder / 'console.log').read_text(errors='replace')[-2500:]
            raise ValueError('SPPARKS 运行失败：' + tail)
        result = read_dump(folder / 'result.dump', folder / 'log.spparks', model_id)
        result.update(title=model['title'], source='computed', parameters=job['parameters'],
                      provenance={'description': '本地 SPPARKS 真实计算', 'jobId': job['id'],
                                  'input': input_script(job['parameters'], model_id), 'energy': 'SPPARKS diag_style energy，格点能量总和'})
        (folder / 'result.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        with LOCK:
            job.update(status='complete', elapsed=round(time.time() - job['started'], 1))
    except Exception as exc:
        with LOCK:
            job.update(status='failed', error=str(exc), elapsed=round(time.time() - job['started'], 1))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def respond(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/engine':
            return self.respond(ENGINE)
        if path == '/api/models':
            return self.respond(list(MODELS.values()))
        if path.startswith('/api/demo/'):
            model_id = path.removeprefix('/api/demo/')
            if model_id not in MODELS:
                return self.respond({'error': '不支持的模型'}, 404)
            if model_id == 'potts':
                path = '/api/demo'
            else:
                file = ROOT / 'demo' / model_id / 'result.json'
                if not file.exists():
                    return self.respond({'error': '案例数据尚未生成'}, 503)
                return self.respond(json.loads(file.read_text(encoding='utf-8')))
        if path == '/api/demo':
            data = read_dump(SOURCE / 'examples/potts/dump.potts', SOURCE / 'examples/potts/log.potts.11Nov09.linux.1')
            data.update(title='Potts · 晶粒长大', source='historical', parameters=validate_parameters({}),
                        provenance={'description': 'SPPARKS 随包历史示例 · 11 Nov 2009', 'dump': 'examples/potts/dump.potts',
                                    'log': 'examples/potts/log.potts.11Nov09.linux.1', 'energy': 'SPPARKS diag_style energy，格点能量总和'})
            return self.respond(data)
        if path.startswith('/api/jobs/'):
            parts = path.strip('/').split('/')
            with LOCK:
                job = JOBS.get(parts[2]) if len(parts) >= 3 else None
                snapshot = dict(job) if job else None
            if not job:
                return self.respond({'error': '任务不存在'}, 404)
            if len(parts) == 4 and parts[3] == 'result':
                if job['status'] != 'complete':
                    return self.respond({'error': '结果尚未就绪'}, 409)
                return self.respond(json.loads((RUNS / job['id'] / 'result.json').read_text(encoding='utf-8')))
            rows = read_energy(RUNS / job['id'] / 'log.spparks')
            snapshot['simulationTime'] = rows[-1][0] if rows else 0
            snapshot['elapsed'] = snapshot.get('elapsed', round(time.time() - job['started'], 1))
            return self.respond(snapshot)
        allowed = {'/', '/index.html', '/styles.css', '/app.js', '/viewer.js', '/result-schema.js', '/model.json'}
        if path not in allowed:
            vendor_root = (ROOT / 'node_modules/three').resolve()
            requested = (ROOT / unquote(path).lstrip('/')).resolve()
            if not path.startswith('/node_modules/three/') or not requested.is_relative_to(vendor_root) or requested.suffix != '.js':
                return self.respond({'error': '文件不存在'}, 404)
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/jobs':
            return self.respond({'error': '接口不存在'}, 404)
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.respond({'error': '只接受本地页面请求'}, 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                raise ValueError('请求大小无效')
            raw = json.loads(self.rfile.read(length))
            model_id = 'potts'
            if isinstance(raw, dict) and 'modelId' in raw:
                if set(raw) != {'modelId', 'parameters'}:
                    raise ValueError('模型请求字段无效')
                model_id = raw['modelId']
                raw = raw['parameters']
            parameters = validate_parameters(raw, model_id)
        except (ValueError, TypeError) as exc:
            return self.respond({'error': str(exc)}, 400)
        if not ENGINE['available']:
            return self.respond({'error': ENGINE['message']}, 503)
        with LOCK:
            if any(j['status'] == 'running' for j in JOBS.values()):
                return self.respond({'error': '已有任务正在计算，请等待完成'}, 409)
            job = {'id': uuid.uuid4().hex[:12], 'modelId': model_id, 'status': 'running', 'parameters': parameters, 'started': time.time()}
            JOBS[job['id']] = job
        threading.Thread(target=run_job, args=(job,), daemon=True).start()
        self.respond(dict(job), 202)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    threading.Thread(target=probe_engine, daemon=True).start()
    print(f'SPPARKS Material Lab: http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
