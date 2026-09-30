# Channel Variant Workflow

This guide describes how to create a second channel-specific calculator from the
current Direct calculator while preserving Git history, giving the new calculator
its own GitHub Pages URL, and keeping the repositories easy to compare later.

The recommended sequence is:

1. freeze and tag a clean Direct baseline;
2. clone the full repository history;
3. connect the clone to a new independent GitHub repository;
4. build the Indirect calculator in the new repository;
5. compare the completed Indirect calculator with the tagged Direct baseline;
6. mark meaningful source regions as `SHARED`, `DIRECT`, or `INDIRECT`;
7. synchronize later shared fixes with focused cherry-picks.

This workflow intentionally does **not** introduce a shared package, template
engine, submodule, or multi-repository build system.

## Terminology

- **Direct repository**: `KateiRen/arc-payg-calculator`
- **Direct working folder**:
  `C:\Users\karstenh\GitHub\arc-payg-calculator`
- **Indirect repository**: the new repository you will create
- **Baseline tag**: `indirect-start`
- **Shared change**: behavior that should remain identical in both calculators
- **Partner change**: behavior that belongs only to Direct or only to Indirect

Replace these placeholders in the commands below:

- `<INDIRECT_REPO>`: the new GitHub repository name
- `<INDIRECT_FOLDER>`: the local folder name, normally the same as the repository
  name
- `<INDIRECT_DESCRIPTION>`: a short GitHub repository description

Example names:

```text
<INDIRECT_REPO>   = arc-payg-indirect-calculator
<INDIRECT_FOLDER> = arc-payg-indirect-calculator
```

## Phase 1: Prepare the Direct baseline

Open PowerShell in the current Direct repository:

```powershell
Set-Location 'C:\Users\karstenh\GitHub\arc-payg-calculator'
```

### 1. Verify the repository

```powershell
git status --short --branch
git remote -v
git log -1 --oneline
```

Expected results:

- the current branch is `main`;
- the working tree has no modified or untracked files;
- `origin` points to
  `https://github.com/KateiRen/arc-payg-calculator.git`.

If the working tree is not clean, commit the intended changes before continuing.
Do not discard unfamiliar changes.

### 2. Run the tests

```powershell
npm test
git diff --check
```

Do not create the baseline until both commands succeed.

### 3. Push Direct

```powershell
git push origin main
```

Confirm that local `main` and `origin/main` point to the same commit:

```powershell
git rev-parse main
git rev-parse origin/main
```

The two hashes should be identical.

### 4. Create the baseline tag

First confirm that the tag does not already exist:

```powershell
git tag --list indirect-start
```

If no tag is returned, create an annotated tag:

```powershell
git tag -a indirect-start -m 'Baseline used to create the Indirect calculator'
git push origin indirect-start
```

Verify the tag:

```powershell
git show --no-patch --oneline indirect-start
```

Record the displayed commit hash. This is the immutable comparison point for the
later classification pass.

If the tag already exists but points to the wrong commit, stop and choose a
different tag name. Do not silently move a published baseline tag.

## Phase 2: Create the independent Indirect repository

### 1. Create an empty GitHub repository

Create a new repository under the `KateiRen` GitHub account.

Important settings:

- use the intended `<INDIRECT_REPO>` name;
- choose the required visibility;
- do **not** initialize it with a README, `.gitignore`, or license;
- do not create a fork.

You can create it in the GitHub web interface, or with GitHub CLI:

```powershell
gh repo create "KateiRen/<INDIRECT_REPO>" --public --description "<INDIRECT_DESCRIPTION>"
```

Use `--private` instead of `--public` if required. Confirm that your GitHub plan
and organization settings support GitHub Pages for the selected visibility.

### 2. Clone the Direct repository with full history

Move to the parent folder:

```powershell
Set-Location 'C:\Users\karstenh\GitHub'
```

Clone Direct into the new folder:

```powershell
git clone 'https://github.com/KateiRen/arc-payg-calculator.git' '<INDIRECT_FOLDER>'
Set-Location "C:\Users\karstenh\GitHub\<INDIRECT_FOLDER>"
```

Confirm that the baseline tag and history are present:

```powershell
git tag --list indirect-start
git log --oneline --decorate -5
```

### 3. Rename the Direct remote

The clone initially calls the Direct repository `origin`. Rename it to `direct`:

```powershell
git remote rename origin direct
```

Add the new Indirect repository as `origin`:

```powershell
git remote add origin 'https://github.com/KateiRen/<INDIRECT_REPO>.git'
```

Verify both remotes:

```powershell
git remote -v
```

Expected arrangement:

```text
direct  https://github.com/KateiRen/arc-payg-calculator.git (fetch)
direct  https://github.com/KateiRen/arc-payg-calculator.git (push)
origin  https://github.com/KateiRen/<INDIRECT_REPO>.git (fetch)
origin  https://github.com/KateiRen/<INDIRECT_REPO>.git (push)
```

