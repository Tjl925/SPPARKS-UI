import copy
from pathlib import Path
import tempfile
import unittest
from data_adapter import read_dump, read_energy, validate_parameters, input_script

SOURCE = Path(__file__).resolve().parents[2] / 'spparks-08Oct25'


class DataTests(unittest.TestCase):
    def test_historical_dump_and_energy_alignment(self):
        data = read_dump(SOURCE / 'examples/potts/dump.potts', SOURCE / 'examples/potts/log.potts.11Nov09.linux.1')
        self.assertEqual(len(data['ids']), 8000)
        self.assertEqual(len(data['frames']), 11)
        self.assertEqual(data['frames'][1]['time'], 10.01)
        self.assertEqual(data['frames'][0]['energy'], 205912)
        self.assertEqual(data['frames'][-1]['energy'], 25382)
        self.assertEqual(len(set(data['frames'][-1]['states'])), 5)
        self.assertEqual(data['positions'][-1], [19, 19, 19])

    def test_unsorted_sites_are_aligned_by_id(self):
        text = '''ITEM: TIMESTEP
0 0
ITEM: NUMBER OF ATOMS
2
ITEM: BOX BOUNDS
0 2
0 2
0 2
ITEM: ATOMS id type x y z
2 9 1 0 0
1 7 0 0 0
ITEM: TIMESTEP
1 3.75
ITEM: NUMBER OF ATOMS
2
ITEM: BOX BOUNDS
0 2
0 2
0 2
ITEM: ATOMS id type x y z
1 5 0 0 0
2 6 1 0 0
'''
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'dump'
            path.write_text(text)
            data = read_dump(path)
            self.assertEqual(data['ids'], [1, 2])
            self.assertEqual(data['frames'][0]['states'], [7, 9])
            self.assertEqual(data['frames'][1]['states'], [5, 6])
            self.assertEqual(data['frames'][1]['time'], 3.75)
            self.assertIsNone(data['frames'][1]['energy'])
            path.write_text(text.replace('2 6 1 0 0', '2 6 1 1 0'))
            with self.assertRaisesRegex(ValueError, 'fixed lattice'):
                read_dump(path)

    def test_invalid_parameters_rejected(self):
        for payload in [{'size': 100}, {'size': 8.2}, {'size': True}, {'size': '20'},
                        {'temperature': float('nan')}, {'seed': 0}, {'duration': 101},
                        {'command': 'shell'}, [], {'states': 1}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                validate_parameters(payload)

    def test_generated_script_is_bounded_and_explicit(self):
        p = validate_parameters({'size': 8, 'duration': 10})
        script = input_script(p)
        self.assertIn('region box block 0 8 0 8 0 8', script)
        self.assertIn('boundary p p p', script)
        self.assertIn('dump 1 text 1 result.dump id site x y z', script)
        self.assertIn('run 10', script)


if __name__ == '__main__':
    unittest.main()
