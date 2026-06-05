---
name: e2e-process
description: Process Jira tickets or files (Excel, CSV, PDF) into parsed test plan markdown.
argument-hint: <jira-url-or-file-path>
context: fork
---

# Input Processing

Process Jira tickets, files, or text instructions into a parsed test plan markdown file.

## Agent Chain

```
(detect input type)
  ├─ Jira URL → @agent-jira-processor → @agent-input-processor
  ├─ File path → @agent-input-processor
  └─ Text instructions → @agent-input-processor
```

## Steps

### Step 1: Detect Input Type

From $ARGUMENTS, determine the input type:

- Starts with `http` and contains `atlassian.net` or `jira` → **Jira mode**
- Has a file extension (.xlsx, .csv, .json, .pdf, .docx) → **File mode**
- Otherwise → **Text mode** (treat as instructions)

### Step 2a: Jira Mode

Invoke `@agent-jira-processor` with the Jira URL.
It fetches requirements, analyzes gaps, asks clarifying questions.
Take its refined output and pass to Step 3.

### Step 2b: File/Text Mode

Skip to Step 3 directly.

### Step 3: Generate Parsed MD

Invoke `@agent-input-processor` with:

- **Jira mode:** refined jiraData from Step 2a
- **File mode:** filePath from $ARGUMENTS
- **Text mode:** instructions from $ARGUMENTS

### Step 4: Report

Output: path to generated test plan MD at `e2e-tests/plans/{module}-parsed.md`

## Input: $ARGUMENTS

```
/e2e-process https://org.atlassian.net/browse/PROJ-123    # Jira ticket
/e2e-process /path/to/test-cases.xlsx                      # Excel file
/e2e-process /path/to/requirements.pdf                     # PDF file
```

## Output

Parsed test plan at `e2e-tests/plans/{module}-parsed.md` with status `READY_FOR_VALIDATION`.
