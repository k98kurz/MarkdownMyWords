---
name: Release Checklist
about: Create a new release checklist. For maintainer use only.
title: 'Release Checklist: v0.0.0'
labels: task
assignees: k98kurz

---

## Release Checklist

<!-- For maintainer use only. If you are not a maintainer, do not use this template. -->

Once all other issues are complete, prepare to release the next version.

- [ ] Code review and testing
  - [ ] All tests passing
  - [ ] Code reviewed and approved
  - [ ] No known critical bugs
- [ ] Documentation
  - [ ] Update readme.md
  - [ ] Update changelog.md (if applicable)
  - [ ] Review and update inline documentation/comments
  - [ ] Review and finalize all documentation
- [ ] Version management
  - [ ] Ensure version strings are updated to target version
  - [ ] Update version in package.json/package-lock.json (if applicable)
  - [ ] Update version in other relevant config files
- [ ] Pre-release
  - [ ] Close milestone on GitHub (if applicable)
  - [ ] Create release notes
- [ ] Release
  - [ ] Push tag and create release on GitHub
  - [ ] Publish to package registry (if applicable)
  - [ ] Announce release (if applicable)
