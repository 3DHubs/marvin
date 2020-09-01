import * as core from "@actions/core";
import * as github from "@actions/github";

type Config = {
    token: string
    approve: boolean
    merge: boolean
    label: string | undefined
    mergeMethod: "merge" | "squash" | "rebase" | undefined
    onlyProtectedBranches: boolean
    sourceBranches: Array<string> | undefined
}

type Output = {
    result: string
}

function passConfig(): Config {
    let token: string = core.getInput('token')
    let approve: boolean = (core.getInput('approve') == 'true')
    let merge: boolean = (core.getInput('merge') == 'true')
    let label: string = core.getInput('label')
    let onlyProtectedBranches: boolean = (core.getInput('onlyProtectedBranches') == 'true')
    let sourceBranches: Array<string> | undefined = core.getInput('sourceBranches') ? core.getInput('sourceBranches').split(',') : undefined
    let mergeMethod: string = core.getInput('mergeMethod')
    return {
        token: token,
        approve: approve,
        merge: merge,
        label: label,
        onlyProtectedBranches: onlyProtectedBranches,
        sourceBranches: sourceBranches,
        mergeMethod: mergeMethod,
    } as Config
}

function extractBranchFromPayload(github, conf){
    // Extract branch name
    const branchPullRequestResponse = github.context.payload.branches.filter((branch) => {
        return (branch.commit.sha == github.context.payload.sha
            && branch.protected == conf.onlyProtectedBranches
            && (conf.sourceBranches.length === 0 || conf.sourceBranches.includes(branch.name))
        )
    });

    if (core.isDebug()) {
        console.log('Found branch:', github.context.payload.branches);
    }

    if (!branchPullRequestResponse[0] || !branchPullRequestResponse[0].name) {
        core.info("Couldn't find a branch name that matches the configuration, exiting.");
        process.exit(0)
    }

    return branchPullRequestResponse[0].name
}

async function extractPullRequestNumbers(octokit, github, conf){
    let pullRequestNumbers: Array<number>;

    const branchPullRequest = extractBranchFromPayload(github, conf)

    if (core.isDebug()) {
        console.log('Found branch:', branchPullRequest);
    }

    // Fetch a list of all open pull requests matching the branch
    let fetchPullRequests = await octokit.pulls.list({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        state: 'open',
        sort: 'updated',
        head: `${github.context.payload.repository.owner.login}:${branchPullRequest}`
    });

    if (core.isDebug()) {
        console.log('fetchPullRequests:', fetchPullRequests); // Debug
    }

    if ((fetchPullRequests.data.length) == 0) {
        core.info("Couldn't find pull requests. `pullRequests.data.length` is empty` - exiting.");
        process.exit(0)
    }

    // Extract pull request numbers
    pullRequestNumbers = fetchPullRequests.data.map((pr) => pr.number);

    if (core.isDebug()) {
        core.debug(`Found ${pullRequestNumbers.length} pull request(s):`)
        console.log(pullRequestNumbers);
    }

    // Only use the 1st pull request which is the most up to date
    return pullRequestNumbers[0];
}

async function checkIfMergeable(octokit, github, pullRequestNumber){
        let pullRequest = await octokit.pulls.get({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: pullRequestNumber,
        });

        if (pullRequest.data.mergeable !== true || pullRequest.data.mergeable_state !== 'clean'){
            console.log(pullRequest)
            core.info(`Pull request #${pullRequestNumber} is not mergeable, exiting.`)
            process.exit(0)
        }
}

async function approvePullRequest(octokit, github, pullRequestNumber) {
    core.info(`Creating approving review for pull request #${pullRequestNumber}`);

    await octokit.pulls.createReview({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pullRequestNumber,
        event: "APPROVE"
    });

    core.info(`Approved pull request #${pullRequestNumber}`);
}

async function addLabelPullRequest(octokit, github, pullRequestNumber) {
    core.info(`Creating label:${conf.label} for pull request #${pullRequestNumber}`);

    octokit.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pullRequestNumber,
        labels: [conf.label]
    });

    core.info(`Added the label to #${pullRequestNumber}`);
}

async function mergePullRequest(octokit, github, pullRequestNumber) {
    core.info(`Merging pull request #${pullRequestNumber}`);

    try {
        await octokit.pulls.merge({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: pullRequestNumber,
            merge_method: conf.mergeMethod
        });
    }
    catch(error){
        console.log(error)
        process.exit(0)
    }

    core.info(`Merged pull request #${pullRequestNumber}`);
}


async function marvin(conf) {
    let failureOutput: Output = {
        result: "failure"
    }
    let successOutput: Output = {
        result: "success"
    }

    try {
        const octokit = github.getOctokit(conf.token);
        let pullRequestNumber: number | undefined;

        if (!github.context.payload.pull_request && github.context.payload.repository && github.context.payload.sha) {
            core.info("Found `github.context.payload.repository` and `github.context.payload.sha`");
            pullRequestNumber = await extractPullRequestNumbers(octokit, github, conf);
        } else if (github.context.payload.pull_request && github.context.payload.pull_request.number) {
            core.info("Found `github.context.payload.pull_request.number`");
            pullRequestNumber = github.context.payload.pull_request.number;
        }

        if (pullRequestNumber === undefined) {
            core.info("Event payload missing `pull_request`, exiting. ");
            process.exit(0)
        }

        // Approve the PR
        if (conf.approve) {
            await approvePullRequest(octokit, github, pullRequestNumber)
        }

        // Add label
        if (conf.label) {
            await addLabelPullRequest(octokit, github, pullRequestNumber)
        }

        // Merge Pull request
        if (conf.merge) {
            await checkIfMergeable(octokit, github, pullRequestNumber)
            await mergePullRequest(octokit, github, pullRequestNumber)
        }
    } catch (error) {
        core.setFailed(error.message);
        return failureOutput;
    }

    return successOutput;
}

const conf = passConfig()

if (core.isDebug()) {
    console.log('conf:', conf);
}

marvin(conf);