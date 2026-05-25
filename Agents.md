# Agent Notes

For the time being, every time an agent makes a significant change and considers the work complete, the agent should:

1. Bump the userscript version by one patch version, meaning the third digit (for example, `0.7.0` -> `0.7.1`).
2. Rebuild and run the project check.
3. Commit the completed change.
4. Push the commit.

When doing the git push workflow, run the project check, stage changes, commit, and push in one command with semicolons separating each step, for example: `npm run check; git add .; git commit -m "Describe change"; git push`.
