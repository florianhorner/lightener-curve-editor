"""Contract test pinning the backend membership error codes to the shared fixture.

The membership transaction reports failures as error codes over the websocket;
the editor dialog turns those codes into user-facing copy. The two sides are
written in different languages, so nothing but a shared fixture keeps them
aligned. This is the same arrangement ``curve_presets.json`` already provides
for the shape definitions.

This test pins the *backend* set of codes. ``js/src/components/
light-membership-dialog.errors.test.ts`` pins the frontend's handling of the
same fixture. A new backend code that the editor has never heard of now fails
here instead of reaching a user as an unhelpful fallback message.
"""

import ast
import json
from pathlib import Path

from custom_components.lightener_studio import const, membership

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "membership_errors_v1.json"
FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
MEMBERSHIP_SOURCE = Path(membership.__file__)

_MODULE_CONSTANTS = {
    name: value
    for name, value in vars(const).items()
    if isinstance(value, str) and name.isupper()
}


def _literal_str(node: ast.AST) -> str | None:
    """Resolve a node to a string, following const.py names and f-strings.

    An f-string may open with a placeholder (an entity id), so only its literal
    parts are recoverable; that is enough for the message checks below.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        return _MODULE_CONSTANTS.get(node.id)
    if isinstance(node, ast.JoinedStr):
        return "".join(
            part.value
            for part in node.values
            if isinstance(part, ast.Constant) and isinstance(part.value, str)
        )
    return None


def _raise_sites() -> list[tuple[int, str, str | None]]:
    """Every ``MembershipError(...)`` construction as (line, code, message).

    Read statically rather than by exercising each failure path, so a code that
    is unreachable today still has to be declared in the contract. Every site is
    returned separately: collapsing by code would leave all but the last message
    for a repeated code unchecked.
    """
    tree = ast.parse(MEMBERSHIP_SOURCE.read_text(encoding="utf-8"))
    sites: list[tuple[int, str, str | None]] = []

    for node in ast.walk(tree):
        if (
            not isinstance(node, ast.Call)
            or not isinstance(node.func, ast.Name)
            or node.func.id != "MembershipError"
        ):
            continue

        keywords = {kw.arg: kw.value for kw in node.keywords if kw.arg}
        code_node = node.args[0] if node.args else keywords.get("code")
        if code_node is None:
            raise AssertionError(
                f"MembershipError at line {node.lineno} passes no code; the "
                "contract cannot verify it."
            )
        code = _literal_str(code_node)
        if code is None:
            raise AssertionError(
                f"MembershipError code at line {node.lineno} is not a literal "
                "or a known const; the contract cannot verify it."
            )

        message_node = node.args[1] if len(node.args) > 1 else keywords.get("message")
        message = _literal_str(message_node) if message_node is not None else None
        sites.append((node.lineno, code, message))

    return sites


def test_backend_membership_error_codes_match_the_contract() -> None:
    """Every raised code is declared, and every declared code is raised."""
    raised = {code for _line, code, _message in _raise_sites()}

    assert raised == set(FIXTURE["errors"])


def test_the_contract_describes_every_code_it_declares() -> None:
    """Each code says where its copy comes from and whether the editor sees it."""
    for code, entry in FIXTURE["errors"].items():
        assert entry["copy"] in {"dedicated", "backend", "preferred"}, code
        assert isinstance(entry["batch_command"], bool), code
        assert entry["meaning"].strip(), code


def test_disabled_entity_code_is_the_shared_constant() -> None:
    """The one code both stacks name explicitly stays in sync with const.py."""
    assert const.MEMBERSHIP_ERROR_DISABLED_ENTITY in FIXTURE["errors"]
    # The dialog prefers the backend message here because it names the entity,
    # and keeps its own string for when no message comes back.
    assert (
        FIXTURE["errors"][const.MEMBERSHIP_ERROR_DISABLED_ENTITY]["copy"] == "preferred"
    )


def test_too_many_is_declared_as_unreachable_from_the_editor() -> None:
    """The batch command's schema bound shadows the domain rule.

    ``test_too_many_is_handler_side_not_reachable_over_the_batch_command`` proves
    the behaviour and the README documents it; this keeps the shared contract
    from claiming the editor can receive the code.
    """
    assert FIXTURE["errors"]["too_many"]["batch_command"] is False
    assert membership.MAX_CONTROLLED_LIGHTS == 100


def test_every_raise_site_carries_a_user_facing_message() -> None:
    """Codes marked ``backend`` are rendered verbatim by the dialog, so every
    site that raises one has to supply copy rather than a log fragment."""
    for line, code, message in _raise_sites():
        entry = FIXTURE["errors"].get(code)
        if entry is None or entry["copy"] != "backend":
            continue
        assert message is not None, (
            f"MembershipError({code!r}) at line {line} has no recoverable message "
            "literal, so the contract cannot check what the dialog would show."
        )
        text = message.strip()
        assert len(text) > 10, f"line {line}: {code} message is too terse to show"
        assert not text.endswith(":"), f"line {line}: {code} reads like a log prefix"
        assert text.lower() != code.replace("_", " "), (
            f"line {line}: {code} message just restates the code"
        )
