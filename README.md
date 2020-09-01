# Marvin
A GitHub bot which can automatically add labels, approve or merge PRs.

## Why?
Sometimes you want to merge code to specific branch, but don't want extra approvals since the code in the source branch
was already reviewed in previous code reviews. 
If you have protected branches that require at least 1 approval this will come in handy.

## Example usage
```
name: automerge
on:
  pull_request:
    branches:
      - master
  status: {}

jobs:
  merge:
    if: (github.base_ref == 'staging' && (startsWith(github.head_ref, 'fix/') || github.head_ref == 'dev')) || (github.event.context == 'continuous-integration/jenkins/branch' && github.event.state == 'success')
    runs-on: ubuntu-latest
    steps:
      - uses: 3DHubs/marvin@v0.1.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          approve: true
          merge: true
          mergeMethod: merge
          sourceBranches: dev
          label: ready2merge
```

Note: these parameters are optional and can be omitted. The values below are actually the defaults:

| Option | Default value | Explanation |
| ------ | ------------- | ------ |
| token | None |GitHub token which is usually automatically passed by GitHub |
| approve | true | Whether to approve the PR automatically |
| label | None | What label to add to the PR. By default it doesn't add anything |
| merge | true | Whether to merge the PR automatically |
| mergeMethod | merge | Merge method: squash, merge or rebase |
| onlyProtectedBranches | true | Search only PRs from protected branches |
| sourceBranches | empty | A list of specific source branches separated by commas. If defined only PRs from that branch will be eligible |

## Debugging
To see debugging messages you can set this repository level secret. 
More info [here](https://docs.github.com/en/actions/configuring-and-managing-workflows/managing-a-workflow-run#enabling-step-debug-logging)
```
ACTIONS_STEP_DEBUG=true
```
Also I found these steps useful:
```
      - name: debug echo
        run: |
          echo ${{ github.event.branches.name }}
          echo ${{ github.event.context }}
          echo ${{ github.event.description }}
          echo ${{ github.event.state }}
          echo ${{ github.event.context }}
      - name: Debug Action
        uses: hmarr/debug-action@v1.0.0
```

## Development

After you change anything in `src/index.js`, make sure to build it, tag it and push it to GitHub:
```bash
npm run-script build
git commit -m "your message" dist/index.ts src/index.ts
git tag -a -m "0.1.1" v0.1.1
git push --follow-tags
```