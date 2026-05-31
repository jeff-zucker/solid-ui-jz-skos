import { silenceDebugMessages } from '../../helpers/debugger'
import { namedNode } from 'rdflib'
import ns from '../../../../src/ns'
import { store } from 'solid-logic'
import { clearStore } from '../../helpers/clearStore'
// @ts-ignore — forms.js is untyped JS
import { gatherSkosOptions } from '../../../../src/widgets/forms'

silenceDebugMessages()
afterEach(clearStore)

const BASE = 'https://example.org/d'
const DOC = namedNode(BASE)
const node = (frag: string) => namedNode(BASE + '#' + frag)
const skos = (t: string) => namedNode('http://www.w3.org/2004/02/skos/core#' + t)
const add = (s: any, p: any, o: any) => store.add(s, p, o, DOC)
const vals = (res: any) => res.options.map((o: any) => o.value.replace(BASE, '')).sort()

// Art & Life are top concepts; tree is 3 deep (Art > Sculpture > Marble).
function loadNested () {
  add(node('Images'), ns.rdf('type'), skos('ConceptScheme'))
  for (const c of ['Art', 'Life']) {
    add(node(c), ns.rdf('type'), skos('Concept'))
    add(node(c), skos('topConceptOf'), node('Images'))
  }
  const parents: Record<string, string> = { Painting: 'Art', Sculpture: 'Art', Marble: 'Sculpture', Nature: 'Life' }
  for (const [c, parent] of Object.entries(parents)) {
    add(node(c), ns.rdf('type'), skos('Concept'))
    add(node(c), skos('broader'), node(parent))
  }
}

describe('gatherSkosOptions', () => {
  it('is exported', () => {
    expect(gatherSkosOptions).toBeInstanceOf(Function)
  })

  it('a ConceptScheme yields its top concepts only', () => {
    loadNested()
    expect(vals(gatherSkosOptions(store, node('Images'), DOC))).toEqual(['#Art', '#Life'])
  })

  it('a ConceptScheme with { deep } yields all concepts at any depth', () => {
    loadNested()
    expect(vals(gatherSkosOptions(store, node('Images'), DOC, { deep: true })))
      .toEqual(['#Art', '#Life', '#Marble', '#Nature', '#Painting', '#Sculpture'])
  })

  it('a Concept yields its direct narrower children', () => {
    loadNested()
    expect(vals(gatherSkosOptions(store, node('Art'), DOC))).toEqual(['#Painting', '#Sculpture'])
  })

  it('falls back to structural roots when no top concepts are declared', () => {
    add(node('S'), ns.rdf('type'), skos('ConceptScheme'))
    add(node('A'), ns.rdf('type'), skos('Concept'))
    add(node('A'), skos('inScheme'), node('S'))
    add(node('B'), ns.rdf('type'), skos('Concept'))
    add(node('B'), skos('inScheme'), node('S'))
    add(node('B'), skos('broader'), node('A'))
    // A has no broader -> a root; B has a parent -> excluded
    expect(vals(gatherSkosOptions(store, node('S'), DOC))).toEqual(['#A'])
  })

  it('an empty scheme yields no options', () => {
    add(node('S'), ns.rdf('type'), skos('ConceptScheme'))
    expect(gatherSkosOptions(store, node('S'), DOC).options).toEqual([])
  })

  it('a Collection yields its members', () => {
    add(node('C'), ns.rdf('type'), skos('Collection'))
    add(node('C'), skos('member'), node('X'))
    add(node('C'), skos('member'), node('Y'))
    add(node('X'), ns.rdf('type'), skos('Concept'))
    add(node('Y'), ns.rdf('type'), skos('Concept'))
    const res = gatherSkosOptions(store, node('C'), DOC)
    expect(vals(res)).toEqual(['#X', '#Y'])
    expect(res.ordered).toBe(false)
  })
})
