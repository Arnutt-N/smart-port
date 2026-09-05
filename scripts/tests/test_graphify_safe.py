import importlib.util
import os
from pathlib import Path
import ast
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('guard', Path(__file__).parents[1] / 'graphify-safe.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GraphifySafetyTests(unittest.TestCase):
    def test_forbidden_paths_never_touched(self):
        with guard.isolated_directory(Path(__file__).absolute().parents[2]) as root:
            rejected = ['secrets/hidden.php', 'scripts/../secrets/hidden.php', 'backend/uploads/a.php',
                        '.qwen/a.js', '.zcode/a.js', 'backend/.env', 'backend/SECRET.php',
                        'backend/credentials/a.js', 'backend/a.php/../../secrets/a.php', 'C:/backend/a.php']
            with patch.object(guard, 'no_links', side_effect=AssertionError('Forbidden source accessed')):
                self.assertEqual(guard.snapshot(root, root / 'out', rejected), 0)

    def test_only_selected_source_copied(self):
        with guard.isolated_directory(Path(__file__).absolute().parents[2]) as root:
            (root / 'backend').mkdir()
            (root / 'backend/a.php').write_text('<?php function demo() {}')
            (root / 'backend/untracked.php').write_text('<?php function other() {}')
            self.assertEqual(guard.snapshot(root, root / 'out', ['backend/a.php']), 1)
            self.assertTrue((root / 'out/backend/a.php').is_file())
            self.assertFalse((root / 'out/backend/untracked.php').exists())

    def test_reparse_point_rejected(self):
        fake = type('Info', (), {'st_mode': 0, 'st_file_attributes': 0x400})()
        with patch.object(Path, 'lstat', return_value=fake):
            with self.assertRaises(ValueError):
                guard.no_links(Path('/fake/linked'))

    def test_environment_allowlist(self):
        synthetic = {'SYSTEMROOT': 'system', 'OPENAI_API_KEY': 'synthetic', 'GRAPHIFY_OUT': 'outside',
                     'GEMINI_API_KEY': 'synthetic', 'PYTHONPATH': 'outside', 'AWS_PROFILE': 'synthetic',
                     'UNKNOWN_PROVIDER_TOKEN': 'synthetic', 'PATH': 'untrusted'}
        with patch.dict(os.environ, synthetic, clear=True):
            env = guard.child_env()
            self.assertEqual(set(env), {'SYSTEMROOT', 'PYTHONHASHSEED', 'PYTHONUTF8', 'GRAPHIFY_MAX_WORKERS'})
            self.assertEqual(os.environ['OPENAI_API_KEY'], 'synthetic')

    def test_argument_rejection_before_any_process(self):
        with patch.object(guard.subprocess, 'run', side_effect=AssertionError('Process started')):
            for args in [[], ['build', '..'], ['build', '.', '--deep'], ['update'], ['--worker', '..']]:
                with self.assertRaises(ValueError):
                    guard.main(args)

    def test_network_and_process_guard(self):
        worker = Path(__file__).parents[1] / 'graphify_ast_worker.py'
        module = ast.parse(worker.read_text(encoding='utf-8'))
        function = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == 'offline')
        namespace = {}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(worker), 'exec'), namespace)
        for event in ['socket.connect', 'socket.getaddrinfo', 'subprocess.Popen', 'os.system', 'os.posix_spawn']:
            with self.assertRaises(PermissionError):
                namespace['offline'](event, ())
        namespace['offline']('open', ())


if __name__ == '__main__':
    unittest.main()
