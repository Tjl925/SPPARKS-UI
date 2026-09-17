from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from platform_info import detect_platform, read_console_tail


class PlatformTests(unittest.TestCase):
    def test_log_suffix_is_bounded_and_keeps_recent_output(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'console.log'
            self.assertEqual(read_console_tail(path), '')
            path.write_bytes(b'old data\n' * 20000 + '末尾：完成\n'.encode())
            tail = read_console_tail(path)
            self.assertLess(len(tail), 12100)
            self.assertTrue(tail.endswith('末尾：完成\n'))
            self.assertTrue(tail.startswith('…'))
            path.write_bytes(b'partial\xffoutput')
            self.assertIn('output', read_console_tail(path))

    def test_unavailable_cpu_detection_does_not_invent_cores(self):
        if os.name == 'nt':
            with patch('platform_info.subprocess.run', side_effect=subprocess.TimeoutExpired('probe', 12)):
                data = detect_platform()
        else:
            with patch('platform_info.Path.read_text', side_effect=OSError('unavailable')):
                data = detect_platform()
        self.assertEqual(data['status'], 'partial')
        self.assertIsNone(data['physicalCores'])
        self.assertIsNone(data['cpuName'])


if __name__ == '__main__':
    unittest.main()
