"""Read-only host inventory. Unknown values stay null; no resource allocation claims."""
import ctypes
import json
import os
import platform
import subprocess
import time
from pathlib import Path


def detect_platform():
    info = dict(status='ready', sampledAt=time.time(), system='Windows' if os.name == 'nt' else platform.system(),
                cpuName=None, physicalCores=None, logicalProcessors=os.cpu_count(),
                memoryTotal=None, memoryAvailable=None,
                execution=dict(mode='serial', processes=1, threads=1, memoryPolicy='dynamic'))
    try:
        if os.name == 'nt':
            class Memory(ctypes.Structure):
                _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
                    (name, ctypes.c_ulonglong) for name in
                    ('total', 'available', 'pageTotal', 'pageAvailable', 'virtualTotal', 'virtualAvailable', 'extended')]
            memory = Memory()
            memory.length = ctypes.sizeof(memory)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
                info.update(memoryTotal=memory.total, memoryAvailable=memory.available)
            result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                'Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores | ConvertTo-Json -Compress'],
                capture_output=True, text=True, timeout=12,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode == 0:
                cpus = json.loads(result.stdout)
                cpus = cpus if isinstance(cpus, list) else [cpus]
                info.update(cpuName=' / '.join(c['Name'].strip() for c in cpus),
                            physicalCores=sum(c['NumberOfCores'] for c in cpus))
        else:
            entries = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
            info.update(memoryTotal=int(entries['MemTotal'].split()[0])*1024,
                        memoryAvailable=int(entries['MemAvailable'].split()[0])*1024)
            cpu_text = Path('/proc/cpuinfo').read_text()
            records = [dict(line.split(':', 1) for line in block.splitlines() if ':' in line)
                       for block in cpu_text.strip().split('\n\n')]
            records = [{k.strip(): v.strip() for k, v in r.items()} for r in records]
            info['cpuName'] = records[0].get('model name')
            cores = {(r['physical id'], r['core id']) for r in records if 'physical id' in r and 'core id' in r}
            info['physicalCores'] = len(cores) or None
    except (OSError, ValueError, KeyError, TypeError, IndexError, subprocess.TimeoutExpired):
        info['status'] = 'partial'
    info['sampledAt'] = time.time()
    return info


def read_console_tail(path, limit=12000):
    """Read a bounded suffix even for a large/in-progress engine log."""
    try:
        with Path(path).open('rb') as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size-limit))
            content = stream.read(limit).decode('utf-8', errors='replace')
        return ('…（仅显示日志末尾）\n' if size > limit else '') + content
    except FileNotFoundError:
        return ''
