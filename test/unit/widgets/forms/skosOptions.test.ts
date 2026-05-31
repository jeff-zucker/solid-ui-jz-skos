import { silenceDebugMessages } from '../../helpers/debugger'
import { namedNode, literal } from 'rdflib'
import ns from '../../../../src/ns'
import { store } from 'solid-logic'
import { clearStore } from '../../helpers/clearStore'
// @ts-ignore — forms.js is untyped JS
import { gatherSkosOptions, skosMintStatements, field } from '../../../../src/widgets/forms'

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

  it('an OrderedCollection (skos:memberList) keeps list order, ordered: true', () => {
    add(node('C'), ns.rdf('type'), skos('OrderedCollection'))
    // skos:memberList -> an rdf:list ( Z A M ), built as a first/rest chain
    add(node('C'), skos('memberList'), node('l1'))
    add(node('l1'), ns.rdf('first'), node('Z')); add(node('l1'), ns.rdf('rest'), node('l2'))
    add(node('l2'), ns.rdf('first'), node('A')); add(node('l2'), ns.rdf('rest'), node('l3'))
    add(node('l3'), ns.rdf('first'), node('M')); add(node('l3'), ns.rdf('rest'), ns.rdf('nil'))
    for (const c of ['Z', 'A', 'M']) add(node(c), ns.rdf('type'), skos('Concept'))
    const res = gatherSkosOptions(store, node('C'), DOC)
    expect(res.ordered).toBe(true)
    // preserved list order — NOT alphabetised
    expect(res.options.map((o: any) => o.value.replace(BASE, ''))).toEqual(['#Z', '#A', '#M'])
  })
})

describe('skosMintStatements', () => {
  const short = (u: string) => u
    .replace(BASE, '')
    .replace('http://www.w3.org/2004/02/skos/core#', 'skos:')
    .replace('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:')
  const triples = (sts: any[]) => sts.map(s => `${short(s.subject.value)} ${short(s.predicate.value)} ${short(s.object.value)}`).sort()

  it('places a concept minted from a scheme (top-only) as a typed top concept', () => {
    add(node('Images'), ns.rdf('type'), skos('ConceptScheme'))
    const out = skosMintStatements(store, node('Images'), node('New'), DOC, { deep: false })
    expect(triples(out)).toEqual([
      '#New rdf:type skos:Concept',
      '#New skos:inScheme #Images',
      '#New skos:topConceptOf #Images'
    ].sort())
  })

  it('with { deep } places it in-scheme without topConceptOf', () => {
    add(node('Images'), ns.rdf('type'), skos('ConceptScheme'))
    const out = skosMintStatements(store, node('Images'), node('New'), DOC, { deep: true })
    expect(triples(out)).toEqual(['#New rdf:type skos:Concept', '#New skos:inScheme #Images'].sort())
  })

  it('mints under a concept as a child, inheriting the scheme', () => {
    add(node('Art'), ns.rdf('type'), skos('Concept'))
    add(node('Art'), skos('topConceptOf'), node('Images'))
    const out = skosMintStatements(store, node('Art'), node('New'), DOC)
    expect(triples(out)).toEqual([
      '#New rdf:type skos:Concept',
      '#New skos:broader #Art',
      '#New skos:inScheme #Images'
    ].sort())
  })

  it('mints into a collection as a member', () => {
    add(node('C'), ns.rdf('type'), skos('Collection'))
    const out = skosMintStatements(store, node('C'), node('New'), DOC)
    expect(triples(out)).toEqual(['#C skos:member #New', '#New rdf:type skos:Concept'].sort())
  })
})

describe('ui:Choice SKOS render (integration / jsdom)', () => {
  const Choice = () => field[ns.ui('Choice').uri]
  const dcatTheme = namedNode('http://www.w3.org/ns/dcat#theme')
  const REC = node('rec')
  const optionTexts = (box: any) => Array.from(box.querySelectorAll('option')).map((o: any) => o.textContent.trim())

  function loadScheme () {
    add(node('Images'), ns.rdf('type'), skos('ConceptScheme'))
    add(node('Art'), ns.rdf('type'), skos('Concept')); add(node('Art'), skos('topConceptOf'), node('Images'))
    add(node('Life'), ns.rdf('type'), skos('Concept')); add(node('Life'), skos('topConceptOf'), node('Images'))
  }
  function makeForm ({ mint = false } = {}) {
    const form = node('choiceForm')
    add(form, ns.ui('property'), dcatTheme)
    add(form, ns.ui('from'), node('Images'))
    if (mint) add(form, ns.ui('canMintNew'), literal('true'))
    return form
  }

  it('renders a <select> of the scheme top concepts (field enumeration branch)', () => {
    loadScheme()
    const box = Choice()(document, document.createElement('div'), {}, REC, makeForm(), DOC, jest.fn())
    expect(optionTexts(box)).toEqual(expect.arrayContaining(['Art', 'Life']))
  })

  it('with ui:canMintNew offers a "create new" option (SKOS mint wiring)', () => {
    const origEditable = store.updater.editable
    store.updater.editable = () => true
    try {
      loadScheme()
      const box = Choice()(document, document.createElement('div'), {}, REC, makeForm({ mint: true }), DOC, jest.fn())
      expect(optionTexts(box)).toContain('* Create new *')
    } finally {
      store.updater.editable = origEditable
    }
  })

  it('minting writes a typed, in-scheme skos:Concept as the value (mint execution)', () => {
    const origEditable = store.updater.editable
    const origUpdate = store.updater.update
    store.updater.editable = () => true
    store.updater.update = (ds: any[], is: any[], cb: any) => {
      ;(is || []).forEach((st: any) => store.add(st.subject, st.predicate, st.object, st.graph || st.why || DOC))
      if (cb) cb(null, true, '')
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      loadScheme()
      const box = Choice()(document, container, {}, REC, makeForm({ mint: true }), DOC, jest.fn())
      const select: any = box.querySelector('select')
      // Select the mint option, then run the select's mint handler directly.
      // (Driving 'change' goes through solid-ui's onChange, which detaches the
      // select before refresh — a quirk of its own DOM juggling in isolation.)
      for (const o of Array.from(select.options) as any[]) o.selected = (o.textContent.trim() === '* Create new *')
      select.refresh() // runs the mint path + renders the prefLabel subform

      // Complete the two-step mint: fill the prefLabel subform so solid-ui
      // commits the built statements (subject→concept, type, placement).
      const inputs = Array.from(container.querySelectorAll('input')) as any[]
      expect(inputs.length).toBeGreaterThan(0)
      for (const input of inputs) { input.value = 'Comics'; input.dispatchEvent(new Event('change', { bubbles: true })) }

      // A new concept was minted and placed in the scheme (typed + inScheme +
      // topConceptOf, from skosMintStatements). Identity comes from the
      // placement triples — solid-ui routes the dcat:theme value through
      // kb.sym(newObject), so it isn't the same node object.
      expect(store.any(REC, dcatTheme, null, DOC)).toBeTruthy() // a value was written
      const minted = store.statementsMatching(null, skos('inScheme'), node('Images'), DOC).map((s: any) => s.subject)[0]
      expect(minted).toBeTruthy()
      expect(store.holds(minted, ns.rdf('type'), skos('Concept'), DOC)).toBe(true)
      expect(store.holds(minted, skos('topConceptOf'), node('Images'), DOC)).toBe(true)
    } finally {
      document.body.removeChild(container)
      store.updater.editable = origEditable
      store.updater.update = origUpdate
    }
  })
})
