import ast
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fix_secrets import fix_file


def write_temp(source):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False)
    f.write(source)
    f.close()
    return f.name


def test_fixes_hardcoded_api_key():
    path = write_temp('STRIPE_API_KEY = "sk_live_abc123"\n')
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is True
    assert 'STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]' in result
    assert "import os" in result
    ast.parse(result)


def test_does_not_duplicate_existing_os_import():
    path = write_temp('import os\nSECRET_TOKEN = "xyz"\n')
    fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert result.count("import os") == 1


def test_idempotent():
    path = write_temp('DB_PASSWORD = "hunter2"\n')
    fix_file(path)
    once_fixed = open(path).read()
    fixed_again = fix_file(path)
    twice_fixed = open(path).read()
    os.unlink(path)
    assert fixed_again is False
    assert once_fixed == twice_fixed


def test_ignores_non_secret_variable_names():
    """A plain string assignment to an unrelated variable name must not
    be touched -- only names matching known secret suffixes."""
    original = 'GREETING = "hello there"\n'
    path = write_temp(original)
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is False
    assert result == original


def test_ignores_empty_string_default():
    original = 'API_TOKEN = ""\n'
    path = write_temp(original)
    fixed = fix_file(path)
    result = open(path).read()
    os.unlink(path)
    assert fixed is False
    assert result == original
