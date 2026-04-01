[2026-03-31 22:48] - Updated by Junie
{
    "TYPE": "correction",
    "CATEGORY": "proof of success",
    "EXPECTATION": "They wanted a clear, truthful answer on whether any video was actually downloaded successfully, backed by evidence.",
    "NEW INSTRUCTION": "WHEN asserting a fix or success THEN include concrete proof (logs, file path, command output) or clearly state no success"
}

[2026-04-01 12:55] - Updated by Junie
{
    "TYPE": "correction",
    "CATEGORY": "status confirmation",
    "EXPECTATION": "They want an explicit, truthful status on whether the E2E download succeeded, with concrete evidence (logs, exit codes, file path).",
    "NEW INSTRUCTION": "WHEN reporting results of a run or test THEN state success or failure and include concrete evidence"
}

[2026-04-01 12:59] - Updated by Junie
{
    "TYPE": "positive",
    "CATEGORY": "breakthrough summary",
    "EXPECTATION": "They want a concise explanation of the specific change that made downloads succeed.",
    "NEW INSTRUCTION": "WHEN reporting a breakthrough THEN state the exact code/config change and why it fixed it"
}

[2026-04-01 13:07] - Updated by Junie
{
    "TYPE": "correction",
    "CATEGORY": "UI stability E2E",
    "EXPECTATION": "They want full workflow E2E tests that ensure the app does not close/crash after conversion, and that the post-download UI shows a QR code plus instructions about being on the same WiFi to send to the phone’s Photos gallery.",
    "NEW INSTRUCTION": "WHEN adding E2E tests for download workflow THEN assert no crash, QR appears, and instructions text"
}

[2026-04-01 13:09] - Updated by Junie
{
    "TYPE": "correction",
    "CATEGORY": "UI stability E2E",
    "EXPECTATION": "They want end-to-end tests that verify the app does not close/crash after conversion and that, post-download, the UI shows a QR code plus instructions about being on the same WiFi to send to the phone’s Photos gallery.",
    "NEW INSTRUCTION": "WHEN adding E2E tests for download workflow THEN assert no crash, QR appears, and instructions text"
}

[2026-04-01 13:32] - Updated by Junie
{
    "TYPE": "positive",
    "CATEGORY": "transfer success",
    "EXPECTATION": "The video successfully appears on the iPhone after scanning the QR/using the link, and they now want clear steps to save it to the Photos gallery.",
    "NEW INSTRUCTION": "WHEN showing QR or transfer link THEN display iOS steps to Save Video to Photos"
}

