# Verification spec

## Identity and authorization
- Project and absolute source checkout:
- Revision / dirty-diff identifier:
- Environment, origin(s), and target CLI/API commands:
- Requested model: `opencode/deepseek-v4.1-flash-free#max`
- Run directory:
- User approval and exact allowed actions:
- Prohibited actions / external effects:
- Disposable fixture setup and cleanup owner:
- Test account references (never passwords or tokens):

## Original requirements
Quote the user's intended behavior, not the implementer's success claims.

## Prerequisites and capabilities
Record server/account/tool availability. Confirm actual model/variant from
session metadata, not the model's self-description. Test screenshot capture
separately from image understanding; unknown image understanding is false.
Pause for login/MFA/CAPTCHA and missing approval, never work around them.

## Cases
| ID | Type (functional/visual) | Preconditions / fixtures | Actions | Expected result | Evidence to capture |
| --- | --- | --- | --- | --- | --- |
| flow-01 | functional | synthetic inputs ready | exercise the actual flow | observable state/result | numbered screenshot or redacted output |

For the scoped runner, record the manifest path, its SHA-256 digest, the exact
loopback origin and permitted GET paths, and the approved scenario ID. Include
a meaningful negative/boundary case when applicable. State excluded coverage and
why. Add existing unit/integration commands relevant to the flow; do not invent
a parallel unit suite instead of exercising the workflow.

## Stop conditions
Missing prerequisites or unauthorized mutations are blocked. Unperformed steps
are untested. Product defects are failed, not silently repaired.