The `direct` remote is retained for comparison and intentional shared changes. Do
not push Indirect partner changes to `direct`.

### 4. Push the cloned history to Indirect

```powershell
git push -u origin main
git push origin indirect-start
```

Verify repository state:

```powershell
git status --short --branch
git remote -v
git log -1 --oneline
```

The branch should track `origin/main`, not `direct/main`.

## Phase 3: Configure the new GitHub Pages site

The repository already contains the Pages workflow. In the new Indirect
repository:

1. Open **Settings > Pages**.
2. Set **Source** to **GitHub Actions**.
3. Open **Settings > Actions > General**.
4. Under **Workflow permissions**, allow read and write permissions so the
   monthly price-refresh workflow can commit.
5. Open the **Actions** tab and manually run **Deploy calculator to GitHub
   Pages**.

The initial URL will normally be:

```text
https://kateiren.github.io/<INDIRECT_REPO>/
```

The copied calculator still contains Direct-specific URL checks. Update all hosted
URL and path references before treating the Indirect site as ready.

Search for the current repository URL and path:

```powershell
rg "kateiren\.github\.io|arc-payg-calculator" site test README.md .github
```

Update the relevant Indirect partner content and matching tests. Do not change the
Azure Retail Prices API product names merely because the site URL changed.

## Phase 4: Build the Indirect calculator

Build the new version in the Indirect repository without adding `SHARED`,
`DIRECT`, or `INDIRECT` markers yet. The actual differences will provide a better
boundary than an upfront guess.

### Commit discipline

Use focused commits. Recommended categories:

```text
indirect: update branding and instructions
indirect: implement partner incentive model
indirect: revise default workloads
shared: correct SQL PAYG calculation
shared: improve Windows workload presentation
shared: update pricing refresh workflow
```

Do not mix a shared fix and an Indirect-only change in the same commit.

Avoid:

- reformatting or re-minifying the entire HTML file without a functional need;
- renaming shared functions as part of unrelated partner changes;
- moving large sections solely for style;
- combining all Indirect work into one commit.

Those actions make the later comparison and cherry-picking less reliable.

### Validation during development

Run before each significant commit:

```powershell
npm test
git diff --check
git status --short
```

Continue enforcing the existing privacy requirements:

- hosted and offline HTML contain Azure PAYG prices only;
- SPLA or other partner-entered prices stay in runtime/project JSON data;
- project names and configured workloads are never embedded into offline HTML.

### If Direct needs an urgent change

Prefer to postpone it. If it cannot wait:

1. make a focused commit in Direct;
2. classify it immediately as `shared:` or `direct:`;
3. if shared, cherry-pick it into Indirect before continuing;
4. record the commit in the comparison notes.

## Phase 5: Compare Direct and Indirect

Perform this phase only after the Indirect behavior is substantially complete.

### 1. Fetch the latest Direct history

From the Indirect repository:

```powershell
git fetch direct --tags
git fetch origin
```

Verify the baseline:

```powershell
git show --no-patch --oneline indirect-start
```

### 2. Review Indirect commits since the baseline

```powershell
git log --oneline --decorate indirect-start..main
git diff --stat indirect-start..main
git diff --name-status indirect-start..main
```

Review the main calculator difference:

```powershell
git diff --word-diff=color indirect-start..main -- site/index.html
```

Review workflows, pricing code, and tests separately:

```powershell
git diff indirect-start..main -- .github/workflows
git diff indirect-start..main -- scripts/fetch-prices.js site/pricing.js
git diff indirect-start..main -- test/pricing.test.js
```

Because `site/index.html` contains long lines, a word diff is often more useful
than the default line diff.

### 3. Classify the code

Use these definitions:

- `SHARED`: should behave identically in Direct and Indirect.
- `DIRECT`: exists only for the Direct channel model.
- `INDIRECT`: exists only for the Indirect channel model.

Likely shared areas:

- monthly/manual Azure price refresh;
- Azure Retail Prices API filtering;
- embedded PAYG price handling;
- SQL and Windows workload rows;
- common core and uptime rules;
- common cost formatting and charts;
- project import/export mechanics;
- offline privacy validation.

Likely partner-specific areas:

- partner name and instructions;
- hosted repository URL and path;
- browser storage/project identifiers;
- incentive controls, rates, eligibility, and impact components;
- channel-specific labels and explanations;
- channel-specific default workloads.

Do not classify only by whether text changed. Review function callers and data
dependencies. A changed function may contain:

- a true Indirect-only rule;
- a general improvement that should be applied to Direct;
- shared behavior with one partner-specific input;
- mixed logic that should be split.

## Phase 6: Add source markers

Add markers only around meaningful sections, not every changed line.

### HTML examples

Direct:

```html
<!-- SHARED: SQL/WINDOWS CALCULATOR UI START -->
...
<!-- SHARED: SQL/WINDOWS CALCULATOR UI END -->

<!-- DIRECT: PARTNER IMPACT UI START -->
...
<!-- DIRECT: PARTNER IMPACT UI END -->
```

