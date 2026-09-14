import copy
from pathlib import Path
import tempfile
import unittest
from data_adapter import read_dump, read_energy, validate_parameters, input_script
from models import MODELS
import json

SOURCE = Path(__file__).resolve().parents[2] / 'spparks-08Oct25'


class DataTests(unittest.TestCase):
    def test_new_bundled_cases_are_real_and_reproducible(self):
        for model_id in ('ising', 'thin_film'):
            folder = Path(__file__).resolve().parents[1] / 'demo' / model_id
            saved = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
            parsed = read_dump(folder / 'result.dump', folder / 'log.spparks', model_id)
            self.assertEqual(saved['frames'], parsed['frames'])
            self.assertEqual(saved['modelId'], model_id)
            self.assertEqual(len(saved['frames']), 11)
            self.assertEqual((folder/'input.in').read_text(), input_script(saved['parameters'], model_id))
            self.assertTrue(all(f['energy'] is not None for f in parsed['frames']))
            if model_id == 'ising':
                self.assertEqual(len(saved['ids']), 8000)
                self.assertTrue(set(saved['frames'][0]['states']) <= {1,2})
            else:
                self.assertTrue(all(p[2] == 0 for p in saved['positions']))
                self.assertGreater(saved['frames'][-1]['states'].count(2), saved['frames'][0]['states'].count(2))

    def test_model_specific_parameters(self):
        self.assertNotIn('states', validate_parameters({}, 'ising'))
        self.assertIn('app_style ising', input_script(validate_parameters({}, 'ising'), 'ising'))
        film = input_script(validate_parameters({}, 'thin_film'), 'thin_film')
        self.assertIn('dimension 2', film)
        self.assertIn('barrier', film)
        self.assertIn('deposition event', film)
        for model_id, raw in [('ising', {'states':10}), ('thin_film', {'flux':0}), ('unknown', {}),
                              ('thin_film', {'size':16,'flux':5e-9,'duration':3e11})]:
            with self.assertRaises(ValueError):
                validate_parameters(raw, model_id)

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
