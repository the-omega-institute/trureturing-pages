from pathlib import Path
import ast
import unittest

import yaml


class WorkflowSyntaxTests(unittest.TestCase):
    def test_workflows_parse_before_github_evaluates_branch_filters(self):
        root = Path(__file__).resolve().parents[1] / ".github/workflows"
        for path in sorted(root.glob("*.yml")):
            with self.subTest(workflow=path.name):
                workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
                self.assertIn("on", workflow)
                self.assertIsInstance(workflow.get("jobs"), dict)

    def test_history_finalizer_preserves_its_embedded_python_and_generated_yaml(self):
        path = Path(__file__).resolve().parents[1] / ".github/workflows/finalize-topology-history.yml"
        workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
        script = workflow["jobs"]["finalize"]["steps"][-1]["run"]
        code = script.split("python - <<'PY'\n", 1)[1].split("\nPY", 1)[0]
        tree = ast.parse(code)
        assignment = next(node for node in ast.walk(tree) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "step" for target in node.targets))
        generated = ast.literal_eval(assignment.value)
        parsed = yaml.load("jobs:\n  deploy:\n    steps:\n" + generated, Loader=yaml.BaseLoader)
        self.assertIn("python -m lib.topology_history", parsed["jobs"]["deploy"]["steps"][0]["run"])


if __name__ == "__main__":
    unittest.main()