Indirect:

```html
<!-- SHARED: SQL/WINDOWS CALCULATOR UI START -->
...
<!-- SHARED: SQL/WINDOWS CALCULATOR UI END -->

<!-- INDIRECT: PARTNER IMPACT UI START -->
...
<!-- INDIRECT: PARTNER IMPACT UI END -->
```

### JavaScript examples

```javascript
// SHARED: WORKLOAD CALCULATION START
...
// SHARED: WORKLOAD CALCULATION END

// DIRECT: INCENTIVE CALCULATION START
...
// DIRECT: INCENTIVE CALCULATION END
```

Use `INDIRECT` instead of `DIRECT` in the Indirect repository.

### CSS examples

```css
/* SHARED: CALCULATOR PRESENTATION START */
...
/* SHARED: CALCULATOR PRESENTATION END */

/* INDIRECT: PARTNER PRESENTATION START */
...
/* INDIRECT: PARTNER PRESENTATION END */
```

### Mixed functions

If one function combines shared workload calculations with partner-specific
incentives, split only that function:

```javascript
// SHARED
function calculateWorkloadCosts(...) {
  ...
}

// DIRECT or INDIRECT
function buildPartnerImpactComponents(...) {
  ...
}
```

Keep both functions in the same self-contained HTML file. Do not extract a package
unless future synchronization becomes frequent enough to justify it.

### Tests for markers

Add simple regression assertions confirming that:

- expected `SHARED` markers exist;
- the Direct repository has expected `DIRECT` markers and no `INDIRECT` markers;
- the Indirect repository has expected `INDIRECT` markers and no `DIRECT`
  markers;
- existing calculation and privacy tests still pass.

## Phase 7: Synchronize future shared fixes

### Create a shared commit

In the repository where the fix is developed:

```powershell
git status --short
npm test
git add -- <shared-files>
git commit -m "shared: describe the shared correction"
git push origin main
```

Keep partner changes out of this commit.

### Cherry-pick from Direct into Indirect

From the Indirect repository:

```powershell
git fetch direct
git log direct/main --oneline -10
git cherry-pick <SHARED_COMMIT_HASH>
npm test
git push origin main
```

### Cherry-pick from Indirect into Direct

In the Direct repository, add the Indirect remote once:

```powershell
git remote add indirect 'https://github.com/KateiRen/<INDIRECT_REPO>.git'
git fetch indirect
```

For subsequent shared changes:

```powershell
git fetch indirect
git log indirect/main --oneline -10
git cherry-pick <SHARED_COMMIT_HASH>
npm test
git push origin main
```

### Resolve a cherry-pick conflict

Inspect the conflict:

```powershell
git status
git diff --name-only --diff-filter=U
```

Resolve only after deciding whether the conflicting region is genuinely shared.
Then continue:

```powershell
git add -- <resolved-files>
git cherry-pick --continue
npm test
```

If the commit is not safely shareable, abort without altering history:

```powershell
git cherry-pick --abort
```

Create a new repository-specific implementation instead.

## Changes that should not be cherry-picked

Do not normally share:

- automated monthly commits named `chore: refresh calculator prices`;
- partner branding, URLs, instructions, defaults, or incentive rules;
- GitHub Pages configuration that contains the other repository's path;
- project files containing partner-entered data.

Each repository's monthly workflow should independently fetch and embed current
Azure prices.

## Final verification checklist

For both repositories:

- [ ] `npm test` succeeds.
- [ ] `git diff --check` succeeds.
- [ ] The working tree is clean.
- [ ] SQL PAYG calculations render correctly.
- [ ] Windows Server PAYG calculations render correctly.
- [ ] Partner-specific incentive results are correct.
- [ ] Hosted/offline HTML contains Azure prices only.
- [ ] Offline HTML contains no project names or configured workloads.
- [ ] Project import/export uses the intended channel identity.
- [ ] Browser storage keys cannot collide between the two sites.
- [ ] Save-offline visibility checks use the correct Pages path.
- [ ] Offline instructions link to the correct live site.
- [ ] Manual price refresh succeeds.
- [ ] Monthly price refresh is enabled.
- [ ] GitHub Pages deploys to the expected project URL.
- [ ] Meaningful source regions are marked `SHARED` and `DIRECT`/`INDIRECT`.
- [ ] Shared and partner-specific changes use separate commits.

## Recovery notes

If the new repository setup is incorrect but no unique Indirect work has been
created yet, correct the remotes rather than deleting history:

```powershell
git remote -v
git remote set-url origin 'https://github.com/KateiRen/<INDIRECT_REPO>.git'
git remote set-url direct 'https://github.com/KateiRen/arc-payg-calculator.git'
```

Never use `git reset --hard` or force-push as a routine setup step. If published
history or tags need to be rewritten, stop and review the repository state first.
