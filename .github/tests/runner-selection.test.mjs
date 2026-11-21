import { deepStrictEqual, equal } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Evaluator, Lexer, Parser, data } from '@actions/expressions'
import { parse } from 'yaml'

const workflow = parse(readFileSync(new URL('../workflows/receive-installed-package.yml', import.meta.url), 'utf8'))
const source = workflow.jobs.receiving['runs-on'].trim().slice(3, -2)
const expression = new Parser(new Lexer(source).lex().tokens, ['github', 'inputs'], []).parse()
const repository = 'red-cup-engineering/metroplat'
const held = ['self-hosted', 'bare-cedar-fog']

function select({ inputs = {}, event = 'pull_request', privateRepo = true, head = repository,
  association = 'MEMBER', ref = 'refs/pull/1/merge' } = {}) {
  const context = {
    inputs,
    github: {
      event_name: event, repository, ref,
      event: {
        repository: { private: privateRepo, default_branch: 'main' },
        pull_request: { head: { repo: { full_name: head } }, author_association: association }
      }
    }
  }
  const result = new Evaluator(expression, JSON.parse(JSON.stringify(context), data.reviver)).evaluate()
  return JSON.parse(JSON.stringify(result, data.replacer))
}

test('the optional runner input is boolean and defaults to the hosted machine', () => {
  const inputs = workflow.on.workflow_call.inputs
  deepStrictEqual(Object.keys(inputs).sort(), ['bare-cedar-fog', 'package-directory'])
  equal(inputs['bare-cedar-fog'].type, 'boolean')
  equal(inputs['bare-cedar-fog'].default, false)
  equal(select(), 'ubuntu-latest')
  equal(select({ inputs: { 'bare-cedar-fog': false }, privateRepo: false, head: 'fork/pkg' }), 'ubuntu-latest')
})

test('a trusted private repository can select the two fixed labels', () => {
  const inputs = { 'bare-cedar-fog': true }
  for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    deepStrictEqual(select({ inputs, association }), held)
  }
  for (const event of ['push', 'workflow_dispatch']) {
    deepStrictEqual(select({ inputs, event, ref: 'refs/heads/main' }), held)
  }
})

test('public, forked, untrusted and privileged PR events cannot allocate a held or hosted fallback runner', () => {
  const inputs = { 'bare-cedar-fog': true }
  for (const change of [
    { privateRepo: false }, { head: 'fork/metroplat' }, { association: 'CONTRIBUTOR' },
    { event: 'pull_request_target', ref: 'refs/heads/main' },
    { event: 'workflow_dispatch', ref: 'refs/heads/topic' },
    { event: 'push', ref: 'refs/heads/topic' }, { event: 'schedule', ref: 'refs/heads/main' }
  ]) equal(select({ inputs, ...change }), null, JSON.stringify(change))
})
