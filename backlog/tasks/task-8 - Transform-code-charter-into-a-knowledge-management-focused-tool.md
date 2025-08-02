---
id: task-8
title: Transform code-charter into a knowledge management focused tool
status: To Do
assignee: []
created_date: "2025-07-22"
labels: []
dependencies: []
---

## Description

Shift the primary focus of code-charter from pure code visualization to a comprehensive knowledge management system that helps developers understand, document, and navigate codebases through structured knowledge capture, context-aware insights, and intelligent documentation generation. Enables a visual agent-user planning phase.

Cursor has decent flow chart generation capabilities, better than the call graph visualization we have currently. We need to pivot hard to the PKM-focused tool. This is a big shift.
Use cases include: auto-grocking code bases. By finding top-level nodes, you can find the 'entry points' of the code base and make guesses about where the answers to questions are.

Another perspective is that by having an *interactive* visualisation of the code base, we can support a different type of prompting based on manually editing the visualisation (moving nodes around, editing them etc).
We can also aim to solve the problem if *information-linkage* (aka documentation rot) with this system where the knowledge is always updated in tandem with the code and vise versa.
