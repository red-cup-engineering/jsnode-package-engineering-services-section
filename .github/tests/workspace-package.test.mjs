import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'

const workflow = parse(readFileSync(new URL('../workflows/receive-installed-package.yml', import.meta.url), 'utf8'))
const steps = workflow.jobs.receiving.steps
const selection = steps.find(step => step.id === 'source')
const receiver = steps.find(step => step['working-directory'])
const input = workflow.on.workflow_call.inputs['package-directory']

function checkout(t) {
  const scratch = mkdtempSync(join(tmpdir(), 'jsnode-package-selection-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const root = join(scratch, 'checkout')
  const child = join(root, 'apps', 'world library')
  const sibling = join(scratch, 'sibling')
  for (const [directory, name] of [[root, 'platform'], [child, 'world-library'], [sibling, 'other-owner']]) {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name, version: '0.1.0', ...(directory === root ? { private: true, workspaces: ['apps/*'] } : {}),
    }))
  }
  return { root, child, sibling, output: join(scratch, 'output') }
}

function select({ root, output }, directory) {
  writeFileSync(output, '')
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', selection.run], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PACKAGE_DIRECTORY: directory, GITHUB_OUTPUT: output },
  })
}

test('qualification packs the selected application or the default root from a workspace checkout', t => {
  const fixture = checkout(t)
  assert.equal(input.type, 'string')
  assert.equal(input.default, '.')
  assert.equal(selection.env.PACKAGE_DIRECTORY, "${{ inputs.package-directory || '.' }}")
  assert.equal(receiver['working-directory'], "${{ fromJSON(steps.source.outputs.directory) }}")
  for (const [directory, expected, name] of [[input.default, fixture.root, 'platform'],
    ['apps/world library', fixture.child, 'world-library']]) {
    const selected = select(fixture, directory)
    assert.equal(selected.status, 0, selected.stderr)
    const output = readFileSync(fixture.output, 'utf8')
    assert.match(output, /^directory=.+\n$/u)
    const cwd = JSON.parse(output.slice('directory='.length))
    assert.equal(cwd, realpathSync(expected))
    const packed = execFileSync('npm', ['pack', '.', '--offline', '--ignore-scripts', '--json', '--dry-run'], {
      cwd, encoding: 'utf8',
    })
    assert.equal(JSON.parse(packed)[0].name, name)
  }
})

test('the workflow requires a package inside its own checkout', t => {
  const fixture = checkout(t)
  symlinkSync(fixture.sibling, join(fixture.root, 'linked'), 'dir')
  mkdirSync(join(fixture.root, 'linked-manifest'))
  symlinkSync(join(fixture.sibling, 'package.json'), join(fixture.root, 'linked-manifest', 'package.json'))
  for (const path of ['absent', 'apps', fixture.child, '../sibling', 'linked', 'linked-manifest']) {
    assert.notEqual(select(fixture, path).status, 0, path)
    assert.equal(readFileSync(fixture.output, 'utf8'), '')
  }
})
